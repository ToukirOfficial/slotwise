'use client';

import type { ApiKey, CreatedApiKey } from '@slotwise/shared';
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
import { api, errorMessage } from '@/lib/api';
import { formatUkDateTime } from '@/lib/format';
import { useSubmit } from '@/lib/forms';
import { useApi } from '@/lib/use-api';

export default function ApiKeysPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<{ items: ApiKey[] }>('/api-keys?limit=100');
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedApiKey>();
  const { pending, formError, fields, run } = useSubmit();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = await run(() => api<CreatedApiKey>('/api-keys', { method: 'POST', body: { name } }));
    if (k) {
      setCreated(k);
      setName('');
      reload();
    }
  };
  const revoke = async (k: ApiKey) => {
    try {
      await api(`/api-keys/${k.id}`, { method: 'DELETE' });
      toast.success('Revoked');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <OwnerOnly>
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              For your own systems: list services and staff, read availability, and create, read, cancel and move bookings. Send as{' '}
              <code>Authorization: Bearer sw_live_…</code>. Docs:{' '}
              <a className="underline underline-offset-4" href="/api/docs" target="_blank" rel="noreferrer">
                /api/docs
              </a>
              . 60 requests a minute per key.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {me.business.isDemo ? (
              <p className="text-sm text-muted-foreground">API keys are switched off for the demo business.</p>
            ) : (
              <form onSubmit={create} className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Field label="Name" placeholder="e.g. CRM sync" required value={name} onChange={(e) => setName(e.target.value)} error={fields.name} />
                </div>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create key'}
                </Button>
              </form>
            )}
            <FormError message={formError} />
            {created && <SecretReveal title={`Key “${created.name}” created`} value={created.key} onDismiss={() => setCreated(undefined)} />}
            {error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : loading && !data ? (
              <LoadingState />
            ) : !data?.items.length ? (
              <EmptyState title="No API keys" />
            ) : (
              <ul className="divide-y">
                {data.items.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{k.name}</p>
                      <p className="text-muted-foreground">
                        <code>sw_live_{k.prefix}_…</code> · {k.lastUsedAt ? `last used ${formatUkDateTime(k.lastUsedAt)}` : 'never used'}
                      </p>
                    </div>
                    {k.revokedAt ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => revoke(k)}>
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </OwnerOnly>
  );
}
