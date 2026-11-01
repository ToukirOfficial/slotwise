import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { DEMO_FUTURE_DAYS, DEMO_PAST_DAYS, DEMO_SLUG, seedDemo } from '../src/demo/seed.js';
import { resetDb, startApp, type TestApp } from './helpers.js';

const ZONE = 'Europe/London';
let t: TestApp;
let config: AppConfig;
beforeAll(async () => {
  t = await startApp();
  config = t.app.get(APP_CONFIG);
});
afterAll(() => t.close());
beforeEach(() => resetDb(t.prisma));

/** Midnight UK time at the start of `date`, as a Date. */
const ukMidnight = (date: Temporal.PlainDate) => new Date(date.toZonedDateTime(ZONE).epochMilliseconds);

const seedAt = async (iso: string) => {
  const now = Temporal.Instant.from(iso);
  await seedDemo(t.prisma, config.MANAGE_TOKEN_SECRET, now);
  const business = await t.prisma.business.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
  const bookings = await t.prisma.booking.findMany({ where: { businessId: business.id }, orderBy: { startsAt: 'asc' } });
  return { now: new Date(now.epochMilliseconds), today: now.toZonedDateTimeISO(ZONE).toPlainDate(), bookings };
};

describe('demo seed date range', () => {
  it('covers the past 7 days and the next 14: past ones mostly happened, two cancelled, future ones confirmed', async () => {
    // Sunday 1 Nov 2026: the past week starts on 25 Oct, the day the clocks went back.
    const { now, today, bookings } = await seedAt('2026-11-01T12:00:00Z');

    const first = ukMidnight(today.subtract({ days: DEMO_PAST_DAYS }));
    const end = ukMidnight(today.add({ days: DEMO_FUTURE_DAYS + 1 }));
    expect(bookings.length).toBeGreaterThan(30);
    for (const b of bookings) {
      expect(b.startsAt.getTime()).toBeGreaterThanOrEqual(first.getTime());
      expect(b.startsAt.getTime()).toBeLessThan(end.getTime());
    }

    const past = bookings.filter((b) => b.startsAt < now);
    const future = bookings.filter((b) => b.startsAt >= now);
    const cancelled = past.filter((b) => b.status === 'cancelled');
    expect(cancelled).toHaveLength(2);
    expect(past.length - cancelled.length).toBeGreaterThan(cancelled.length * 4); // mostly completed
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((b) => b.status === 'confirmed')).toBe(true);
    for (const b of cancelled) expect(b.cancelledAt!.getTime()).toBeLessThan(b.startsAt.getTime());

    // Spread over the week, not bunched on one day, and nobody is booked "in the future" from the past.
    const pastDays = new Set(past.map((b) => b.startsAt.toISOString().slice(0, 10)));
    expect(pastDays.size).toBeGreaterThanOrEqual(5);
    for (const b of bookings) expect(b.createdAt.getTime()).toBeLessThanOrEqual(Math.min(b.startsAt.getTime(), now.getTime()));

    // Sunday afternoon: this week's bookings are all over, so the dashboard opens on next week,
    // whose first upcoming booking is on Monday 2 Nov.
    const sunday = today; // 2026-11-01
    const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.startsAt > now);
    expect(upcoming.filter((b) => b.startsAt < ukMidnight(sunday.add({ days: 1 })))).toHaveLength(0);
    expect(upcoming[0]!.startsAt.getTime()).toBeGreaterThanOrEqual(ukMidnight(sunday.add({ days: 1 })).getTime());
    expect(upcoming[0]!.startsAt.getTime()).toBeLessThan(ukMidnight(sunday.add({ days: 2 })).getTime());
  });

  it('writes the audit trail the dashboard shows: every booking was booked, cancellations and one move are recorded', async () => {
    const { now, bookings } = await seedAt('2026-11-01T12:00:00Z');
    const entries = await t.prisma.auditLog.findMany({ where: { entity: 'booking' } });
    const actions = (id: string) => entries.filter((e) => e.entityId === id).map((e) => e.action);

    for (const b of bookings) expect(actions(b.id)[0]).toBe('booking.created');
    for (const b of bookings.filter((x) => x.status === 'cancelled')) expect(actions(b.id)).toContain('booking.cancelled');
    const moved = bookings.filter((b) => actions(b.id).includes('booking.rescheduled'));
    expect(moved).toHaveLength(1);
    expect(moved[0]!.startsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(moved[0]!.version).toBe(2);
    // History never runs ahead of the clock.
    for (const e of entries) expect(e.at.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it.each([
    ['Monday morning', '2026-11-02T07:00:00Z'],
    ['Wednesday afternoon', '2026-11-04T15:00:00Z'],
    ['Sunday night', '2026-11-08T23:00:00Z'],
  ])('the dashboard always has an upcoming week to open on: this week or next (%s)', async (_label, iso) => {
    const { now, today, bookings } = await seedAt(iso);
    const monday = today.subtract({ days: today.dayOfWeek - 1 });
    const endOfNextWeek = ukMidnight(monday.add({ days: 14 }));
    const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.startsAt > now && b.startsAt < endOfNextWeek);
    expect(upcoming.length).toBeGreaterThan(0);
  });
});
