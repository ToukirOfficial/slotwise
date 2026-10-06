'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import Script from 'next/script';
import { useState, useSyncExternalStore } from 'react';
import { useMe } from '@/components/me';
import { OwnerOnly } from '@/components/owner-only';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function WidgetPage() {
  const { me } = useMe();
  const [copied, setCopied] = useState(false);
  // Read the origin on the client only, without a hydration mismatch.
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => '',
  );
  const code = `<script src="${origin}/widget/v1.js" defer></script>\n<slotwise-booking business="${me.business.slug}"></slotwise-booking>`;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <OwnerOnly>
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add booking to your website</CardTitle>
            <CardDescription>
              Paste this where the booking form should appear. Optional: <code>service=&quot;…&quot;</code> to preselect a service,{' '}
              <code>color=&quot;#0f766e&quot;</code> for your brand colour.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
              <code>{code}</code>
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy code'}
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/b/${me.business.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Your booking page
                </a>
              </Button>
            </div>
            <p className="sr-only" aria-live="polite">
              {copied ? 'Embed code copied' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            {!me.business.live && <CardDescription>Confirm your email first: the booking page goes live after that.</CardDescription>}
          </CardHeader>
          <CardContent>
            {me.business.live && (
              <>
                <slotwise-booking business={me.business.slug} />
                <Script src="/widget/v1.js" strategy="afterInteractive" />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </OwnerOnly>
  );
}
