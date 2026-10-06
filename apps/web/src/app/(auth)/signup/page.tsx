'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/forms';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: '', name: '', email: '', password: '' });
  const { pending, formError, fields, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('/auth/register', { method: 'POST', body: form, noRefresh: true }));
    if (ok) router.replace('/dashboard');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Create your booking page</h1>
        </CardTitle>
        <CardDescription>Free and open source. Takes about ten minutes to set up.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <FormError message={formError} />
          <Field label="Business name" required value={form.businessName} onChange={set('businessName')} error={fields.businessName} />
          <Field label="Your name" autoComplete="name" required value={form.name} onChange={set('name')} error={fields.name} />
          <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fields.email} />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            hint="At least 10 characters."
            value={form.password}
            onChange={set('password')}
            error={fields.password}
          />
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create account'}
          </Button>
          <p className="text-sm text-center">
            Already have an account?{' '}
            <Link href="/login" className="underline underline-offset-4">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
