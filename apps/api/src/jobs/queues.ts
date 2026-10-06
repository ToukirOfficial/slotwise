/** Queue names (BullMQ prefix is QUEUE_PREFIX, i.e. `slotwise`). */
export const EMAIL_QUEUE = 'email';
export const WEBHOOK_QUEUE = 'webhook';
export const MAINTENANCE_QUEUE = 'maintenance';

export type AuthEmailKind = 'verify_email' | 'reset_password' | 'staff_invite';
export type BookingEmailKind = 'confirmation' | 'cancellation' | 'reschedule' | 'reminder' | 'owner_notice';

export type EmailJob =
  | { type: 'auth'; kind: AuthEmailKind; userId: string }
  | { type: 'booking'; kind: BookingEmailKind; bookingId: string; version: number; event?: string };

export interface WebhookJob {
  endpointId: string;
  /** The outbox event the delivery belongs to (null for test events). */
  outboxEventId: string | null;
  event: string;
  payload: Record<string, unknown>;
}

export type MaintenanceJobName = 'outbox-relay' | 'reminder-reconcile' | 'cleanup' | 'demo-reseed';
