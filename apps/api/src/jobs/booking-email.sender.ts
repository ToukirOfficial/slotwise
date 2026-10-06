import { Inject, Injectable } from '@nestjs/common';
import { manageToken } from '../bookings/manage-token.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { buildIcs } from '../mail/ics.js';
import { MailService } from '../mail/mail.service.js';
import { renderEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EmailJob } from './queues.js';

type BookingJob = Extract<EmailJob, { type: 'booking' }>;

const ukDateTime = (d: Date) =>
  `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)} (UK time)`;

/**
 * Sends one booking email. At-least-once with deduplication:
 * 1. skip if `email_log` already has (booking, kind, version);
 * 2. skip if the booking changed since the job was queued (stale reminder or stale confirmation);
 * 3. send; 4. write the `email_log` row.
 * The only duplicate risk is a crash between 3 and 4 — documented in the README.
 */
@Injectable()
export class BookingEmailSender {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /** Returns what happened, for logs and tests. */
  async send(job: BookingJob): Promise<'sent' | 'skipped'> {
    const b = await this.prisma.booking.findUnique({
      where: { id: job.bookingId },
      include: { business: true, staff: true, customer: true },
    });
    if (!b || b.business.isDemo) return 'skipped'; // demo businesses never send email

    // Re-read, don't trust the job: a reminder for version 1 says nothing once the booking is on version 2.
    if (b.version !== job.version) return 'skipped';
    if (job.kind === 'reminder' && (b.status !== 'confirmed' || b.startsAt <= new Date())) return 'skipped';
    if (job.kind === 'cancellation' && b.status !== 'cancelled') return 'skipped';
    if ((job.kind === 'confirmation' || job.kind === 'reschedule') && b.status !== 'confirmed') return 'skipped';

    const already = await this.prisma.emailLog.findUnique({
      where: { bookingId_kind_version: { bookingId: b.id, kind: job.kind, version: job.version } },
    });
    if (already) return 'skipped';

    const when = ukDateTime(b.startsAt);
    const what = `${b.serviceName} with ${b.staff.displayName}`;
    const manageUrl = `${this.config.WEB_URL}/manage/${manageToken(this.config.MANAGE_TOKEN_SECRET, b.id)}`;
    const contact = [b.business.contactPhone, b.business.contactEmail].filter(Boolean).join(' · ');
    const footer = contact ? `${b.business.name} · ${contact}` : b.business.name;
    const fromAddress = /<([^>]+)>/.exec(this.config.MAIL_FROM)?.[1] ?? 'no-reply@slotwise.example';
    const ics = (method: 'REQUEST' | 'CANCEL', to: string) => ({
      method,
      content: buildIcs({
        method,
        uid: `${b.id}@slotwise`,
        sequence: b.version,
        start: b.startsAt,
        end: b.endsAt,
        summary: `${b.serviceName} — ${b.business.name}`,
        description: `${what}. Change or cancel: ${manageUrl}`,
        organizerName: b.business.name,
        organizerEmail: fromAddress,
        attendeeEmail: to,
      }),
    });

    if (job.kind === 'owner_notice') {
      const owners = await this.prisma.user.findMany({
        where: { businessId: b.businessId, role: 'owner', emailVerifiedAt: { not: null } },
        select: { email: true },
      });
      const verb = { 'booking.created': 'New booking', 'booking.cancelled': 'Cancelled', 'booking.rescheduled': 'Moved' }[
        job.event ?? 'booking.created'
      ];
      for (const o of owners) {
        await this.mail.send(
          renderEmail({
            to: o.email,
            subject: `${verb}: ${b.serviceName}, ${when}`,
            heading: `${verb}`,
            lines: [`${what}`, when, `Customer: ${b.customer.name ?? 'erased'}`],
            action: { label: 'Open in Slotwise', url: `${this.config.WEB_URL}/bookings/${b.id}` },
          }),
          'owner_notice',
        );
      }
      return this.logSent(b.id, job);
    }

    const to = b.customer.email;
    if (!to) return 'skipped'; // customer erased

    const name = b.customer.name ?? 'there';
    const msg =
      job.kind === 'confirmation'
        ? {
            ...renderEmail({
              to,
              subject: `Booked: ${b.serviceName}, ${when}`,
              heading: `You’re booked, ${name}`,
              lines: [what, when, 'The calendar invite is attached.'],
              action: { label: 'Change or cancel', url: manageUrl },
              footer,
            }),
            ics: ics('REQUEST', to),
          }
        : job.kind === 'reschedule'
          ? {
              ...renderEmail({
                to,
                subject: `Moved: ${b.serviceName}, now ${when}`,
                heading: 'Your booking has moved',
                lines: [what, `New time: ${when}`, 'The updated calendar invite is attached.'],
                action: { label: 'Change or cancel', url: manageUrl },
                footer,
              }),
              ics: ics('REQUEST', to),
            }
          : job.kind === 'reminder'
            ? renderEmail({
                to,
                subject: `Reminder: ${b.serviceName} tomorrow`,
                heading: `See you soon, ${name}`,
                lines: [what, when],
                action: { label: 'Change or cancel', url: manageUrl },
                footer,
              })
            : {
                ...renderEmail({
                  to,
                  subject: `Cancelled: ${b.serviceName}, ${when}`,
                  heading: 'Your booking is cancelled',
                  lines: [what, when],
                  footer,
                }),
                ics: ics('CANCEL', to),
              };
    await this.mail.send(msg, job.kind);
    return this.logSent(b.id, job);
  }

  private async logSent(bookingId: string, job: BookingJob): Promise<'sent'> {
    try {
      await this.prisma.emailLog.create({ data: { bookingId, kind: job.kind, version: job.version } });
    } catch (err) {
      // Two workers raced past the check: the row exists, which is all we need.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return 'sent';
  }
}
