import { z } from 'zod';

/** Every error response has this shape; `errorCode` is stable and machine-readable. */
export const errorBodySchema = z
  .object({
    statusCode: z.number().int(),
    errorCode: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  })
  .meta({ id: 'Error' });
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  BAD_ORIGIN: 'BAD_ORIGIN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  DEMO_RESTRICTED: 'DEMO_RESTRICTED',
  SLUG_TAKEN: 'SLUG_TAKEN',
  CONFLICT: 'CONFLICT',
  SLOT_TAKEN: 'SLOT_TAKEN',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  BOOKING_LIMIT: 'BOOKING_LIMIT',
  BOOKING_NOT_CHANGEABLE: 'BOOKING_NOT_CHANGEABLE',
  CUTOFF_PASSED: 'CUTOFF_PASSED',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  WEBHOOK_URL_REJECTED: 'WEBHOOK_URL_REJECTED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const idSchema = z.uuid();
export const idParamsSchema = z.object({ id: z.uuid() });

/** Emails are compared lower-case; the API lower-cases every email it receives. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'Use at most 200 characters');
export const tokenSchema = z
  .string()
  .min(20)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * An instant in a response. Services return `Date`; the serializer turns it into an ISO string,
 * so the wire format (and the OpenAPI docs) is always a UTC ISO-8601 string.
 */
export const instantSchema = z.codec(z.date(), z.iso.datetime(), {
  decode: (d) => d.toISOString(),
  encode: (s) => new Date(s),
});

/** Local calendar date, e.g. 2026-10-25. */
export const localDateSchema = z.iso.date();

/** Cursor pagination: pass `nextCursor` back as `cursor`; null means the last page. */
export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const okSchema = z.object({ ok: z.literal(true) });
