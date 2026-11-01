'use client';

import Link from 'next/link';
import { createContext, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** The public demo login (also in the README). The demo business resets every hour. */
export const DEMO_LOGIN = { email: 'demo@slotwise.example', password: 'demo-physio-2026' } as const;

const PublicDemo = createContext(false);

export function PublicDemoProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <PublicDemo.Provider value={value}>{children}</PublicDemo.Provider>;
}

/** True on the public demo site (PUBLIC_DEMO=true). */
export const usePublicDemo = () => useContext(PublicDemo);

/** Shown instead of sign-up, invite and password-reset pages on the public demo. */
export function DemoDisabled({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">{title}</h1>
        </CardTitle>
        <CardDescription>This is a public demo, so this is switched off.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          You can still explore everything in the demo clinic.{' '}
          <Link href="/login?demo=1" className="underline underline-offset-4">
            Try the live demo
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
