import type { Booking } from '@slotwise/shared';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { formatUkTime } from '@/lib/format';

/** One appointment in the calendar. Times are UK time. */
export function BookingCard({ b, showStaff }: { b: Booking; showStaff: boolean }) {
  return (
    <Link
      href={`/bookings/${b.id}`}
      className="block rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <p className="font-medium tabular-nums">
        {formatUkTime(b.startsAt)}–{formatUkTime(b.endsAt)}
      </p>
      <p className="truncate">{b.customer.name ?? 'Erased customer'}</p>
      <p className="truncate text-muted-foreground">
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
