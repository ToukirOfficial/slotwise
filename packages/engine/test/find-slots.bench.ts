import { Temporal } from 'temporal-polyfill';
import { expect, test } from 'vitest';
import { findSlots } from '../src/index.js';

// One staff member, 30 days, 09:00–17:00 Mon–Sat, 15-minute grid, ~4 bookings a day already in the diary.
const busy = Array.from({ length: 30 * 4 }, (_, i) => {
  const day = Math.floor(i / 4);
  const start = Temporal.Instant.from('2026-11-02T09:00:00Z').add({ hours: day * 24 + (i % 4) * 2 });
  return { start, end: start.add({ minutes: 60 }) };
});

const run = () =>
  findSlots({
    zone: 'Europe/London',
    fromDate: '2026-11-02',
    toDate: '2026-12-01',
    now: Temporal.Instant.from('2026-11-01T00:00:00Z'),
    weeklyHours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 })),
    overrides: [],
    busy,
    service: { durationMin: 45, bufferBeforeMin: 5, bufferAfterMin: 10 },
    rules: { minNoticeMin: 120, maxDaysAhead: 60, slotStepMin: 15 },
  });

test('findSlots: 1 staff, 30 days, 15-minute step', async ({ bench }) => {
  const result = await bench('findSlots', run).run();
  // PRD F4: < 200 ms for engine + one indexed query. The engine alone gets most of that budget at most.
  expect(result.latency.mean).toBeLessThan(150);
});
