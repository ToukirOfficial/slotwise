import { Inject, Injectable } from '@nestjs/common';
import { jobId } from '../jobs/job-ids.js';
import type { Tx } from '../prisma/prisma.service.js';
import { WebhookDeliveryService } from '../webhooks/delivery.service.js';
import type { OutboxEventPayload } from './outbox.events.js';

/** One delivery job per subscribed endpoint, id `webhook-<eventId>-<endpointId>` (so it's enqueued once). */
@Injectable()
export class WebhookFanout {
  constructor(@Inject(WebhookDeliveryService) private readonly deliveries: WebhookDeliveryService) {}

  async fanOut(tx: Tx, eventId: string, businessId: string, event: Extract<OutboxEventPayload, { bookingId: string }>): Promise<void> {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { businessId, active: true, events: { has: event.type }, business: { isDemo: false } },
      select: { id: true },
    });
    if (endpoints.length === 0) return;
    const payload = await this.deliveries.bookingPayload(tx, eventId, event.type, event.bookingId);
    for (const e of endpoints) {
      await this.deliveries.enqueue(
        { endpointId: e.id, outboxEventId: eventId, event: event.type, payload },
        jobId.webhook(eventId, e.id),
      );
    }
  }
}
