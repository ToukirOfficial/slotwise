import type { Booking } from '@slotwise/shared';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatUkTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One appointment in the calendar. Times are UK time. */
export function BookingCard({ b, showStaff }: { b: Booking; showStaff: boolean }) {
  // A confirmed booking that has ended took place: shown quieter, marked completed.
  const [now] = useState(() => Date.now());
  const completed = b.status === 'confirmed' && new Date(b.endsAt).getTime() < now;
  return (
    <Link
      href={`/bookings/${b.id}`}
      className={cn(
        'block rounded-md border border-l-[3px] bg-card px-2.5 py-2 text-sm transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring',
        completed ? 'border-l-muted-foreground/40 text-muted-foreground' : 'border-l-primary',
      )}
    >
      <p className="flex items-center justify-between gap-2 text-[13px] font-semibold tabular-nums">
        <span>
          {formatUkTime(b.startsAt)}–{formatUkTime(b.endsAt)}
        </span>
        {completed && <span className="text-[11px] font-medium">Completed</span>}
      </p>
      <p className="truncate">{b.customer.name ?? 'Erased customer'}</p>
      <p className="truncate text-[13px] text-muted-foreground">
        {b.service.name}
        {showStaff && ` · ${b.staff.displayName}`}
      </p>
      {b.outsideHours && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" aria-hidden /> Outside working hours
        </p>
      )}
    </Link>
  );
}
