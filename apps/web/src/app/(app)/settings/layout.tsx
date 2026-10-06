'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { useMe } from '@/components/me';
import { cn } from '@/lib/utils';

const TABS: { href: string; label: string; ownerOnly: boolean }[] = [
  { href: '/settings', label: 'Business', ownerOnly: true },
  { href: '/settings/services', label: 'Services', ownerOnly: true },
  { href: '/settings/staff', label: 'Staff', ownerOnly: true },
  { href: '/settings/hours', label: 'Hours & time off', ownerOnly: false },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const tabs = TABS.filter((t) => !t.ownerOnly || me.user.role === 'owner');
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground',
                active && 'border-foreground text-foreground font-medium',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
