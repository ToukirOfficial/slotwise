'use client';

import type { Booking } from '@slotwise/shared';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatUkDateTime, ukToday } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type Page = { items: Booking[]; nextCursor: string | null };

export default function BookingsPage() {
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [more, setMore] = useState<{ items: Booking[]; cursor: string | null; key: string }>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Search after the user stops typing for a moment.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim().length >= 2 ? search.trim() : ''), 300);
    return () => clearTimeout(id);
  }, [search]);

  const qs = new URLSearchParams({ limit: '50' });
  if (scope === 'upcoming') qs.set('from', ukToday());
  if (q) qs.set('q', q);
  const path = `/bookings?${qs.toString()}`;
  const first = useApi<Page>(path);
  const extra = more?.key === path ? more : undefined;
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api<Page>(`${path}&cursor=${encodeURIComponent(cursor)}`);
      setMore({ key: path, items: [...(extra?.items ?? []), ...page.items], cursor: page.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        actions={
          <Button asChild size="sm">
            <Link href="/bookings/new">
              <Plus className="size-4" /> New booking
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={scope} onValueChange={(v) => setScope(v as 'upcoming' | 'all')}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search by customer name, email or phone"
            placeholder="Name, email or phone"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <Card>
        <CardContent>
          {first.error ? (
            <ErrorState error={first.error} onRetry={first.reload} />
          ) : first.loading && !first.data ? (
            <LoadingState />
          ) : items.length === 0 ? (
            <EmptyState title={q ? 'No bookings match' : 'No bookings yet'} />
          ) : (
            <>
              <ul className="divide-y">
                {items.map((b) => (
                  <li key={b.id}>
                    <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50 -mx-2 px-2 rounded-md">
                      <div className="min-w-0">
                        <p className="font-medium">{formatUkDateTime(b.startsAt)}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {b.customer.name ?? 'Erased customer'} · {b.service.name} · {b.staff.displayName}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {b.outsideHours && <Badge variant="outline">Outside hours</Badge>}
                        {b.status === 'cancelled' && <Badge variant="secondary">Cancelled</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              {cursor && (
                <div className="pt-4 text-center">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
