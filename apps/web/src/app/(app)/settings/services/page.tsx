'use client';

import type { Service } from '@slotwise/shared';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { OwnerOnly } from '@/components/owner-only';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatPence, poundsToPence } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

type Page = { items: Service[]; nextCursor: string | null };

function ServiceDialog({ service, onClose, onDone }: { service: Service | 'new'; onClose: () => void; onDone: () => void }) {
  const initial = service === 'new' ? null : service;
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    durationMin: String(initial?.durationMin ?? 30),
    bufferBeforeMin: String(initial?.bufferBeforeMin ?? 0),
    bufferAfterMin: String(initial?.bufferAfterMin ?? 0),
    price: initial ? (initial.pricePence / 100).toFixed(2) : '',
    active: initial?.active ?? true,
  });
  const { pending, formError, fields, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      durationMin: Number(form.durationMin),
      bufferBeforeMin: Number(form.bufferBeforeMin),
      bufferAfterMin: Number(form.bufferAfterMin),
      pricePence: poundsToPence(form.price),
      active: form.active,
    };
    const ok = await run(() =>
      initial ? api(`/services/${initial.id}`, { method: 'PATCH', body }) : api('/services', { method: 'POST', body }),
    );
    if (ok) onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? 'Edit service' : 'Add service'}</DialogTitle>
          </DialogHeader>
          <FormError message={formError} />
          <Field label="Name" required autoFocus value={form.name} onChange={set('name')} error={fields.name} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Length (minutes)" type="number" min={5} max={1440} required value={form.durationMin} onChange={set('durationMin')} error={fields.durationMin} />
            <Field label="Price shown (£)" type="number" min={0} step="0.01" inputMode="decimal" value={form.price} onChange={set('price')} error={fields.pricePence} hint="Display only." />
            <Field label="Buffer before (min)" type="number" min={0} max={240} value={form.bufferBeforeMin} onChange={set('bufferBeforeMin')} error={fields.bufferBeforeMin} />
            <Field label="Buffer after (min)" type="number" min={0} max={240} value={form.bufferAfterMin} onChange={set('bufferAfterMin')} error={fields.bufferAfterMin} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="svc-active">Customers can book this</Label>
            <Switch id="svc-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
          {initial && <p className="text-sm text-muted-foreground">Changes don’t affect bookings already made.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesPage() {
  const { data, error, loading, reload } = useApi<Page>('/services?limit=100');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  const remove = async (s: Service) => {
    try {
      await api(`/services/${s.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <OwnerOnly>
      <div className="max-w-2xl grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Then choose who delivers each one under Staff.</p>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add service
          </Button>
        </div>
        <Card>
          <CardContent>
            {error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : loading && !data ? (
              <LoadingState />
            ) : !data?.items.length ? (
              <EmptyState title="No services yet">Add what customers can book, e.g. “Initial assessment, 45 min”.</EmptyState>
            ) : (
              <ul className="divide-y">
                {data.items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(s.durationMin)} · {formatPence(s.pricePence)}
                        {(s.bufferBeforeMin > 0 || s.bufferAfterMin > 0) &&
                          ` · buffers ${s.bufferBeforeMin}/${s.bufferAfterMin} min`}
                        {` · ${s.staffIds.length} staff`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!s.active && <Badge variant="outline">Off</Badge>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(s)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => remove(s)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {editing && (
        <ServiceDialog
          key={editing === 'new' ? 'new' : editing.id}
          service={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </OwnerOnly>
  );
}
