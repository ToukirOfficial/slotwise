/** Outbox event types and payloads. Payloads hold ids only — never personal data or secrets. */
export type OutboxEventPayload =
  | { type: 'auth.verify_email'; userId: string }
  | { type: 'auth.reset_password'; userId: string }
  | { type: 'auth.staff_invite'; userId: string }
  | { type: 'booking.created'; bookingId: string; version: number }
  | { type: 'booking.cancelled'; bookingId: string; version: number }
  | { type: 'booking.rescheduled'; bookingId: string; version: number };

export type OutboxEventType = OutboxEventPayload['type'];
