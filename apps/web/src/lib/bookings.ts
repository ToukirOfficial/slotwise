'use client';

import type { Booking } from '@slotwise/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { mondayOf, ukDateOf } from './format';

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
 * The Monday of the first week, from `monday` on, with a confirmed booking (null when there are none).
 * The list is sorted by start time, so one booking is enough.
 */
export async function firstBookingWeek(monday: string): Promise<string | null> {
  const qs = new URLSearchParams({ from: monday, status: 'confirmed', limit: '1' });
  const page = await api<Page>(`/bookings?${qs.toString()}`);
  const first = page.items[0];
  return first ? mondayOf(ukDateOf(first.startsAt)) : null;
}
