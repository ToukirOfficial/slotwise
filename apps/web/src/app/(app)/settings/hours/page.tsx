'use client';

import { type DateOverride, hhmmToMinutes, minutesToHhmm, type Staff, type WeeklyHours } from '@slotwise/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { formatLocalDate, ukToday } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "00:00" as an end time means midnight at the end of the day (1440). */
const endToMinutes = (s: string) => (s === '00:00' ? 1440 : hhmmToMinutes(s));
const endToHhmm = (m: number) => (m === 1440 ? '00:00' : minutesToHhmm(m));

interface Row {
  key: number;
  start: string;
  end: string;
}
let nextKey = 0;

function WeekEditor({ staffId, initial }: { staffId: string; initial: WeeklyHours }) {
  const [days, setDays] = useState<Row[][]>(() =>
    DAYS.map((_, i) =>
      initial.hours
        .filter((h) => h.weekday === i + 1)
        .map((h) => ({ key: nextKey++, start: minutesToHhmm(h.startMin), end: endToHhmm(h.endMin) })),
    ),
  );
  const { pending, formError, run } = useSubmit();

  const update = (day: number, fn: (rows: Row[]) => Row[]) => setDays(days.map((rows, i) => (i === day ? fn(rows) : rows)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = days.flatMap((rows, i) =>
      rows.map((r) => ({ weekday: i + 1, startMin: hhmmToMinutes(r.start), endMin: endToMinutes(r.end) })),
    );
    const ok = await run(() => api(`/staff/${staffId}/weekly-hours`, { method: 'PUT', body: { hours } }));
    if (ok) toast.success('Hours saved');
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <FormError message={formError} />
      <ul className="divide-y">
        {DAYS.map((day, i) => {
          const rows = days[i] ?? [];
          return (
            <li key={day} className="grid gap-2 py-3 sm:grid-cols-[120px_1fr] sm:items-start">
              <p className="pt-2 text-sm font-medium">{day}</p>
              <div className="grid gap-2">
                {rows.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Not working</p>}
                {rows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${day} start`}
                      className="h-9 rounded-md border bg-transparent px-2 text-sm"
                      value={r.start}
                      required
                      onChange={(e) => update(i, (rs) => rs.map((x) => (x.key === r.key ? { ...x, start: e.target.value } : x)))}
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      aria-label={`${day} end`}
                      className="h-9 rounded-md border bg-transparent px-2 text-sm"
                      value={r.end}
                      required
                      onChange={(e) => update(i, (rs) => rs.map((x) => (x.key === r.key ? { ...x, end: e.target.value } : x)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${day} ${r.start}–${r.end}`}
                      onClick={() => update(i, (rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(i, (rs) => [
                        ...rs,
                        rs.length
                          ? { key: nextKey++, start: rs.at(-1)!.end, end: '17:00' }
                          : { key: nextKey++, start: '09:00', end: '17:00' },
                      ])
                    }
                  >
                    <Plus className="size-4" /> Add hours
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        UK time. Split shifts are fine (e.g. 09:00–12:00 and 13:00–17:00). Changing hours never cancels bookings.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save weekly hours'}
        </Button>
      </div>
    </form>
  );
}

function Overrides({ staffId }: { staffId: string }) {
  const { data, error, loading, reload } = useApi<{ items: DateOverride[] }>(`/staff/${staffId}/overrides`);
  const [date, setDate] = useState(ukToday());
  const [closed, setClosed] = useState(true);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('14:00');
  const { pending, formError, fields, run } = useSubmit();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = closed
      ? { date, closed: true }
      : { date, closed: false, startMin: hhmmToMinutes(start), endMin: endToMinutes(end) };
    const ok = await run(() => api(`/staff/${staffId}/overrides`, { method: 'POST', body }));
    if (ok) reload();
  };
  const remove = async (id: string) => {
    try {
      await api(`/staff/${staffId}/overrides/${id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={add} className="grid gap-4 rounded-md border p-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" type="date" required min={ukToday()} value={date} onChange={(e) => setDate(e.target.value)} error={fields.date} />
          <div className="flex items-center gap-3 sm:pt-6">
            <Switch id="ovr-closed" checked={closed} onCheckedChange={setClosed} />
            <Label htmlFor="ovr-closed">{closed ? 'Day off' : 'Different hours'}</Label>
          </div>
        </div>
        {!closed && (
          <div className="flex items-center gap-2">
            <input type="time" aria-label="Start" className="h-9 rounded-md border bg-transparent px-2 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
            <span aria-hidden>–</span>
            <input type="time" aria-label="End" className="h-9 rounded-md border bg-transparent px-2 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState />
      ) : !data?.items.length ? (
        <EmptyState title="No upcoming time off or special hours" />
      ) : (
        <ul className="divide-y">
          {data.items.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium">{formatLocalDate(o.date)}</span> ·{' '}
                {o.closed ? 'Day off' : `${minutesToHhmm(o.startMin ?? 0)}–${endToHhmm(o.endMin ?? 0)}`}
              </span>
              <Button variant="ghost" size="icon" aria-label={`Remove ${o.date}`} onClick={() => remove(o.id)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffSchedule({ staffId }: { staffId: string }) {
  const week = useApi<WeeklyHours>(`/staff/${staffId}/weekly-hours`);
  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
        </CardHeader>
        <CardContent>
          {week.error ? (
            <ErrorState error={week.error} onRetry={week.reload} />
          ) : !week.data ? (
            <LoadingState />
          ) : (
            <WeekEditor key={staffId} staffId={staffId} initial={week.data} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Time off and special hours</CardTitle>
          <CardDescription>These replace the weekly hours for that date.</CardDescription>
        </CardHeader>
        <CardContent>
          <Overrides key={staffId} staffId={staffId} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function HoursPage() {
  const { me } = useMe();
  const isOwner = me.user.role === 'owner';
  const staff = useApi<{ items: Staff[] }>(isOwner ? '/staff?limit=100' : null);
  const [chosen, setChosen] = useState<string | null>(me.user.staffId);
  const staffId = chosen ?? staff.data?.items[0]?.id ?? null;

  if (!isOwner && !me.user.staffId) return <EmptyState title="Your login isn’t linked to a diary." />;
  return (
    <div className="grid gap-6">
      {isOwner && (
        <div className="grid gap-1.5 max-w-xs">
          <Label htmlFor="hours-staff">Whose hours</Label>
          {staff.error ? (
            <ErrorState error={staff.error} onRetry={staff.reload} />
          ) : (
            <Select value={staffId ?? undefined} onValueChange={setChosen}>
              <SelectTrigger id="hours-staff" className="w-full">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {staff.data?.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {staffId && <StaffSchedule key={staffId} staffId={staffId} />}
    </div>
  );
}
