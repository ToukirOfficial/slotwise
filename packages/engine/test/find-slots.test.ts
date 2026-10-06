import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  type FindSlotsInput,
  findSlots,
  isOfferedStart,
  isWithinWorkingHours,
  localToEpochMs,
  type SlotDay,
} from '../src/index.js';

const ZONE = 'Europe/London';
const at = (iso: string) => Temporal.Instant.from(iso);
const everyDay = (startMin: number, endMin: number) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin, endMin }));
const H = (h: number, m = 0) => h * 60 + m;

/** 2026-12-01 is a Tuesday in winter (GMT = UTC), which keeps the non-DST tests easy to read. */
const input = (over: Partial<FindSlotsInput> = {}): FindSlotsInput => ({
  zone: ZONE,
  fromDate: '2026-12-01',
  toDate: '2026-12-01',
  now: at('2026-11-01T00:00:00Z'),
  weeklyHours: everyDay(H(9), H(17)),
  overrides: [],
  busy: [],
  service: { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 },
  rules: { minNoticeMin: 0, maxDaysAhead: 365, slotStepMin: 60 },
  ...over,
});
const withRules = (rules: Partial<FindSlotsInput['rules']>, over: Partial<FindSlotsInput> = {}) =>
  input({ ...over, rules: { ...input().rules, ...rules } });
const withService = (service: Partial<FindSlotsInput['service']>, over: Partial<FindSlotsInput> = {}) =>
  input({ ...over, service: { ...input().service, ...service } });

const labels = (days: SlotDay[], date?: string) =>
  (date ? days.find((d) => d.date === date) : days[0])?.slots.map((s) => s.localTime) ?? [];
const busy = (start: string, end: string) => ({ start: at(start), end: at(end) });

describe('basic windows', () => {
  it('offers every start that fits a single window', () => {
    expect(labels(findSlots(input()))).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('uses the slot step for the grid, but never past the end of the window', () => {
    const l = labels(findSlots(withRules({ slotStepMin: 15 })));
    expect(l[0]).toBe('09:00');
    expect(l[1]).toBe('09:15');
    expect(l.at(-1)).toBe('16:00');
    expect(l).toHaveLength(29);
  });

  it('anchors the grid at the start of the window', () => {
    const l = labels(findSlots(withRules({ slotStepMin: 20 }, { weeklyHours: everyDay(H(9, 10), H(11)) })));
    expect(l).toEqual(['09:10', '09:30', '09:50']);
  });

  it('returns UTC instants: in winter UK time equals UTC', () => {
    const [slot] = findSlots(input())[0]!.slots;
    expect(slot).toEqual({ startsAt: '2026-12-01T09:00:00.000Z', endsAt: '2026-12-01T10:00:00.000Z', localTime: '09:00' });
  });

  it('returns UTC instants: in summer 09:00 UK time is 08:00 UTC', () => {
    const [slot] = findSlots(input({ fromDate: '2026-06-01', toDate: '2026-06-01', now: at('2026-05-01T00:00:00Z') }))[0]!
      .slots;
    expect(slot!.startsAt).toBe('2026-06-01T08:00:00.000Z');
    expect(slot!.localTime).toBe('09:00');
  });

  it('endsAt is start + duration (buffers are not part of the appointment)', () => {
    const [slot] = findSlots(withService({ durationMin: 45, bufferAfterMin: 15 }))[0]!.slots;
    expect(slot!.endsAt).toBe('2026-12-01T09:45:00.000Z');
  });

  it('handles split shifts: nothing runs into the break', () => {
    const l = labels(
      findSlots(
        withRules(
          { slotStepMin: 30 },
          {
            weeklyHours: [
              { weekday: 2, startMin: H(9), endMin: H(12) },
              { weekday: 2, startMin: H(13), endMin: H(17) },
            ],
          },
        ),
      ),
    );
    expect(l).toContain('11:00');
    expect(l).not.toContain('11:30');
    expect(l).not.toContain('12:00');
    expect(l).not.toContain('12:30');
    expect(l).toContain('13:00');
  });

  it('a window ending at midnight (1440) works', () => {
    expect(labels(findSlots(input({ weeklyHours: everyDay(H(22), 1440) })))).toEqual(['22:00', '23:00']);
  });

  it('a day without hours has no slots but is still listed', () => {
    const days = findSlots(input({ weeklyHours: [{ weekday: 1, startMin: H(9), endMin: H(17) }] }));
    expect(days).toEqual([{ date: '2026-12-01', slots: [] }]);
  });

  it('groups by local date, inclusive of both ends', () => {
    const days = findSlots(input({ toDate: '2026-12-07' }));
    expect(days.map((d) => d.date)).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
    ]);
  });

  it('rejects a reversed date range and a zero step', () => {
    expect(() => findSlots(input({ fromDate: '2026-12-02', toDate: '2026-12-01' }))).toThrow(RangeError);
    expect(() => findSlots(withRules({ slotStepMin: 0 }))).toThrow(RangeError);
  });
});

describe('buffers', () => {
  it('buffer before must fit inside the window', () => {
    const l = labels(findSlots(withService({ bufferBeforeMin: 15 }, { rules: { ...input().rules, slotStepMin: 15 } })));
    expect(l[0]).toBe('09:15');
  });

  it('buffer after must fit inside the window', () => {
    const l = labels(findSlots(withService({ bufferAfterMin: 15 }, { rules: { ...input().rules, slotStepMin: 15 } })));
    expect(l.at(-1)).toBe('15:45');
  });

  it("the new booking's own buffers can't overlap an existing booking", () => {
    const days = findSlots(
      withService({ bufferAfterMin: 15 }, { busy: [busy('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')] }),
    );
    // 09:00 + 60 + 15 = 10:15 > 10:00
    expect(labels(days)).not.toContain('09:00');
  });
});

describe('existing bookings (busy)', () => {
  const day = (b: ReturnType<typeof busy>[]) =>
    labels(findSlots(withRules({ slotStepMin: 30 }, { busy: b })));

  it('blocks every start that would overlap', () => {
    const l = day([busy('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')]);
    expect(l).toContain('09:00');
    expect(l).not.toContain('09:30');
    expect(l).not.toContain('10:00');
    expect(l).not.toContain('10:30');
    expect(l).toContain('11:00');
  });

  it('touching is fine: [start, end) ranges', () => {
    const l = day([busy('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')]);
    expect(l).toContain('09:00'); // ends exactly at 10:00
    expect(l).toContain('11:00'); // starts exactly at 11:00
  });

  it('copes with unsorted and overlapping busy intervals', () => {
    const l = day([
      busy('2026-12-01T14:00:00Z', '2026-12-01T15:00:00Z'),
      busy('2026-12-01T10:00:00Z', '2026-12-01T11:30:00Z'),
      busy('2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z'),
    ]);
    expect(l).toEqual(['09:00', '12:00', '12:30', '13:00', '15:00', '15:30', '16:00']);
  });

  it('busy time on another day changes nothing', () => {
    expect(day([busy('2026-12-02T09:00:00Z', '2026-12-02T17:00:00Z')])).toHaveLength(15);
  });

  it('a whole-day busy block leaves no slots', () => {
    expect(day([busy('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')])).toEqual([]);
  });
});

describe('notice and horizon', () => {
  it('drops starts inside the minimum notice', () => {
    const l = labels(findSlots(withRules({ minNoticeMin: 120, slotStepMin: 30 }, { now: at('2026-12-01T09:20:00Z') })));
    expect(l[0]).toBe('11:30');
  });

  it('never offers a start in the past, even with zero notice', () => {
    const l = labels(findSlots(withRules({ slotStepMin: 30 }, { now: at('2026-12-01T13:01:00Z') })));
    expect(l[0]).toBe('13:30');
  });

  it('stops at today + maxDaysAhead (by local date)', () => {
    const days = findSlots(
      withRules({ maxDaysAhead: 2 }, { now: at('2026-12-01T08:00:00Z'), toDate: '2026-12-05' }),
    );
    expect(days.map((d) => d.slots.length > 0)).toEqual([true, true, true, false, false]);
  });

  it('maxDaysAhead 0 means today only', () => {
    const days = findSlots(withRules({ maxDaysAhead: 0 }, { now: at('2026-12-01T06:00:00Z'), toDate: '2026-12-02' }));
    expect(days.map((d) => d.slots.length > 0)).toEqual([true, false]);
  });
});

describe('date overrides', () => {
  it('a closed date has no slots; other dates keep their weekly hours', () => {
    const days = findSlots(
      input({ toDate: '2026-12-02', overrides: [{ date: '2026-12-01', closed: true, startMin: null, endMin: null }] }),
    );
    expect(days[0]!.slots).toEqual([]);
    expect(days[1]!.slots).toHaveLength(8);
  });

  it('different hours replace the weekly hours for that date', () => {
    const l = labels(findSlots(input({ overrides: [{ date: '2026-12-01', closed: false, startMin: H(10), endMin: H(13) }] })));
    expect(l).toEqual(['10:00', '11:00', '12:00']);
  });

  it('several override windows on one date (split hours)', () => {
    const l = labels(
      findSlots(
        input({
          overrides: [
            { date: '2026-12-01', closed: false, startMin: H(14), endMin: H(16) },
            { date: '2026-12-01', closed: false, startMin: H(8), endMin: H(9) },
          ],
        }),
      ),
    );
    expect(l).toEqual(['08:00', '14:00', '15:00']);
  });

  it('an override can open a day that has no weekly hours', () => {
    const l = labels(
      findSlots(input({ weeklyHours: [], overrides: [{ date: '2026-12-01', closed: false, startMin: H(10), endMin: H(12) }] })),
    );
    expect(l).toEqual(['10:00', '11:00']);
  });
});

/**
 * UK clock changes (GOV.UK): last Sunday of March at 01:00 GMT the clocks go forward to 02:00 BST, so
 * 01:00–01:59 local doesn't exist; last Sunday of October at 02:00 BST they go back to 01:00 GMT, so
 * 01:00–01:59 local happens twice.
 */
describe.each([
  { year: 2026, spring: '2026-03-29', autumn: '2026-10-25' },
  { year: 2027, spring: '2027-03-28', autumn: '2027-10-31' },
])('UK clock changes in $year', ({ spring, autumn }) => {
  const night = (date: string, over: Partial<FindSlotsInput> = {}) =>
    findSlots(
      input({
        fromDate: date,
        toDate: date,
        now: at(`${Number(date.slice(0, 4)) - 1}-12-01T00:00:00Z`),
        weeklyHours: everyDay(0, H(4)),
        service: { durationMin: 15, bufferBeforeMin: 0, bufferAfterMin: 0 },
        rules: { minNoticeMin: 0, maxDaysAhead: 730, slotStepMin: 15 },
        ...over,
      }),
    );

  it(`spring forward (${spring}): no slot between 01:00 and 01:59`, () => {
    const l = labels(night(spring));
    expect(l.filter((x) => x.startsWith('01:'))).toEqual([]);
    expect(l).toContain('00:45');
    expect(l).toContain('02:00');
  });

  it(`spring forward (${spring}): 02:00 local is 01:00 UTC, right after 00:45 GMT`, () => {
    const day = night(spring)[0]!;
    expect(day.slots.find((s) => s.localTime === '00:45')!.startsAt).toBe(`${spring}T00:45:00.000Z`);
    expect(day.slots.find((s) => s.localTime === '02:00')!.startsAt).toBe(`${spring}T01:00:00.000Z`);
  });

  it(`spring forward (${spring}): a 09:00 window still yields 09:00 local (08:00 UTC)`, () => {
    const [slot] = findSlots(input({ fromDate: spring, toDate: spring, now: at(`${spring.slice(0, 4)}-01-01T00:00:00Z`) }))[0]!
      .slots;
    expect(slot!.localTime).toBe('09:00');
    expect(slot!.startsAt).toBe(`${spring}T08:00:00.000Z`);
  });

  it(`spring forward (${spring}): durations are real elapsed time across the gap`, () => {
    const l = labels(night(spring, { service: { durationMin: 120, bufferBeforeMin: 0, bufferAfterMin: 0 }, rules: { minNoticeMin: 0, maxDaysAhead: 730, slotStepMin: 60 } }));
    // The 00:00–04:00 window is only 3 real hours long: 00:00 (→02:00Z) and 02:00 (→03:00Z) fit; 03:00 doesn't.
    expect(l).toEqual(['00:00', '02:00']);
  });

  it(`fall back (${autumn}): no duplicate slots`, () => {
    const l = labels(night(autumn));
    expect(new Set(l).size).toBe(l.length);
    expect(l.filter((x) => x.startsWith('01:'))).toEqual(['01:00', '01:15', '01:30', '01:45']);
  });

  it(`fall back (${autumn}): 01:xx is offered once, at its first (BST) occurrence`, () => {
    const day = night(autumn)[0]!;
    const one = day.slots.find((s) => s.localTime === '01:00')!;
    expect(one.startsAt).toBe(`${autumn}T00:00:00.000Z`); // 01:00 BST
    const two = day.slots.find((s) => s.localTime === '02:00')!;
    expect(two.startsAt).toBe(`${autumn}T02:00:00.000Z`); // 02:00 GMT
    const instants = day.slots.map((s) => s.startsAt);
    expect(instants).not.toContain(`${autumn}T01:00:00.000Z`); // the second 01:00 is never offered
  });

  it(`fall back (${autumn}): a 09:00 window yields 09:00 local (09:00 UTC), not 08:00`, () => {
    const [slot] = findSlots(input({ fromDate: autumn, toDate: autumn, now: at(`${autumn.slice(0, 4)}-01-01T00:00:00Z`) }))[0]!
      .slots;
    expect(slot!.localTime).toBe('09:00');
    expect(slot!.startsAt).toBe(`${autumn}T09:00:00.000Z`);
  });

  it(`fall back (${autumn}): durations are real elapsed time across the fold`, () => {
    const day = night(autumn, { service: { durationMin: 120, bufferBeforeMin: 0, bufferAfterMin: 0 }, rules: { minNoticeMin: 0, maxDaysAhead: 730, slotStepMin: 60 } })[0]!;
    // The window is 5 real hours (00:00 BST = 23:00Z … 04:00 GMT = 04:00Z).
    expect(day.slots.map((s) => s.localTime)).toEqual(['00:00', '01:00', '02:00']);
    expect(day.slots.find((s) => s.localTime === '01:00')!.endsAt).toBe(`${autumn}T02:00:00.000Z`);
  });

  it(`busy time is compared as instants on clock-change days (${autumn})`, () => {
    // A booking 00:30–01:30 UTC covers 01:30 BST … 01:30 GMT: the first 01:30 and 01:45 must disappear.
    const l = labels(night(autumn, { busy: [busy(`${autumn}T00:30:00Z`, `${autumn}T01:30:00Z`)] }));
    expect(l).toContain('01:15');
    expect(l).not.toContain('01:30');
    expect(l).not.toContain('01:45');
    expect(l).toContain('02:00');
  });
});

describe('helpers', () => {
  it('localToEpochMs returns null for a time that never happened', () => {
    const d = Temporal.PlainDate.from('2026-03-29');
    expect(localToEpochMs(d, H(1, 30), ZONE)).toBeNull();
    expect(localToEpochMs(d, H(2), ZONE)).toBe(Date.parse('2026-03-29T01:00:00Z'));
  });

  it('isOfferedStart accepts a real slot and rejects an off-grid or blocked one', () => {
    const base = input();
    expect(isOfferedStart(base, at('2026-12-01T10:00:00Z'))).toBe(true);
    expect(isOfferedStart(base, at('2026-12-01T10:07:00Z'))).toBe(false);
    expect(isOfferedStart({ ...base, busy: [busy('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')] }, at('2026-12-01T10:00:00Z'))).toBe(false);
    expect(isOfferedStart(base, at('2026-12-01T18:00:00Z'))).toBe(false);
  });
});

describe('isWithinWorkingHours', () => {
  const args = (start: string, end: string, over: Partial<Parameters<typeof isWithinWorkingHours>[0]> = {}) => ({
    zone: ZONE,
    weeklyHours: everyDay(H(9), H(17)),
    overrides: [],
    start: at(start),
    end: at(end),
    ...over,
  });

  it('is true inside a window and false when hours no longer cover the booking', () => {
    expect(isWithinWorkingHours(args('2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z'))).toBe(true);
    expect(isWithinWorkingHours(args('2026-12-01T16:30:00Z', '2026-12-01T17:30:00Z'))).toBe(false);
    expect(
      isWithinWorkingHours(
        args('2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z', {
          overrides: [{ date: '2026-12-01', closed: true, startMin: null, endMin: null }],
        }),
      ),
    ).toBe(false);
  });

  it('uses local time in summer (09:00 BST = 08:00 UTC)', () => {
    expect(isWithinWorkingHours(args('2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z'))).toBe(true);
    expect(isWithinWorkingHours(args('2026-06-02T07:30:00Z', '2026-06-02T08:30:00Z'))).toBe(false);
  });
});
