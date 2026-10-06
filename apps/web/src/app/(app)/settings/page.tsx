'use client';

import { type Business, SLOT_STEPS } from '@slotwise/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { OwnerOnly } from '@/components/owner-only';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

type Form = Omit<Business, 'id' | 'timezone' | 'isDemo' | 'live'>;

function BusinessForm({ initial, onSaved }: { initial: Business; onSaved: (b: Business) => void }) {
  const [form, setForm] = useState<Form>(initial);
  const { pending, formError, fields, run } = useSubmit();

  const text = (k: 'name' | 'slug' | 'brandColor') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const nullable = (k: 'contactEmail' | 'contactPhone') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value.trim() === '' ? null : e.target.value });
  const num = (k: 'minNoticeMin' | 'maxDaysAhead' | 'cancelCutoffHours' | 'retentionMonths') =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await run(() => api<Business>('/business', { method: 'PATCH', body: form }));
    if (saved) {
      toast.success('Saved');
      onSaved(saved);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-6 max-w-2xl">
      <FormError message={formError} />
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
          <CardDescription>Shown to customers on your booking page and in emails.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required value={form.name} onChange={text('name')} error={fields.name} />
          <Field
            label="Web address"
            required
            value={form.slug}
            onChange={text('slug')}
            error={fields.slug}
            hint={`Your page: /b/${form.slug}`}
            disabled={initial.isDemo}
          />
          <Field label="Contact email" type="email" value={form.contactEmail ?? ''} onChange={nullable('contactEmail')} error={fields.contactEmail} />
          <Field label="Contact phone" type="tel" value={form.contactPhone ?? ''} onChange={nullable('contactPhone')} error={fields.contactPhone} />
          <Field label="Brand colour" type="color" className="h-10 p-1" value={form.brandColor} onChange={text('brandColor')} error={fields.brandColor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking rules</CardTitle>
          <CardDescription>Times are UK time (Europe/London).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum notice (minutes)"
            type="number"
            min={0}
            max={10080}
            value={form.minNoticeMin}
            onChange={num('minNoticeMin')}
            error={fields.minNoticeMin}
            hint="How soon before a slot it can still be booked."
          />
          <Field label="Book up to (days ahead)" type="number" min={1} max={365} value={form.maxDaysAhead} onChange={num('maxDaysAhead')} error={fields.maxDaysAhead} />
          <div className="grid gap-1.5">
            <Label htmlFor="slot-step">Start times every</Label>
            <Select value={String(form.slotStepMin)} onValueChange={(v) => setForm({ ...form, slotStepMin: Number(v) })}>
              <SelectTrigger id="slot-step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_STEPS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Changes allowed until (hours before)"
            type="number"
            min={0}
            max={168}
            value={form.cancelCutoffHours}
            onChange={num('cancelCutoffHours')}
            error={fields.cancelCutoffHours}
            hint="Inside this window customers must contact you."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications and data</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="owner-notifications">Email me about new, cancelled and moved bookings</Label>
            <Switch
              id="owner-notifications"
              checked={form.ownerNotifications}
              onCheckedChange={(v) => setForm({ ...form, ownerNotifications: v })}
            />
          </div>
          <Field
            label="Delete customer details after (months)"
            type="number"
            min={1}
            max={120}
            value={form.retentionMonths}
            onChange={num('retentionMonths')}
            error={fields.retentionMonths}
            hint="Counted from their last appointment."
          />
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export default function BusinessSettingsPage() {
  const { data, error, loading, reload } = useApi<Business>(useMe().me.user.role === 'owner' ? '/business' : null);
  const { reload: reloadMe } = useMe();
  return (
    <OwnerOnly>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingState />
      ) : (
        <BusinessForm
          initial={data}
          onSaved={() => {
            reload();
            reloadMe();
          }}
        />
      )}
    </OwnerOnly>
  );
}
