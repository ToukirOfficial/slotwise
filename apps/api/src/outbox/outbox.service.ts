import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { jobId } from '../jobs/job-ids.js';
import { EMAIL_QUEUE, type EmailJob } from '../jobs/queues.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { BookingEventsHandler } from './booking-events.handler.js';
import type { OutboxEventPayload } from './outbox.events.js';

interface OutboxRow {
  id: string;
  business_id: string;
  payload_json: OutboxEventPayload;
}

export const EMAIL_JOB_OPTS = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 30_000 },
  // Completed jobs are removed: the email_log table (not Redis) is the record of what was sent.
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

/**
 * Outbox pattern: a change and its event are committed together (add() inside the caller's transaction).
 * After commit, dispatchSoon() turns events into jobs (fast path); the worker's relay does the same every few
 * seconds for anything the fast path missed (crash, Redis down). Job ids are deterministic, so doing it twice
 * enqueues once.
 */
@Injectable()
export class OutboxService {
  private readonly log = new Logger('Outbox');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJob>,
    @Inject(BookingEventsHandler) private readonly bookingEvents: BookingEventsHandler,
  ) {}

  /** Writes the event in the caller's transaction. Returns its id for dispatchSoon(). */
  async add(tx: Tx, businessId: string, event: OutboxEventPayload): Promise<string> {
    const row = await tx.outboxEvent.create({ data: { businessId, type: event.type, payloadJson: event } });
    return row.id;
  }

  /** Fast path, after commit. Never throws: the relay is the safety net. */
  dispatchSoon(ids: string[]): void {
    if (ids.length === 0) return;
    this.claimAndProcess(ids).catch((err: unknown) =>
      this.log.warn(`fast-path dispatch failed, relay will retry: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /** Relay: processes up to `limit` unprocessed events, oldest first. Returns how many were processed. */
  relay(limit = 50): Promise<number> {
    return this.claimAndProcess(null, limit);
  }

  private async claimAndProcess(ids: string[] | null, limit = 50): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // SKIP LOCKED: a relay run and a fast-path dispatch never process the same row at the same time.
        const rows = ids
          ? await tx.$queryRaw<OutboxRow[]>`
              SELECT id, business_id, payload_json FROM outbox_events
              WHERE id = ANY(${ids}::uuid[]) AND processed_at IS NULL
              FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw<OutboxRow[]>`
              SELECT id, business_id, payload_json FROM outbox_events
              WHERE processed_at IS NULL
              ORDER BY created_at
              LIMIT ${limit}
              FOR UPDATE SKIP LOCKED`;
        for (const row of rows) await this.handle(row);
        if (rows.length > 0) {
          await tx.$executeRaw`UPDATE outbox_events SET processed_at = now(), updated_at = now()
                               WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])`;
        }
        return rows.length;
      },
      { timeout: 30_000 },
    );
  }

  /** Turns one event into jobs. Must be safe to run more than once for the same event. */
  private async handle(row: OutboxRow): Promise<void> {
    const event = row.payload_json;
    switch (event.type) {
      case 'auth.verify_email':
      case 'auth.reset_password':
      case 'auth.staff_invite': {
        const kind = event.type.slice('auth.'.length) as 'verify_email' | 'reset_password' | 'staff_invite';
        await this.emailQueue.add(
          'auth',
          { type: 'auth', kind, userId: event.userId },
          { ...EMAIL_JOB_OPTS, jobId: jobId.authEmail(row.id) },
        );
        return;
      }
      case 'booking.created':
      case 'booking.cancelled':
      case 'booking.rescheduled':
        await this.bookingEvents.handle(row.id, row.business_id, event);
        return;
    }
  }
}
