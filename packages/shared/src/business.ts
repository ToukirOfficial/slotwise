import { z } from 'zod';

/** Slugs that would clash with routes (/api/v1/public/manage/…, /b/…, /widget/…). */
export const RESERVED_SLUGS = new Set(['manage', 'api', 'admin', 'b', 'widget', 'public', 'docs', 'health']);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and single hyphens')
  .refine((s) => !RESERVED_SLUGS.has(s), 'That address is reserved');

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #2563eb');

export const SLOT_STEPS = [5, 10, 15, 20, 30, 60] as const;

export const businessSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    brandColor: z.string(),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    minNoticeMin: z.number().int(),
    maxDaysAhead: z.number().int(),
    slotStepMin: z.number().int(),
    cancelCutoffHours: z.number().int(),
    retentionMonths: z.number().int(),
    ownerNotifications: z.boolean(),
    isDemo: z.boolean(),
    live: z.boolean(),
  })
  .meta({ id: 'Business' });
export type Business = z.infer<typeof businessSchema>;

export const updateBusinessBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: slugSchema,
    brandColor: hexColorSchema,
    contactEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable(),
    contactPhone: z.string().trim().min(5).max(30).nullable(),
    minNoticeMin: z.number().int().min(0).max(10_080),
    maxDaysAhead: z.number().int().min(1).max(365),
    slotStepMin: z.union(SLOT_STEPS.map((s) => z.literal(s))),
    cancelCutoffHours: z.number().int().min(0).max(168),
    retentionMonths: z.number().int().min(1).max(120),
    ownerNotifications: z.boolean(),
  })
  .partial();
export type UpdateBusinessBody = z.infer<typeof updateBusinessBodySchema>;
