'use client';

import type { Availability, Slot } from '@slotwise/shared';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { formatLocalDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** Free start times for a service (and staff member or "any"), grouped by day, labelled UK time. */
export function SlotPicker({
  serviceId,
  staffId,
  from,
  to,
  selected,
  onPick,
  source = '/availability',
}: {
  serviceId: string;
  staffId: string;
  from: string;
  to: string;
  selected?: string;
  onPick?: (slot: Slot) => void;
  /** Override the endpoint (e.g. the manage-link reschedule endpoint). Query string is appended. */
  source?: string;
}) {
  const sep = source.includes('?') ? '&' : '?';
  const { data, error, loading, reload } = useApi<Availability>(
    `${source}${sep}serviceId=${serviceId}&staffId=${staffId}&from=${from}&to=${to}`,
  );
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <LoadingState label="Finding free times…" />;
  const days = data.days.filter((d) => d.slots.length > 0);
  if (days.length === 0) return <EmptyState title="No free times in this range">Check hours, time off and the booking rules.</EmptyState>;

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">All times are UK time.</p>
      {days.map((d) => (
        <section key={d.date} aria-label={formatLocalDate(d.date)}>
          <h3 className="mb-2 text-sm font-medium">{formatLocalDate(d.date)}</h3>
          <div className="flex flex-wrap gap-2">
            {d.slots.map((s) => (
              <Button
                key={s.startsAt}
                type="button"
                size="sm"
                variant={selected === s.startsAt ? 'default' : 'outline'}
                aria-pressed={onPick ? selected === s.startsAt : undefined}
                className={cn(!onPick && 'pointer-events-none')}
                tabIndex={onPick ? 0 : -1}
                onClick={() => onPick?.(s)}
              >
                {s.localTime}
              </Button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
