import { cn } from '@/lib/utils';

/** The Slotwise mark: a 3×3 diary grid with one slot taken. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn('size-5', className)}>
      <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1v18M13 1v18M1 7h18M1 13h18" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <rect x="7" y="7" width="6" height="6" rx="1" fill="var(--primary)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]', className)}>
      <LogoMark />
      Slotwise
    </span>
  );
}
