import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: 'Book an appointment', robots: { index: false } };

/** The hosted booking page: the same Web Component a business embeds on its own site. */
export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <slotwise-booking business={slug} />
      </div>
      <Script src="/widget/v1.js" strategy="afterInteractive" />
    </main>
  );
}
