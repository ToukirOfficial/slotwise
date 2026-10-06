'use client';

import type { Booking, Service, Slot, Staff } from '@slotwise/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Field, FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { SlotPicker } from '@/components/slot-picker';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, newIdempotencyKey } from '@/lib/api';
import { addDays, formatUkDateTime, ukToday } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

/** Book a phone or walk-in customer: same endpoint and rules as API bookings. */
export default function NewBookingPage() {
  const router = useRouter();
  const { me } = useMe();
  const isOwner = me.user.role === 'owner';
  const services = useApi<{ items: Service[] }>('/services?limit=100&active=true');
  const staff = useApi<{ items: Staff[] }>(isOwner ? '/staff?limit=100' : null);

  const [serviceId, setServiceId] = useState<string>();
  const [staffId, setStaffId] = useState('any');
  const [weekStart, setWeekStart] = useState(ukToday());
  const [slot, setSlot] = useState<Slot>();
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [idemKey] = useState(newIdempotencyKey);
  const { pending, formError, fields, run } = useSubmit();

  const chosen = serviceId ?? services.data?.items[0]?.id;
  const eligible = (staff.data?.items ?? []).filter((s) => s.active && chosen && s.serviceIds.includes(chosen));
  const set = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !slot) return;
    const b = await run(() =>
      api<Booking>('/bookings', {
        method: 'POST',
        body: { serviceId: chosen, staffId: isOwner ? staffId : 'any', startsAt: slot.startsAt, customer },
        headers: { 'Idempotency-Key': idemKey },
      }),
    );
    if (b) {
      toast.success('Booked');
      router.push(`/bookings/${b.id}`);
    }
  };

  if (services.error) return <ErrorState error={services.error} onRetry={services.reload} />;
  if (!services.data) return <LoadingState />;
  if (services.data.items.length === 0) return <EmptyState title="Add a service first" />;

  return (
    <>
      <PageHeader title="New booking" description="For a phone or walk-in customer." />
      <form onSubmit={submit} className="grid max-w-3xl gap-6">
        <FormError message={formError} />
        <Card>
          <CardHeader>
            <CardTitle>1. What and when</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="nb-service">Service</Label>
                <Select
                  value={chosen}
                  onValueChange={(v) => {
                    setServiceId(v);
                    setStaffId('any');
                    setSlot(undefined);
                  }}
                >
                  <SelectTrigger id="nb-service" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {services.data.items.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isOwner && (
                <div className="grid gap-1.5">
                  <Label htmlFor="nb-staff">With</Label>
                  <Select
                    value={staffId}
                    onValueChange={(v) => {
                      setStaffId(v);
                      setSlot(undefined);
                    }}
                  >
                    <SelectTrigger id="nb-staff" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Anyone free</SelectItem>
                      {eligible.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled={weekStart <= ukToday()} onClick={() => setWeekStart(addDays(weekStart, -7))}>
                Earlier
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Later
              </Button>
            </div>
            {chosen && (
              <SlotPicker
                serviceId={chosen}
                staffId={isOwner ? staffId : 'any'}
                from={weekStart}
                to={addDays(weekStart, 6)}
                selected={slot?.startsAt}
                onPick={setSlot}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" autoComplete="off" required value={customer.name} onChange={set('name')} error={fields['customer.name']} />
            <Field label="Email" type="email" autoComplete="off" required value={customer.email} onChange={set('email')} error={fields['customer.email']} />
            <Field label="Phone" type="tel" autoComplete="off" required value={customer.phone} onChange={set('phone')} error={fields['customer.phone']} />
          </CardContent>
        </Card>
        <div>
          <Button type="submit" disabled={!slot || pending}>
            {pending ? 'Booking…' : slot ? `Book ${formatUkDateTime(slot.startsAt)}` : 'Pick a time first'}
          </Button>
        </div>
      </form>
    </>
  );
}
