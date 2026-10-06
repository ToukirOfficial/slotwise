'use client';

import type { Customer } from '@slotwise/shared';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { OwnerOnly } from '@/components/owner-only';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatUkDateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type Page = { items: Customer[]; nextCursor: string | null };

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [erasing, setErasing] = useState<Customer>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim().length >= 2 ? search.trim() : ''), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data, error, loading, reload } = useApi<Page>(`/customers?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);

  const erase = async () => {
    if (!erasing) return;
    setBusy(true);
    try {
      await api(`/customers/${erasing.id}/erase`, { method: 'POST' });
      toast.success('Customer details erased');
      setErasing(undefined);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerOnly>
      <PageHeader title="Customers" description="Personal details are kept only here, and erased automatically after your retention period." />
      <div className="relative mb-4 w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search customers"
          placeholder="Name, email or phone"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Card>
        <CardContent>
          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : loading && !data ? (
            <LoadingState />
          ) : !data?.items.length ? (
            <EmptyState title={q ? 'No customers match' : 'No customers yet'} />
          ) : (
            <ul className="divide-y">
              {data.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    {c.erasedAt ? (
                      <p className="text-muted-foreground">
                        Erased customer <Badge variant="secondary">Erased</Badge>
                      </p>
                    ) : (
                      <>
                        <p className="font-medium">{c.name}</p>
                        <p className="truncate text-muted-foreground">
                          {c.email} · {c.phone}
                        </p>
                      </>
                    )}
                    <p className="text-muted-foreground">
                      {c.bookingCount} booking{c.bookingCount === 1 ? '' : 's'}
                      {c.lastBookingAt && ` · last ${formatUkDateTime(c.lastBookingAt)}`}
                    </p>
                  </div>
                  {!c.erasedAt && (
                    <Button size="sm" variant="outline" onClick={() => setErasing(c)}>
                      Erase details
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {erasing && (
        <Dialog open onOpenChange={(o) => !o && setErasing(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Erase {erasing.name}’s details?</DialogTitle>
              <DialogDescription>
                Their name, email and phone are deleted for good. Their past bookings stay as anonymous times. This can’t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setErasing(undefined)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={erase} disabled={busy}>
                {busy ? 'Erasing…' : 'Erase'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </OwnerOnly>
  );
}
