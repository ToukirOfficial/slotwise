import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { WebhookPayload } from '@slotwise/shared';
import type { Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { decrypt } from '../common/crypto.js';
import { uuidv7 } from '../common/ids.js';
import { WEBHOOK_QUEUE, type WebhookJob } from '../jobs/queues.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { WebhookSender } from './webhook-sender.js';

/** 8 attempts over about 23 hours: 1 m, 5 m, 30 m, 1 h, 3 h, 6 h, 12 h between them. */
export const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 3_600_000, 10_800_000, 21_600_000, 43_200_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export const WEBHOOK_JOB_OPTS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'custom' },
  // Kept a day so re-processing an outbox event (crash window) can't enqueue the same delivery again.
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

export const backoffStrategy = (attemptsMade: number): number =>
  RETRY_DELAYS_MS[Math.min(attemptsMade, RETRY_DELAYS_MS.length) - 1] ?? RETRY_DELAYS_MS[0]!;

/** Builds payloads and performs (and logs) delivery attempts. Payloads carry ids and times only. */
@Injectable()
export class WebhookDeliveryService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookSender) private readonly sender: WebhookSender,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJob>,
  ) {}

  async bookingPayload(db: Tx | PrismaService, eventId: string, type: WebhookPayload['type'], bookingId: string): Promise<WebhookPayload> {
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { staff: { select: { displayName: true } } } });
    return {
      id: eventId,
      type,
      createdAt: new Date().toISOString(),
      data: {
        booking: {
          id: b.id,
          status: b.status,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          version: b.version,
          serviceId: b.serviceId,
          serviceName: b.serviceName,
          staffId: b.staffId,
          staffName: b.staff.displayName,
          customerId: b.customerId,
        },
      },
    };
  }

  testPayload(): WebhookPayload {
    return { id: `test-${uuidv7()}`, type: 'webhook.test', createdAt: new Date().toISOString(), data: { booking: null } };
  }

  enqueue(job: WebhookJob, jobId: string) {
    return this.queue.add('deliver', job, { ...WEBHOOK_JOB_OPTS, jobId });
  }

  /**
   * One attempt, logged as one row. Throws on failure so BullMQ schedules the next try (custom backoff);
   * the row records when that will be. A deleted or switched-off endpoint is skipped silently.
   */
  async attempt(job: WebhookJob, attempt: number): Promise<{ ok: boolean }> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: job.endpointId }, include: { business: { select: { isDemo: true } } } });
    if (!endpoint || !endpoint.active || endpoint.business.isDemo) return { ok: true };

    const body = JSON.stringify(job.payload);
    const result = await this.sender.post(endpoint.url, decrypt(endpoint.secretEncrypted, this.config.ENCRYPTION_KEY), body);
    const willRetry = !result.ok && attempt < MAX_ATTEMPTS;
    await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        outboxEventId: job.outboxEventId,
        event: job.event,
        payloadJson: JSON.parse(body),
        attempt,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        error: result.error,
        responseExcerpt: result.responseExcerpt,
        nextRetryAt: willRetry ? new Date(Date.now() + backoffStrategy(attempt)) : null,
      },
    });
    if (!result.ok) throw new Error(`webhook delivery failed: ${result.error ?? 'unknown'}`);
    return { ok: true };
  }
}
