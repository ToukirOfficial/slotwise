'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Shared shell for pages opened from an emailed link (?token=…). */
export function TokenPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: (token: string) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">{title}</h1>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Suspense>
          <WithToken>{children}</WithToken>
        </Suspense>
      </CardContent>
    </Card>
  );
}

function WithToken({ children }: { children: (token: string) => React.ReactNode }) {
  const token = useSearchParams().get('token');
  if (!token) {
    return (
      <p className="text-sm">
        This link is incomplete. Open it again from your email, or{' '}
        <Link href="/login" className="underline underline-offset-4">
          go to log in
        </Link>
        .
      </p>
    );
  }
  return children(token);
}
