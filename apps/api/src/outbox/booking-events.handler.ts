import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EMAIL_JOB_OPTS } from '../jobs/email-job-opts.js';
import { jobId } from '../jobs/job-ids.js';
import { EMAIL_QUEUE, type EmailJob } from '../jobs/queues.js';
import { ReminderScheduler } from '../jobs/reminder.scheduler.js';
import type { Tx } from '../prisma/prisma.service.js';
import type { OutboxEventPayload } from './outbox.events.js';
import { WebhookFanout } from './webhook-fanout.js';

type BookingEvent = Extract<OutboxEventPayload, { bookingId: string }>;

/**
 * Turns one booking event into jobs: the customer's email, the owner's notice, the reminder, webhooks.
 * Every job id is deterministic, so running this twice for the same event enqueues each job once.
 * Reads go through the caller's transaction (no second pool connection).
 */
@Injectable()
export class BookingEventsHandler {
  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJob>,
    @Inject(ReminderScheduler) private readonly reminders: ReminderScheduler,
    @Inject(WebhookFanout) private readonly webhooks: WebhookFanout,
  ) {}

  async handle(tx: Tx, eventId: string, businessId: string, event: BookingEvent): Promise<void> {
    const { bookingId, version } = event;
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, startsAt: true, version: true, createdAt: true, updatedAt: true },
    });
    if (!booking) return;
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { ownerNotifications: true } });

    const customerJob = {
      'booking.created': { kind: 'confirmation', id: jobId.confirmEmail(bookingId, version) },
      'booking.cancelled': { kind: 'cancellation', id: jobId.cancelEmail(bookingId, version) },
      'booking.rescheduled': { kind: 'reschedule', id: jobId.rescheduleEmail(bookingId, version) },
    }[event.type];
    await this.emailQueue.add(
      'booking',
      { type: 'booking', kind: customerJob.kind as 'confirmation' | 'cancellation' | 'reschedule', bookingId, version },
      { ...EMAIL_JOB_OPTS, jobId: customerJob.id },
    );
    if (business.ownerNotifications) {
      await this.emailQueue.add(
        'booking',
        { type: 'booking', kind: 'owner_notice', bookingId, version, event: event.type },
        { ...EMAIL_JOB_OPTS, jobId: jobId.ownerEmail(bookingId, version) },
      );
    }
    await this.reminders.sync({ ...booking, changedAt: booking.version === 1 ? booking.createdAt : booking.updatedAt });
    await this.webhooks.fanOut(tx, eventId, businessId, event);
  }
}
