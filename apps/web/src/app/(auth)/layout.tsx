import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Slotwise
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
