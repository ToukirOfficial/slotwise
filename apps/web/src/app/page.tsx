import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Slotwise</h1>
      <p className="max-w-md text-muted-foreground">
        Open-source booking for appointment businesses. One script tag on your website, no double-bookings,
        correct across clock changes.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/signup">Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
