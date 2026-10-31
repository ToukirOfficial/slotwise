import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: 'Book an appointment', robots: { index: false } };

/** The hosted booking page: the same Web Component a business embeds on its own site. */
export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl flex-1">
        <div className="rounded-xl border bg-card p-4 shadow-[0_16px_40px_-28px_rgba(21,24,29,0.35)] sm:p-6">
          <slotwise-booking business={slug} />
        </div>
      </div>
      <p className="mt-8 text-center text-[12px] text-muted-foreground">
        Booking by{' '}
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Slotwise
        </Link>
      </p>
      <Script src="/widget/v1.js" strategy="afterInteractive" />
    </main>
  );
}
