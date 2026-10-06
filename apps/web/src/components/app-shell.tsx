'use client';

import { CalendarDays, List, LogOut, Menu, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '@/components/me';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Calendar', icon: CalendarDays },
  { href: '/bookings', label: 'Bookings', icon: List },
  { href: '/customers', label: 'Customers', icon: Users, ownerOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useMe();
  return (
    <nav aria-label="Main" className="grid gap-1">
      {NAV.filter((i) => !i.ownerOnly || me.user.role === 'owner').map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted',
              active && 'bg-muted font-medium',
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox() {
  const router = useRouter();
  const { me } = useMe();
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => undefined);
    router.replace('/login');
  };
  return (
    <div className="grid gap-2 border-t pt-4 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{me.user.name}</p>
        <p className="truncate text-muted-foreground">{me.business.name}</p>
      </div>
      <Button variant="ghost" size="sm" className="justify-start" onClick={logout}>
        <LogOut className="size-4" /> Log out
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { me } = useMe();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden md:flex flex-col justify-between border-r p-4 sticky top-0 h-dvh">
        <div className="grid gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 px-3 font-semibold">
            <CalendarDays className="size-5" /> Slotwise
          </Link>
          <Nav />
        </div>
        <UserBox />
      </aside>
      <header className="md:hidden flex items-center justify-between border-b px-4 h-14">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="size-5" /> Slotwise
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col justify-between p-4">
            <div className="grid gap-6">
              <SheetTitle>Menu</SheetTitle>
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <UserBox />
          </SheetContent>
        </Sheet>
      </header>
      <main className="min-w-0 px-4 py-6 md:px-8">
        {me.business.isDemo && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            This is the public demo. Changes are reset every night; no emails are sent.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
