'use client';

import type { Service, Staff } from '@slotwise/shared';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { OwnerOnly } from '@/components/owner-only';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

type Page = { items: Staff[]; nextCursor: string | null };
type DialogState =
  | { kind: 'add' }
  | { kind: 'rename'; staff: Staff }
  | { kind: 'invite'; staff: Staff }
  | { kind: 'services'; staff: Staff }
  | null;

/** Which services this person delivers. */
function ServicesDialog({ staff, onClose, onDone }: { staff: Staff; onClose: () => void; onDone: () => void }) {
  const services = useApi<{ items: Service[] }>('/services?limit=100');
  const [selected, setSelected] = useState(new Set(staff.serviceIds));
  const { pending, formError, run } = useSubmit();

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api(`/staff/${staff.id}/services`, { method: 'PUT', body: { serviceIds: [...selected] } }));
    if (ok) onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Services {staff.displayName} delivers</DialogTitle>
          </DialogHeader>
          <FormError message={formError} />
          {services.error ? (
            <ErrorState error={services.error} onRetry={services.reload} />
          ) : !services.data ? (
            <LoadingState />
          ) : services.data.items.length === 0 ? (
            <EmptyState title="No services yet">Add services under Settings → Services first.</EmptyState>
          ) : (
            <fieldset className="grid gap-3">
              <legend className="sr-only">Services</legend>
              {services.data.items.map((svc) => (
                <div key={svc.id} className="flex items-center gap-2">
                  <Checkbox id={`svc-${svc.id}`} checked={selected.has(svc.id)} onCheckedChange={(v) => toggle(svc.id, v === true)} />
                  <Label htmlFor={`svc-${svc.id}`}>{svc.name}</Label>
                </div>
              ))}
            </fieldset>
          )}
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

function StaffDialog({ state, onClose, onDone }: { state: DialogState; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState('');
  const { pending, formError, fields, run } = useSubmit();
  if (!state) return null;
  if (state.kind === 'services') return <ServicesDialog staff={state.staff} onClose={onClose} onDone={onDone} />;

  const config = {
    add: { title: 'Add staff', label: 'Name', button: 'Add', type: 'text' },
    rename: { title: 'Rename', label: 'Name', button: 'Save', type: 'text' },
    invite: { title: 'Invite to log in', label: 'Their email', button: 'Send invite', type: 'email' },
  }[state.kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      state.kind === 'add'
        ? api('/staff', { method: 'POST', body: { displayName: value } })
        : state.kind === 'rename'
          ? api(`/staff/${state.staff.id}`, { method: 'PATCH', body: { displayName: value } })
          : api(`/staff/${state.staff.id}/invite`, { method: 'POST', body: { email: value } }),
    );
    if (ok) {
      if (state.kind === 'invite') toast.success('Invite sent');
      onDone();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
            {state.kind === 'invite' && (
              <DialogDescription>They’ll get a link to set a password and see their own diary.</DialogDescription>
            )}
          </DialogHeader>
          <FormError message={formError} />
          <Field
            label={config.label}
            type={config.type}
            required
            autoFocus
            defaultValue={state.kind === 'rename' ? state.staff.displayName : ''}
            onChange={(e) => setValue(e.target.value)}
            error={fields.displayName ?? fields.email}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : config.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StaffRow({ s, onChange, onEdit }: { s: Staff; onChange: () => void; onEdit: (d: DialogState) => void }) {
  const { me } = useMe();
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium truncate">
          {s.displayName} {s.id === me.user.staffId && <span className="text-muted-foreground font-normal">(you)</span>}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {s.email ?? 'No login'} · {s.serviceIds.length} service{s.serviceIds.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!s.active && <Badge variant="outline">Inactive</Badge>}
        {s.invitePending && <Badge variant="secondary">Invite sent</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${s.displayName}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit({ kind: 'rename', staff: s })}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit({ kind: 'services', staff: s })}>Services they deliver</DropdownMenuItem>
            {!s.hasLogin && (
              <DropdownMenuItem onSelect={() => onEdit({ kind: 'invite', staff: s })}>
                {s.invitePending ? 'Resend invite' : 'Invite to log in'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => act(() => api(`/staff/${s.id}`, { method: 'PATCH', body: { active: !s.active } }), s.active ? 'Deactivated' : 'Activated')}
            >
              {s.active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
            {s.id !== me.user.staffId && (
              <DropdownMenuItem variant="destructive" onSelect={() => act(() => api(`/staff/${s.id}`, { method: 'DELETE' }), 'Deleted')}>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export default function StaffPage() {
  const isOwner = useMe().me.user.role === 'owner';
  const { data, error, loading, reload } = useApi<Page>(isOwner ? '/staff?limit=100' : null);
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <OwnerOnly>
      <div className="max-w-2xl grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">People who deliver appointments. A login is optional.</p>
          <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
            <Plus className="size-4" /> Add staff
          </Button>
        </div>
        <Card>
          <CardContent>
            {error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : loading && !data ? (
              <LoadingState />
            ) : !data?.items.length ? (
              <EmptyState title="No staff yet" />
            ) : (
              <ul className="divide-y">
                {data.items.map((s) => (
                  <StaffRow key={s.id} s={s} onChange={reload} onEdit={setDialog} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <StaffDialog
        key={dialog ? `${dialog.kind}-${'staff' in dialog ? dialog.staff.id : ''}` : 'none'}
        state={dialog}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          reload();
        }}
      />
    </OwnerOnly>
  );
}
