'use client';

import type { Service, Staff } from '@slotwise/shared';
import { useState } from 'react';
import { useMe } from '@/components/me';
import { SlotPicker } from '@/components/slot-picker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ukToday } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** What customers will see for the next 7 days. */
export function AvailabilityPreview() {
  const { me } = useMe();
  const isOwner = me.user.role === 'owner';
  const services = useApi<{ items: Service[] }>('/services?limit=100&active=true');
  const staff = useApi<{ items: Staff[] }>(isOwner ? '/staff?limit=100' : null);
  const [serviceId, setServiceId] = useState<string>();
  const [staffId, setStaffId] = useState('any');
  const chosen = serviceId ?? services.data?.items[0]?.id;
  const today = ukToday();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Free times this week</CardTitle>
        <CardDescription>What customers can book right now.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {services.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a service to see free times.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pv-service">Service</Label>
                <Select value={chosen} onValueChange={setServiceId}>
                  <SelectTrigger id="pv-service" className="w-full">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.data?.items.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isOwner && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-staff">With</Label>
                  <Select value={staffId} onValueChange={setStaffId}>
                    <SelectTrigger id="pv-staff" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Anyone</SelectItem>
                      {staff.data?.items
                        .filter((s) => s.active)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {chosen && <SlotPicker serviceId={chosen} staffId={isOwner ? staffId : 'any'} from={today} to={addDays(today, 6)} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
