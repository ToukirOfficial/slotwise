'use client';

import { useMe } from '@/components/me';
import { EmptyState } from '@/components/states';

/** UI convenience only — the API enforces the same rule. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { me } = useMe();
  if (me.user.role !== 'owner') return <EmptyState title="Only the business owner can change this." />;
  return children;
}
