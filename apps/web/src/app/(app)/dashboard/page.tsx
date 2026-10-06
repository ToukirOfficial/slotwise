'use client';

import type { Booking, Staff } from '@slotwise/shared';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { BookingCard } from '@/components/booking-card';
import { useMe } from '@/components/me';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerifyBanner } from '@/components/verify-banner';
import { useBookingsInRange } from '@/lib/bookings';
import { addDays, formatLocalDate, mondayOf, ukDateOf, ukToday } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type View = 'day' | 'week';

function DayColumn({ date, bookings, showStaff, compact }: { date: string; bookings: Booking[]; showStaff: boolean; compact: boolean }) {
  const isToday = date === ukToday();
  return (
    <section aria-label={formatLocalDate(date)} className="grid content-start gap-2">
      <h2 className={cn('text-sm font-medium', isToday && 'text-primary')}>
        {formatLocalDate(date, compact ? { weekday: 'short', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' })}
        {isToday && <span className="sr-only"> (today)</span>}
      </h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{compact ? '—' : 'No bookings.'}</p>
      ) : (
        bookings.map((b) => <BookingCard key={b.id} b={b} showStaff={showStaff} />)
      )}
    </section>
  );
}

export default function CalendarPage() {
  const { me } = useMe();
  const isOwner = me.user.role === 'owner';
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(ukToday());
  const [staffId, setStaffId] = useState('all');
  const staff = useApi<{ items: Staff[] }>(isOwner ? '/staff?limit=100' : null);

  const from = view === 'week' ? mondayOf(date) : date;
  const to = view === 'week' ? addDays(from, 6) : date;
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(from, i));
  const { items, error, loading } = useBookingsInRange(from, to, staffId);
  const step = view === 'week' ? 7 : 1;
  const showStaff = isOwner && staffId === 'all';

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`${me.business.name} · UK time`}
        actions={
          <Button asChild size="sm">
            <Link href="/bookings/new">
              <Plus className="size-4" /> New booking
            </Link>
          </Button>
        }
      />
      <VerifyBanner />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={`Previous ${view}`} onClick={() => setDate(addDays(date, -step))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(ukToday())}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label={`Next ${view}`} onClick={() => setDate(addDays(date, step))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="text-sm font-medium" aria-live="polite">
          {view === 'week'
            ? `${formatLocalDate(from, { day: 'numeric', month: 'short' })} – ${formatLocalDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : formatLocalDate(date)}
        </p>
        {isOwner && (
          <div className="ml-auto w-48">
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger aria-label="Whose diary" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {staff.data?.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : loading && !items ? (
        <LoadingState />
      ) : items && items.length === 0 && view === 'week' ? (
        <EmptyState title="No bookings this week">
          Share your booking page, or <Link className="underline" href="/bookings/new">add a booking</Link> for a phone or walk-in customer.
        </EmptyState>
      ) : (
        <div className={cn('grid gap-4', view === 'week' && 'md:grid-cols-7')}>
          {days.map((d) => (
            <DayColumn
              key={d}
              date={d}
              compact={view === 'week'}
              showStaff={showStaff}
              bookings={(items ?? []).filter((b) => ukDateOf(b.startsAt) === d)}
            />
          ))}
        </div>
      )}
    </>
  );
}
