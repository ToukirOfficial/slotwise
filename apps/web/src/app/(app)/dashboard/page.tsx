'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { useMe } from '@/components/me';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyBanner } from '@/components/verify-banner';

export default function DashboardPage() {
  const { me } = useMe();
  return (
    <>
      <PageHeader title={`Hello, ${me.user.name}`} description={me.business.name} />
      <VerifyBanner />
      {me.user.role === 'owner' && (
        <Card>
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 text-sm grid gap-2">
              <li>
                Check your <Link className="underline underline-offset-4" href="/settings">business details and booking rules</Link>.
              </li>
              <li>
                Add your <Link className="underline underline-offset-4" href="/settings/services">services</Link>.
              </li>
              <li>
                Add your <Link className="underline underline-offset-4" href="/settings/staff">staff</Link>, choose the
                services each one delivers, and invite them.
              </li>
              <li>
                Set everyone’s <Link className="underline underline-offset-4" href="/settings/hours">working hours</Link>.
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  );
}
