'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useMe } from '@/components/me';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

/** Shown to the owner until their email is confirmed (public booking pages stay hidden until then). */
export function VerifyBanner() {
  const { me } = useMe();
  const [sending, setSending] = useState(false);
  if (me.business.live || me.user.role !== 'owner' || me.business.isDemo) return null;

  const resend = async () => {
    setSending(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      toast.success('Sent. Check your inbox.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Alert className="mb-6">
      <AlertTitle>Confirm your email to go live</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Customers can’t see your booking page until you click the link we emailed you.</span>
        <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
          {sending ? 'Sending…' : 'Resend email'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
