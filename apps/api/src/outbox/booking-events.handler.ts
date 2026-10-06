import { Injectable } from '@nestjs/common';
import type { OutboxEventPayload } from './outbox.events.js';

type BookingEvent = Extract<OutboxEventPayload, { bookingId: string }>;

/** Fans a booking event out into email, reminder and webhook jobs. Filled in by the bookings/email phases. */
@Injectable()
export class BookingEventsHandler {
  async handle(_eventId: string, _businessId: string, _event: BookingEvent): Promise<void> {}
}
