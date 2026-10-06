'use client';

import type { AuditEntry } from '@slotwise/shared';
import Link from 'next/link';
import { useState } from 'react';
import { OwnerOnly } from '@/components/owner-only';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatUkDateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type Page = { items: AuditEntry[]; nextCursor: string | null };
const ACTORS: Record<string, string> = { user: 'Dashboard user', customer: 'Customer', api_key: 'API key', system: 'System' };

/** Who changed what. Ids, status and times only — no customer personal data is stored here. */
export default function AuditPage() {
  const first = useApi<Page>('/audit-log?limit=50');
  const [more, setMore] = useState<Page>();
  const items = [...(first.data?.items ?? []), ...(more?.items ?? [])];
  const cursor = more ? more.nextCursor : (first.data?.nextCursor ?? null);

  const loadMore = async () => {
    if (!cursor) return;
    const page = await api<Page>(`/audit-log?limit=50&cursor=${cursor}`);
    setMore({ items: [...(more?.items ?? []), ...page.items], nextCursor: page.nextCursor });
  };

  return (
    <OwnerOnly>
      <Card className="max-w-3xl">
        <CardContent>
          {first.error ? (
            <ErrorState error={first.error} onRetry={first.reload} />
          ) : !first.data ? (
            <LoadingState />
          ) : items.length === 0 ? (
            <EmptyState title="Nothing yet" />
          ) : (
            <>
              <ul className="divide-y text-sm">
                {items.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{e.action}</span> · {ACTORS[e.actorType]} ·{' '}
                      {e.entity === 'booking' ? (
                        <Link className="underline underline-offset-4" href={`/bookings/${e.entityId}`}>
                          view booking
                        </Link>
                      ) : (
                        e.entity
                      )}
                    </span>
                    <time className="text-muted-foreground" dateTime={e.at}>
                      {formatUkDateTime(e.at)}
                    </time>
                  </li>
                ))}
              </ul>
              {cursor && (
                <div className="pt-4 text-center">
                  <Button variant="outline" size="sm" onClick={loadMore}>
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </OwnerOnly>
  );
}
