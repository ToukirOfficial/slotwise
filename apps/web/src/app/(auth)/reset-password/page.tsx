'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/forms';
import { TokenPage } from '../token-page';

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { pending, formError, fields, run } = useSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('/auth/reset-password', { method: 'POST', body: { token, password }, noRefresh: true }));
    if (ok) setDone(true);
  };

  if (done)
    return (
      <p className="text-sm" role="status">
        Password changed. You’ve been logged out everywhere.{' '}
        <Link href="/login" className="underline underline-offset-4">
          Log in
        </Link>
      </p>
    );
  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={formError} />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        hint="At least 10 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fields.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return <TokenPage title="Choose a new password">{(token) => <ResetForm token={token} />}</TokenPage>;
}
