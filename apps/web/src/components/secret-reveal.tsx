'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Shows a just-created secret once, with a copy button. */
export function SecretReveal({ title, value, onDismiss }: { title: string; value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span>Copy it now — it won’t be shown again.</span>
        <code className="break-all rounded bg-muted px-2 py-1 text-xs">{value}</code>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Done
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
