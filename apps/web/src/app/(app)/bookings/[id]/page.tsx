'use client';

import type { AuditEntry, Booking, Slot } from '@slotwise/shared';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { SlotPicker } from '@/components/slot-picker';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, newIdempotencyKey } from '@/lib/api';
import { addDays, formatDuration, formatPence, formatUkDateTime, formatUkTime, ukToday } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

function CancelDialog({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: (b: Booking) => void }) {
  const [reason, setReason] = useState('');
  const { pending, formError, run } = useSubmit();
  const submit = async () => {
    const b = await run(() =>
      api<Booking>(`/bookings/${booking.id}/cancel`, { method: 'POST', body: reason.trim() ? { reason: reason.trim() } : {} }),
    );
    if (b) onDone(b);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>The customer gets a cancellation email and the time becomes free again.</DialogDescription>
        </DialogHeader>
        <FormError message={formError} />
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Reason (optional, internal)</Label>
          <Textarea id="cancel-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? 'Cancelling…' : 'Cancel booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: (b: Booking) => void }) {
  const [slot, setSlot] = useState<Slot>();
  const [weekStart, setWeekStart] = useState(ukToday());
  // One key per attempt: a double-click or network retry can't move the booking twice.
  const [idemKey] = useState(newIdempotencyKey);
  const { pending, formError, run } = useSubmit();

  const submit = async () => {
    if (!slot) return;
    const b = await run(() =>
      api<Booking>(`/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        body: { startsAt: slot.startsAt },
        headers: { 'Idempotency-Key': idemKey },
      }),
    );
    if (b) onDone(b);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Move booking</DialogTitle>
          <DialogDescription>
            Same service, with {booking.staff.displayName}. Currently {formatUkDateTime(booking.startsAt)}.
          </DialogDescription>
        </DialogHeader>
        <FormError message={formError} />
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={weekStart <= ukToday()} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            Earlier
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Later
          </Button>
        </div>
        <SlotPicker
          serviceId={booking.service.id}
          staffId={booking.staff.id}
          from={weekStart}
          to={addDays(weekStart, 6)}
          selected={slot?.startsAt}
          onPick={setSlot}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={submit} disabled={!slot || pending}>
            {pending ? 'Moving…' : slot ? `Move to ${formatUkDateTime(slot.startsAt)}` : 'Pick a time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTIONS: Record<string, string> = {
  'booking.created': 'Booked',
  'booking.cancelled': 'Cancelled',
  'booking.rescheduled': 'Moved',
  'customer.erased': 'Customer data erased',
};
const ACTORS: Record<string, string> = { user: 'Dashboard user', customer: 'Customer', api_key: 'API key', system: 'System' };

function History({ bookingId }: { bookingId: string }) {
  const { data, error } = useApi<{ items: AuditEntry[] }>(`/audit-log?entity=booking&entityId=${bookingId}&limit=50`);
  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState />;
  return (
    <ol className="grid gap-2 text-sm">
      {data.items.map((e) => {
        const after = e.after as { startsAt?: string } | null;
        return (
          <li key={e.id} className="flex flex-wrap justify-between gap-2">
            <span>
              <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
              {e.action === 'booking.rescheduled' && after?.startsAt && ` to ${formatUkDateTime(after.startsAt)}`} · {ACTORS[e.actorType]}
            </span>
            <time className="text-muted-foreground" dateTime={e.at}>
              {formatUkDateTime(e.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<Booking>(`/bookings/${id}`);
  const [dialog, setDialog] = useState<'cancel' | 'move' | null>(null);
  const [tick, setTick] = useState(0);
  const [openedAt] = useState(() => Date.now());

  const done = (message: string) => () => {
    setDialog(null);
    toast.success(message);
    reload();
    setTick((n) => n + 1);
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;
  const b = data;
  const changeable = b.status === 'confirmed' && new Date(b.startsAt).getTime() > openedAt;

  return (
    <>
      <Link href="/bookings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Bookings
      </Link>
      <PageHeader
        title={`${formatUkDateTime(b.startsAt)}–${formatUkTime(b.endsAt)}`}
        description="UK time"
        actions={
          changeable && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog('move')}>
                Move
              </Button>
              <Button variant="destructive" onClick={() => setDialog('cancel')}>
                Cancel
              </Button>
            </div>
          )
        }
      />
      {b.outsideHours && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-4" aria-hidden />
          This booking is outside {b.staff.displayName}’s current working hours. It hasn’t been changed — move or cancel it if needed.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Appointment {b.status === 'cancelled' && <Badge variant="secondary">Cancelled</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Service</dt>
              <dd>
                {b.service.name} · {formatDuration(b.service.durationMin)} · {formatPence(b.service.pricePence)}
              </dd>
              <dt className="text-muted-foreground">With</dt>
              <dd>{b.staff.displayName}</dd>
              <dt className="text-muted-foreground">Booked via</dt>
              <dd className="capitalize">{b.source}</dd>
              {b.cancelReason && (
                <>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{b.cancelReason}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent>
            {b.customer.name === null ? (
              <p className="text-sm text-muted-foreground">This customer’s details were erased.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{b.customer.name}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">
                  <a className="underline underline-offset-4" href={`mailto:${b.customer.email}`}>
                    {b.customer.email}
                  </a>
                </dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  <a className="underline underline-offset-4" href={`tel:${b.customer.phone}`}>
                    {b.customer.phone}
                  </a>
                </dd>
              </dl>
            )}
          </CardContent>
        </Card>
        {me.user.role === 'owner' && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <History key={tick} bookingId={b.id} />
            </CardContent>
          </Card>
        )}
      </div>
      {dialog === 'cancel' && <CancelDialog booking={b} onClose={() => setDialog(null)} onDone={done('Booking cancelled')} />}
      {dialog === 'move' && <RescheduleDialog booking={b} onClose={() => setDialog(null)} onDone={done('Booking moved')} />}
    </>
  );
}
