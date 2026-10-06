import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_JOB_OPTS } from './email-job-opts.js';
import { jobId } from './job-ids.js';
import { EMAIL_QUEUE, type EmailJob } from './queues.js';

const DAY_MS = 24 * 3600_000;

interface ReminderTarget {
  id: string;
  status: 'confirmed' | 'cancelled';
  startsAt: Date;
  version: number;
  /** When the current version was set (created, or last rescheduled). */
  changedAt: Date;
}

/**
 * Reminder emails are BullMQ delayed jobs (`reminder-<bookingId>`) that fire 24 h before the start.
 * PostgreSQL is the source of truth; Redis is never trusted alone: the hourly reconcile re-creates any
 * reminder that's missing (same job id, so it's a no-op when the job exists).
 */
@Injectable()
export class ReminderScheduler {
  private readonly log = new Logger('Reminders');

  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Make the reminder job match the booking: create, move or drop it. Safe to call any number of times. */
  async sync(b: ReminderTarget, now = Date.now()): Promise<void> {
    const id = jobId.reminder(b.id);
    const existing = await this.queue.getJob(id);
    if (existing) {
      if (b.status === 'confirmed' && existing.data.type === 'booking' && existing.data.version === b.version) return;
      // A job that is running right now can't be removed; it re-reads the booking and skips if stale.
      await existing.remove().catch(() => undefined);
    }
    if (b.status !== 'confirmed') return;

    const fireAt = b.startsAt.getTime() - DAY_MS;
    if (fireAt <= now) {
      // Booked (or moved) less than 24 h ahead: no reminder (PRD F7)…
      if (b.startsAt.getTime() - b.changedAt.getTime() < DAY_MS || b.startsAt.getTime() <= now) return;
      // …otherwise the reminder should already exist and was lost (e.g. Redis restart): send it now.
    }
    await this.queue.add(
      'booking',
      { type: 'booking', kind: 'reminder', bookingId: b.id, version: b.version },
      { ...EMAIL_JOB_OPTS, jobId: id, delay: Math.max(0, fireAt - now) },
    );
  }

  /** Hourly: every upcoming confirmed booking without a sent reminder gets its job back if Redis lost it. */
  async reconcile(now = Date.now()): Promise<number> {
    let checked = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.booking.findMany({
        where: {
          status: 'confirmed',
          startsAt: { gt: new Date(now) },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, status: true, startsAt: true, version: true, createdAt: true, updatedAt: true, emails: { where: { kind: 'reminder' }, select: { version: true } } },
        orderBy: { id: 'asc' },
        take: 500,
      });
      for (const b of page) {
        if (b.emails.some((e) => e.version === b.version)) continue; // already sent
        await this.sync({ ...b, changedAt: b.version === 1 ? b.createdAt : b.updatedAt }, now);
      }
      checked += page.length;
      if (page.length < 500) break;
      cursor = page.at(-1)?.id;
    }
    if (checked > 0) this.log.log(`reconciled reminders for ${checked} upcoming bookings`);
    return checked;
  }
}
