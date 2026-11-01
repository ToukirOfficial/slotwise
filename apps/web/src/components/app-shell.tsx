'use client';

import { CalendarDays, ExternalLink, List, LogOut, Menu, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoMark } from '@/components/logo';
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
    <nav aria-label="Main" className="grid gap-0.5">
      {NAV.filter((i) => !i.ownerOnly || me.user.role === 'owner').map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              active && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className={cn('size-4', active && 'text-primary')} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

function UserBox() {
  const router = useRouter();
  const { me } = useMe();
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => undefined);
    router.replace('/login');
  };
  return (
    <div className="grid gap-1 border-t pt-3 text-sm">
      {me.business.live && (
        <a
          href={`/b/${me.business.slug}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-4" /> Your booking page
        </a>
      )}
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {initials(me.user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{me.user.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{me.business.name}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={logout}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Brand() {
  const { me } = useMe();
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-muted">
      <LogoMark />
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold tracking-[-0.02em]">Slotwise</span>
        <span className="block truncate text-[12px] leading-tight text-muted-foreground">{me.business.name}</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { me } = useMe();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r bg-sidebar p-3 md:flex">
        <div className="grid gap-5">
          <Brand />
          <Nav />
        </div>
        <UserBox />
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-sidebar/90 px-4 backdrop-blur md:hidden">
        <Brand />
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
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1180px]">
          {me.business.isDemo && (
            <p className="mb-5 flex flex-wrap items-center gap-x-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <span className="font-medium">Public demo.</span> Changes are reset automatically and no emails are sent.
            </p>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
