import { Temporal } from 'temporal-polyfill';

/** All business-facing dates are in this zone (PRD: Europe/London only in v1). */
export const BUSINESS_ZONE = 'Europe/London';

export const todayIn = (zone: string, now: Temporal.Instant = Temporal.Now.instant()): Temporal.PlainDate =>
  now.toZonedDateTimeISO(zone).toPlainDate();

/** A Postgres `date` column ↔ PlainDate. Prisma maps `date` to a Date at UTC midnight. */
export const dateColumn = (d: Temporal.PlainDate | string): Date => new Date(`${d.toString()}T00:00:00Z`);
export const fromDateColumn = (d: Date): string => d.toISOString().slice(0, 10);

export const toInstant = (d: Date): Temporal.Instant => Temporal.Instant.fromEpochMilliseconds(d.getTime());
export const toDate = (i: Temporal.Instant): Date => new Date(i.epochMilliseconds);
