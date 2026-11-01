import { describe, expect, it } from 'vitest';
import { weekOfFirstUpcoming } from '../src/lib/opening-week';

const at = (iso: string) => new Date(iso).getTime();
const b = (startsAt: string, status = 'confirmed') => ({ startsAt, status });

describe('the calendar opens on the week of the next upcoming booking', () => {
  it('stays on this week while it still has an upcoming confirmed booking', () => {
    const now = at('2026-10-28T12:00:00Z'); // Wednesday
    expect(weekOfFirstUpcoming([b('2026-10-28T09:00:00Z'), b('2026-10-29T10:00:00Z')], now)).toBe('2026-10-26');
  });

  it("moves to next week when this week's bookings are all over (Sunday 1 Nov)", () => {
    const now = at('2026-11-01T12:00:00Z');
    const items = [b('2026-10-30T10:00:00Z'), b('2026-10-31T09:00:00Z'), b('2026-11-02T10:15:00Z')];
    expect(weekOfFirstUpcoming(items, now)).toBe('2026-11-02');
  });

  it('skips cancelled bookings and returns null when nothing is upcoming', () => {
    const now = at('2026-11-01T12:00:00Z');
    expect(weekOfFirstUpcoming([b('2026-11-01T15:00:00Z', 'cancelled'), b('2026-11-12T09:00:00Z')], now)).toBe('2026-11-09');
    expect(weekOfFirstUpcoming([b('2026-10-31T09:00:00Z')], now)).toBeNull();
  });

  it('uses the UK date: 23:30 on Sunday in BST belongs to that week, not the next', () => {
    // Sunday 18 Oct 2026, 23:30 BST = 22:30 UTC
    expect(weekOfFirstUpcoming([b('2026-10-18T22:30:00Z')], at('2026-10-18T12:00:00Z'))).toBe('2026-10-12');
  });
});
