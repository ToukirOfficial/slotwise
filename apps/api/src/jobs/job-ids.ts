/**
 * The only place job ids are built. BullMQ rejects custom ids containing ':' (it uses ':' in its own Redis
 * keys), so every id here uses hyphens. Same input → same id, which is what dedupes repeated enqueues.
 */
const part = (value: string | number): string => {
  const s = String(value);
  if (!/^[A-Za-z0-9-]+$/.test(s)) throw new Error(`Invalid job id part: ${s}`);
  return s;
};

export const jobId = {
  authEmail: (eventId: string) => `auth-email-${part(eventId)}`,
  confirmEmail: (bookingId: string, version: number) => `email-confirm-${part(bookingId)}-v${part(version)}`,
  cancelEmail: (bookingId: string, version: number) => `email-cancel-${part(bookingId)}-v${part(version)}`,
  rescheduleEmail: (bookingId: string, version: number) => `email-resched-${part(bookingId)}-v${part(version)}`,
  ownerEmail: (bookingId: string, version: number) => `email-owner-${part(bookingId)}-v${part(version)}`,
  reminder: (bookingId: string) => `reminder-${part(bookingId)}`,
  webhook: (eventId: string, endpointId: string) => `webhook-${part(eventId)}-${part(endpointId)}`,
  webhookResend: (deliveryId: string, at: number) => `webhook-resend-${part(deliveryId)}-${part(at)}`,
  webhookTest: (endpointId: string, at: number) => `webhook-test-${part(endpointId)}-${part(at)}`,
} as const;
