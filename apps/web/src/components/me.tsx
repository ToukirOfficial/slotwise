'use client';

import type { Me } from '@slotwise/shared';
import { createContext, useContext } from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import { useApi } from '@/lib/use-api';

const MeContext = createContext<{ me: Me; reload: () => void } | null>(null);

/** Loads the current user once for the whole dashboard. A 401 redirects to /login (see lib/api). */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const { data, error, reload } = useApi<Me>('/auth/me');
  // Keep showing the app while a reload is in flight; only the first load blocks.
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState />;
  return <MeContext.Provider value={{ me: data, reload }}>{children}</MeContext.Provider>;
}

export const useMe = () => {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe outside MeProvider');
  return ctx;
};
