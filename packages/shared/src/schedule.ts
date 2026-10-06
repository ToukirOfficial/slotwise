import { z } from 'zod';
import { localDateSchema } from './common.js';

/** Minutes since local midnight: 0 = 00:00, 540 = 09:00, 1440 = end of day. Never UTC. */
export const minuteOfDaySchema = z.number().int().min(0).max(1440);

export const windowSchema = z
  .object({ startMin: minuteOfDaySchema, endMin: minuteOfDaySchema })
  .refine((w) => w.startMin < w.endMin, { message: 'Start must be before end', path: ['endMin'] });
export type TimeWindow = z.infer<typeof windowSchema>;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekdaySchema = z.number().int().min(1).max(7);

export const weeklyHoursEntrySchema = z
  .object({ weekday: weekdaySchema, startMin: minuteOfDaySchema, endMin: minuteOfDaySchema })
  .refine((w) => w.startMin < w.endMin, { message: 'Start must be before end', path: ['endMin'] });

export const weeklyHoursSchema = z.object({ hours: z.array(weeklyHoursEntrySchema) }).meta({ id: 'WeeklyHours' });
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

/** PUT replaces the whole week. Windows on the same weekday may not overlap. */
export const putWeeklyHoursBodySchema = z.object({
  hours: z
    .array(weeklyHoursEntrySchema)
    .max(70)
    .superRefine((hours, ctx) => {
      const byDay = new Map<number, { startMin: number; endMin: number }[]>();
      for (const h of hours) byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), h]);
      for (const [day, list] of byDay) {
        const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i]!.startMin < sorted[i - 1]!.endMin) {
            ctx.addIssue({ code: 'custom', message: `Windows on weekday ${day} overlap`, path: ['hours'] });
            return;
          }
        }
      }
    }),
});
export type PutWeeklyHoursBody = z.infer<typeof putWeeklyHoursBodySchema>;

export const dateOverrideSchema = z
  .object({
    id: z.uuid(),
    date: localDateSchema,
    closed: z.boolean(),
    startMin: z.number().int().nullable(),
    endMin: z.number().int().nullable(),
  })
  .meta({ id: 'DateOverride' });
export type DateOverride = z.infer<typeof dateOverrideSchema>;

export const createOverrideBodySchema = z.discriminatedUnion('closed', [
  z.object({ date: localDateSchema, closed: z.literal(true) }),
  z
    .object({ date: localDateSchema, closed: z.literal(false), startMin: minuteOfDaySchema, endMin: minuteOfDaySchema })
    .refine((w) => w.startMin < w.endMin, { message: 'Start must be before end', path: ['endMin'] }),
]);
export type CreateOverrideBody = z.infer<typeof createOverrideBodySchema>;

export const overrideListQuerySchema = z.object({ from: localDateSchema.optional(), to: localDateSchema.optional() });

export const staffIdParamsSchema = z.object({ id: z.uuid() });
export const overrideParamsSchema = z.object({ id: z.uuid(), overrideId: z.uuid() });

/** "09:00" ↔ 540. */
export const minutesToHhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMinutes = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
