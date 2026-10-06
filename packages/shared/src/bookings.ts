import { z } from 'zod';
import { emailSchema, instantSchema, localDateSchema } from './common.js';

export const bookingStatusSchema = z.enum(['confirmed', 'cancelled']);
export const bookingSourceSchema = z.enum(['widget', 'api', 'dashboard']);

/** Header required on booking create and reschedule: the same key + body returns the first result. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use 8–100 letters, numbers, - or _');

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: z.string().trim().min(5).max(30).regex(/^[0-9+()\s-]+$/, 'Use digits, spaces and + ( ) -'),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const createBookingBodySchema = z.object({
  serviceId: z.uuid(),
  staffId: z.union([z.uuid(), z.literal('any')]).default('any'),
  startsAt: z.iso.datetime({ offset: true }),
  customer: customerInputSchema,
});
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;

export const rescheduleBodySchema = z.object({ startsAt: z.iso.datetime({ offset: true }) });
export type RescheduleBody = z.infer<typeof rescheduleBodySchema>;

export const cancelBodySchema = z.object({ reason: z.string().trim().max(500).optional() });
export type CancelBody = z.infer<typeof cancelBodySchema>;

export const bookingSchema = z
  .object({
    id: z.uuid(),
    status: bookingStatusSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    version: z.number().int(),
    source: bookingSourceSchema,
    staff: z.object({ id: z.uuid(), displayName: z.string() }),
    /** Snapshot taken when the booking was made: later service edits don't change it. */
    service: z.object({
      id: z.uuid(),
      name: z.string(),
      durationMin: z.number().int(),
      bufferBeforeMin: z.number().int(),
      bufferAfterMin: z.number().int(),
      pricePence: z.number().int(),
    }),
    /** Null fields after the customer's data was erased. */
    customer: z.object({
      id: z.uuid(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    /** A confirmed booking that no longer falls inside the staff member's working hours. */
    outsideHours: z.boolean(),
    cancelledAt: instantSchema.nullable(),
    cancelReason: z.string().nullable(),
    createdAt: instantSchema,
  })
  .meta({ id: 'Booking' });
export type Booking = z.output<typeof bookingSchema>;

export const bookingListQuerySchema = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  staffId: z.uuid().optional(),
  status: bookingStatusSchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

/** What the widget gets back: no customer details, no internal ids beyond the booking's own. */
export const publicBookingSchema = z
  .object({
    id: z.uuid(),
    status: bookingStatusSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    serviceName: z.string(),
    staffName: z.string(),
  })
  .meta({ id: 'PublicBooking' });
export type PublicBooking = z.output<typeof publicBookingSchema>;

export const auditEntrySchema = z
  .object({
    id: z.uuid(),
    actorType: z.enum(['user', 'customer', 'api_key', 'system']),
    actorId: z.string().nullable(),
    action: z.string(),
    entity: z.string(),
    entityId: z.string(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    at: instantSchema,
  })
  .meta({ id: 'AuditEntry' });
export type AuditEntry = z.output<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  entity: z.string().max(40).optional(),
  entityId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
