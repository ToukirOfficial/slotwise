'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/forms';
import { TokenPage } from '../token-page';

function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const { pending, formError, fields, run } = useSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('/auth/accept-invite', { method: 'POST', body: { token, password }, noRefresh: true }));
    if (ok) router.replace('/dashboard');
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={formError} />
      <Field
        label="Choose a password"
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
        {pending ? 'Saving…' : 'Join and open my diary'}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <TokenPage title="Set up your login" description="You’ve been invited to see your diary.">
      {(token) => <AcceptForm token={token} />}
    </TokenPage>
  );
}
