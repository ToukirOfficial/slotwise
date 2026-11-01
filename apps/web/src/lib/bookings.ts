'use client';

import type { Booking } from '@slotwise/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { weekOfFirstUpcoming } from './opening-week';

type Page = { items: Booking[]; nextCursor: string | null };

/** Every booking in a date range (follows the cursor; a week rarely needs more than one page). */
export function useBookingsInRange(from: string, to: string, staffId: string) {
  const key = `${from}|${to}|${staffId}`;
  const [state, setState] = useState<{ key: string; items?: Booking[]; error?: unknown }>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items: Booking[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const qs = new URLSearchParams({ from, to, status: 'confirmed', limit: '100' });
        if (staffId !== 'all') qs.set('staffId', staffId);
        if (cursor) qs.set('cursor', cursor);
        const page: Page = await api<Page>(`/bookings?${qs.toString()}`);
        items.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return items;
    })().then(
      (items) => !cancelled && setState({ key, items }),
      (error: unknown) => !cancelled && setState({ key, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, from, to, staffId]);

  return {
    items: state?.items,
    error: state?.key === key ? state.error : undefined,
    loading: state?.key !== key,
  };
}

/**
 * The Monday of the week to open the calendar on: the week of the next upcoming confirmed booking
 * (null when there is none). Starts from today, since earlier days can't have anything upcoming.
 */
export async function upcomingWeek(today: string): Promise<string | null> {
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const qs = new URLSearchParams({ from: today, status: 'confirmed', limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    const page: Page = await api<Page>(`/bookings?${qs.toString()}`);
    const week = weekOfFirstUpcoming(page.items, Date.now());
    if (week || !page.nextCursor) return week;
    cursor = page.nextCursor;
  }
  return null;
}
