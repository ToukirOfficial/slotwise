import { mondayOf, ukDateOf } from './format';

/**
 * Which week the calendar opens on: the week of the first confirmed booking that hasn't started yet,
 * so it's the current week only while that week still has something coming up. Null when nothing is upcoming.
 * `items` must be sorted by start time (the API's order).
 */
export function weekOfFirstUpcoming(items: { startsAt: string; status: string }[], nowMs: number): string | null {
  const next = items.find((b) => b.status === 'confirmed' && new Date(b.startsAt).getTime() > nowMs);
  return next ? mondayOf(ukDateOf(next.startsAt)) : null;
}
