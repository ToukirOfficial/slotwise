import { z } from 'zod';
import { localDateSchema } from './common.js';

export const MAX_RANGE_DAYS = 60;

const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** `from`/`to` are local dates in the business zone (inclusive), at most 60 days. */
export const availabilityQuerySchema = z
  .object({
    serviceId: z.uuid(),
    staffId: z.union([z.uuid(), z.literal('any')]).default('any'),
    from: localDateSchema,
    to: localDateSchema,
  })
  .refine((q) => daysBetween(q.from, q.to) >= 0, { message: '`to` must not be before `from`', path: ['to'] })
  .refine((q) => daysBetween(q.from, q.to) < MAX_RANGE_DAYS, {
    message: `At most ${MAX_RANGE_DAYS} days at a time`,
    path: ['to'],
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const slotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** Wall-clock time in the business zone, e.g. "09:15" (label it "UK time"). */
  localTime: z.string(),
});
export type Slot = z.infer<typeof slotSchema>;

export const availabilitySchema = z
  .object({
    zone: z.string(),
    serviceId: z.uuid(),
    staffId: z.uuid().nullable(),
    days: z.array(z.object({ date: localDateSchema, slots: z.array(slotSchema) })),
  })
  .meta({ id: 'Availability' });
export type Availability = z.infer<typeof availabilitySchema>;

export const publicBusinessSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    brandColor: z.string(),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    services: z.array(
      z.object({ id: z.uuid(), name: z.string(), durationMin: z.number().int(), pricePence: z.number().int() }),
    ),
    staff: z.array(z.object({ id: z.uuid(), displayName: z.string(), serviceIds: z.array(z.uuid()) })),
  })
  .meta({ id: 'PublicBusiness' });
export type PublicBusiness = z.infer<typeof publicBusinessSchema>;

export const slugParamsSchema = z.object({ slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/) });
