import { z } from 'zod';
import { instantSchema, localDateSchema } from './common.js';
import { MAX_RANGE_DAYS } from './availability.js';
import { bookingStatusSchema } from './bookings.js';

/** The token in a manage link: 256 bits, base64url (43 characters). */
export const manageParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export const manageViewSchema = z
  .object({
    booking: z.object({
      id: z.uuid(),
      status: bookingStatusSchema,
      startsAt: instantSchema,
      endsAt: instantSchema,
      serviceName: z.string(),
      staffName: z.string(),
      durationMin: z.number().int(),
    }),
    business: z.object({
      name: z.string(),
      brandColor: z.string(),
      contactEmail: z.string().nullable(),
      contactPhone: z.string().nullable(),
      cancelCutoffHours: z.number().int(),
    }),
    /** Why the customer can't change it online any more (null = they can). */
    blockedReason: z.enum(['cancelled', 'started', 'cutoff']).nullable(),
  })
  .meta({ id: 'ManageView' });
export type ManageView = z.output<typeof manageViewSchema>;

const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

export const manageAvailabilityQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((q) => daysBetween(q.from, q.to) >= 0 && daysBetween(q.from, q.to) < MAX_RANGE_DAYS, {
    message: `Choose up to ${MAX_RANGE_DAYS} days`,
    path: ['to'],
  });
