import { Injectable } from '@nestjs/common';
import type { Tx } from '../prisma/prisma.service.js';
import type { OutboxEventPayload } from './outbox.events.js';

/** Enqueues one delivery per subscribed webhook endpoint. Endpoints arrive in the developer-API phase. */
@Injectable()
export class WebhookFanout {
  async fanOut(_tx: Tx, _eventId: string, _businessId: string, _event: Extract<OutboxEventPayload, { bookingId: string }>): Promise<void> {}
}
