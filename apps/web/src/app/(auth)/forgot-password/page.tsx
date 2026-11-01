'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Form } from '@/components/form';
import { DemoDisabled, usePublicDemo } from '@/components/demo-mode';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/forms';

function ForgotPasswordPageForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { pending, formError, run } = useSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('/auth/forgot-password', { method: 'POST', body: { email }, noRefresh: true }));
    if (ok) setSent(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Reset your password</h1>
        </CardTitle>
        <CardDescription>We’ll email you a link that works once, for an hour.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm" role="status">
            If an account exists for that email, a reset link is on its way.{' '}
            <Link href="/login" className="underline underline-offset-4">
              Back to log in
            </Link>
          </p>
        ) : (
          <Form onSubmit={submit} className="grid gap-4">
            <FormError message={formError} />
            <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Send reset link'}
            </Button>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

/** Switched off on the public demo (the API refuses it with 403 DEMO_MODE too). */
export default function ForgotPasswordPage() {
  return usePublicDemo() ? <DemoDisabled title="Reset your password" /> : <ForgotPasswordPageForm />;
}
