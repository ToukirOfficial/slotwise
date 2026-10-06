'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { LoadingState } from '@/components/states';
import { api, errorMessage } from '@/lib/api';
import { TokenPage } from '../token-page';

function Verify({ token }: { token: string }) {
  const [state, setState] = useState<'pending' | 'done' | string>('pending');
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // React dev mode runs effects twice; the token is single-use
    sent.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token }, noRefresh: true })
      .then(() => setState('done'))
      .catch((e: unknown) => setState(errorMessage(e)));
  }, [token]);

  if (state === 'pending') return <LoadingState label="Confirming…" />;
  if (state === 'done')
    return (
      <p className="text-sm">
        Thanks — your email is confirmed and your booking page is live.{' '}
        <Link href="/dashboard" className="underline underline-offset-4">
          Go to the dashboard
        </Link>
      </p>
    );
  return <FormError message={state} />;
}

export default function VerifyEmailPage() {
  return <TokenPage title="Confirm your email">{(token) => <Verify token={token} />}</TokenPage>;
}
