'use client';

import type { ManageView, Slot } from '@slotwise/shared';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/field';
import { SlotPicker } from '@/components/slot-picker';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, newIdempotencyKey } from '@/lib/api';
import { addDays, formatUkDateTime, formatUkTime, ukToday } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

/** The customer's page from the emailed link: no account, the token is the key. */
export default function ManagePage() {
  const { token } = useParams<{ token: string }>();
  const base = `/public/manage/${token}`;
  const { data, error, loading, reload } = useApi<ManageView>(base);
  const [view, setView] = useState<ManageView>();
  const [mode, setMode] = useState<'idle' | 'move' | 'cancel'>('idle');
  const [slot, setSlot] = useState<Slot>();
  const [weekStart, setWeekStart] = useState(ukToday());
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [done, setDone] = useState<string>();
  const { pending, formError, run } = useSubmit();

  const current = view ?? data;
  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (loading || !current) return <Shell><LoadingState /></Shell>;
  const { booking: b, business: biz } = current;

  const cancel = async () => {
    const v = await run(() => api<ManageView>(`${base}/cancel`, { method: 'POST', noRefresh: true }));
    if (v) {
      setView(v);
      setMode('idle');
      setDone('Your booking is cancelled. We’ve emailed you a confirmation.');
    }
  };
  const move = async () => {
    if (!slot) return;
    const v = await run(() =>
      api<ManageView>(`${base}/reschedule`, {
        method: 'POST',
        body: { startsAt: slot.startsAt },
        headers: { 'Idempotency-Key': idemKey },
        noRefresh: true,
      }),
    );
    if (v) {
      setView(v);
      setMode('idle');
      setSlot(undefined);
      setIdemKey(newIdempotencyKey());
      setDone(`Moved to ${formatUkDateTime(v.booking.startsAt)}. We’ve emailed you the new details.`);
    }
  };
  const contact = [biz.contactPhone, biz.contactEmail].filter(Boolean);

  return (
    <Shell>
      <Card>
        <CardHeader>
          <p className="text-sm font-medium" style={{ color: biz.brandColor }}>
            {biz.name}
          </p>
          <CardTitle>
            <h1 className="text-xl">{b.serviceName}</h1>
          </CardTitle>
          <CardDescription>with {b.staffName}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className={b.status === 'cancelled' ? 'line-through text-muted-foreground' : 'text-lg font-medium'}>
            {formatUkDateTime(b.startsAt)}–{formatUkTime(b.endsAt)} <span className="text-sm font-normal">(UK time)</span>
          </p>
          <div aria-live="polite">
            {done && <p className="rounded-md bg-muted px-3 py-2 text-sm">{done}</p>}
          </div>
          <FormError message={formError} />

          {current.blockedReason === 'cancelled' && !done && <p className="text-sm">This booking was cancelled.</p>}
          {current.blockedReason === 'started' && <p className="text-sm">This appointment has already started.</p>}
          {current.blockedReason === 'cutoff' && (
            <div className="text-sm">
              <p>Changes aren’t possible online within {biz.cancelCutoffHours} hours of the appointment. Please contact {biz.name}:</p>
              {contact.length > 0 && <p className="mt-1 font-medium">{contact.join(' · ')}</p>}
            </div>
          )}

          {current.blockedReason === null && mode === 'idle' && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setMode('move')}>Change time</Button>
              <Button variant="outline" onClick={() => setMode('cancel')}>
                Cancel booking
              </Button>
            </div>
          )}

          {mode === 'cancel' && (
            <div className="grid gap-3 rounded-md border p-4">
              <p className="text-sm font-medium">Cancel this booking?</p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={cancel} disabled={pending}>
                  {pending ? 'Cancelling…' : 'Yes, cancel'}
                </Button>
                <Button variant="outline" onClick={() => setMode('idle')}>
                  Keep it
                </Button>
              </div>
            </div>
          )}

          {mode === 'move' && (
            <div className="grid gap-4 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={weekStart <= ukToday()} onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  Earlier
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  Later
                </Button>
              </div>
              <SlotPicker
                source={`${base}/availability`}
                from={weekStart}
                to={addDays(weekStart, 6)}
                selected={slot?.startsAt}
                onPick={setSlot}
              />
              <div className="flex gap-2">
                <Button onClick={move} disabled={!slot || pending}>
                  {pending ? 'Moving…' : slot ? `Move to ${formatUkDateTime(slot.startsAt)}` : 'Pick a new time'}
                </Button>
                <Button variant="outline" onClick={() => setMode('idle')}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  );
}
