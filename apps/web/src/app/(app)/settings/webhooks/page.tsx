'use client';

import { type CreatedWebhook, WEBHOOK_EVENTS, type WebhookDelivery, type WebhookEndpoint } from '@slotwise/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { useMe } from '@/components/me';
import { OwnerOnly } from '@/components/owner-only';
import { SecretReveal } from '@/components/secret-reveal';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { formatUkDateTime } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

function Deliveries({ endpointId }: { endpointId: string }) {
  const { data, error, reload } = useApi<{ items: WebhookDelivery[] }>(`/webhooks/${endpointId}/deliveries?limit=20`);
  const resend = async (id: string) => {
    try {
      await api(`/webhooks/deliveries/${id}/resend`, { method: 'POST' });
      toast.success('Queued again');
      setTimeout(reload, 1500);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <LoadingState />;
  if (data.items.length === 0) return <p className="text-sm text-muted-foreground">No deliveries yet.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <ul className="divide-y text-sm">
        {data.items.map((d) => (
          <li key={d.id} className="grid gap-1 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <Badge variant={d.statusCode && d.statusCode < 300 ? 'secondary' : 'destructive'}>{d.statusCode ?? 'error'}</Badge>{' '}
                <span className="font-medium">{d.event}</span> · attempt {d.attempt}
                {d.durationMs !== null && ` · ${d.durationMs} ms`}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {formatUkDateTime(d.createdAt)}
                <Button size="sm" variant="outline" onClick={() => resend(d.id)}>
                  Resend
                </Button>
              </span>
            </div>
            {d.error && <p className="text-destructive">{d.error}</p>}
            {d.nextRetryAt && <p className="text-muted-foreground">Next try {formatUkDateTime(d.nextRetryAt)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WebhooksPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<{ items: WebhookEndpoint[] }>('/webhooks?limit=100');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Set<string>>(new Set(WEBHOOK_EVENTS));
  const [created, setCreated] = useState<CreatedWebhook>();
  const [open, setOpen] = useState<string>();
  const { pending, formError, fields, run } = useSubmit();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = await run(() => api<CreatedWebhook>('/webhooks', { method: 'POST', body: { url, events: [...events] } }));
    if (w) {
      setCreated(w);
      setUrl('');
      reload();
    }
  };
  const act = (fn: () => Promise<unknown>, done: string) => async () => {
    try {
      await fn();
      toast.success(done);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <OwnerOnly>
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              We POST booking events to your URL, signed with <code>Slotwise-Signature: t=…,v1=…</code> (HMAC-SHA256 of{' '}
              <code>t.body</code>). Failed deliveries retry 8 times over about a day.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {me.business.isDemo ? (
              <p className="text-sm text-muted-foreground">Webhooks are switched off for the demo business.</p>
            ) : (
              <form onSubmit={create} className="grid gap-3">
                <Field label="Endpoint URL" type="url" placeholder="https://example.com/slotwise" required value={url} onChange={(e) => setUrl(e.target.value)} error={fields.url} />
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-2 text-sm font-medium">Events</legend>
                  {WEBHOOK_EVENTS.map((ev) => (
                    <div key={ev} className="flex items-center gap-2">
                      <Checkbox
                        id={`ev-${ev}`}
                        checked={events.has(ev)}
                        onCheckedChange={(v) => {
                          const next = new Set(events);
                          if (v === true) next.add(ev);
                          else next.delete(ev);
                          setEvents(next);
                        }}
                      />
                      <Label htmlFor={`ev-${ev}`}>{ev}</Label>
                    </div>
                  ))}
                </fieldset>
                <div>
                  <Button type="submit" disabled={pending || events.size === 0}>
                    {pending ? 'Adding…' : 'Add endpoint'}
                  </Button>
                </div>
              </form>
            )}
            <FormError message={formError} />
            {created && <SecretReveal title="Signing secret" value={created.secret} onDismiss={() => setCreated(undefined)} />}
          </CardContent>
        </Card>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState />
        ) : !data?.items.length ? (
          <EmptyState title="No webhook endpoints" />
        ) : (
          data.items.map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <CardTitle className="break-all text-sm">{w.url}</CardTitle>
                <CardDescription>{w.events.join(', ')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`active-${w.id}`}
                      checked={w.active}
                      onCheckedChange={(v) => act(() => api(`/webhooks/${w.id}`, { method: 'PATCH', body: { active: v } }), v ? 'Switched on' : 'Switched off')()}
                    />
                    <Label htmlFor={`active-${w.id}`}>Active</Label>
                  </div>
                  <Button size="sm" variant="outline" onClick={act(() => api(`/webhooks/${w.id}/test`, { method: 'POST' }), 'Test event sent')}>
                    Send test event
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === w.id ? undefined : w.id)} aria-expanded={open === w.id}>
                    {open === w.id ? 'Hide deliveries' : 'Delivery log'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={act(() => api(`/webhooks/${w.id}`, { method: 'DELETE' }), 'Deleted')}>
                    Delete
                  </Button>
                </div>
                {open === w.id && <Deliveries endpointId={w.id} />}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </OwnerOnly>
  );
}
