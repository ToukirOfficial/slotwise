import { Check } from 'lucide-react';
import Link from 'next/link';
import { PublicDemoProvider } from '@/components/demo-mode';
import { Logo } from '@/components/logo';
import { isPublicDemo } from '@/lib/demo';

const POINTS = [
  'Customers book from your website or your own booking page',
  'Two people can never take the same slot',
  'Confirmations and reminders go out on their own',
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const publicDemo = await isPublicDemo();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[var(--graphite)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_bottom,white_1px,transparent_1px),linear-gradient(to_right,white_1px,transparent_1px)] [background-size:100%_48px,20%_100%]"
        />
        <Link href="/" className="relative" aria-label="Slotwise home">
          <Logo />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-[-0.025em]">Your diary, without the clashes.</p>
          <ul className="mt-6 grid gap-3 text-[15px] text-[var(--graphite-text)]">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-[#8fa9f7]" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-[var(--graphite-text)]">
          Exploring? <Link href="/login?demo=1" className="text-white underline underline-offset-4">Open the demo clinic</Link>.
        </p>
      </aside>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
        <Link href="/" className="lg:hidden" aria-label="Slotwise home">
          <Logo />
        </Link>
        <div className="w-full max-w-sm">
          <PublicDemoProvider value={publicDemo}>{children}</PublicDemoProvider>
        </div>
      </main>
    </div>
  );
}
