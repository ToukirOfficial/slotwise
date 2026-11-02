'use client';

import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const TOTAL = 100;
const SLOTS = ['09:00', '09:45', '10:30', '11:15', '12:00'];
const TARGET = 2; // 10:30
const BOOKED: Record<number, string> = { 0: 'Priya N., follow-up', 4: 'Tom W., sports massage' };

/**
 * The hero: 100 customers press "Book" for the same 10:30 slot at once.
 * PostgreSQL's exclusion constraint lets exactly one through; the other 99 get 409 SLOT_TAKEN.
 * Plays once on load, replays on request, and shows the end state straight away for reduced motion.
 */
export function CollisionDemo() {
  const [sent, setSent] = useState(0);
  const [winner, setWinner] = useState(37);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setWinner(10 + Math.floor(Math.random() * 70));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSent(TOTAL);
      return;
    }
    setSent(0);
    timer.current = setInterval(() => {
      setSent((n) => {
        if (n >= TOTAL) {
          if (timer.current) clearInterval(timer.current);
          return n;
        }
        return Math.min(TOTAL, n + 2);
      });
    }, 28);
  }, []);

  useEffect(() => {
    const start = setTimeout(play, 500);
    return () => {
      clearTimeout(start);
      if (timer.current) clearInterval(timer.current);
    };
  }, [play]);

  const done = sent >= TOTAL;
  const won = sent > winner;
  const lines = Array.from({ length: Math.min(sent, 7) }, (_, i) => sent - 1 - i);

  return (
    <figure
      aria-label="Demo: 100 simultaneous bookings for the same 10:30 slot. One succeeds, 99 are refused."
      className="overflow-hidden rounded-2xl border border-[var(--graphite-line)] bg-[var(--graphite)] text-white shadow-[0_2px_4px_rgba(20,20,24,0.06),0_40px_80px_-36px_rgba(20,20,24,0.6)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--graphite-line)] px-4 py-3 text-[13px]">
        <span className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[var(--graphite-line)]" />
            <span className="size-2.5 rounded-full bg-[var(--graphite-line)]" />
            <span className="size-2.5 rounded-full bg-[var(--graphite-line)]" />
          </span>
          <span className="font-medium">Tue 3 Nov, Dr Amira Khan</span>
        </span>
        <span className="text-[var(--graphite-text)]">UK time</span>
      </div>

      <div className="grid sm:grid-cols-[1fr_1.1fr]">
        {/* The diary column */}
        <ol className="grid gap-1.5 p-3.5 sm:border-r sm:border-[var(--graphite-line)]">
          {SLOTS.map((t, i) => {
            const isTarget = i === TARGET;
            const taken = BOOKED[i];
            return (
              <li
                key={t}
                className={[
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-colors duration-300',
                  isTarget && won
                    ? 'border-[var(--primary)] bg-[var(--primary)] font-medium text-white'
                    : isTarget
                      ? 'border-dashed border-[var(--signal-dark)]/70 bg-[var(--signal-dark)]/10 text-white'
                      : taken
                        ? 'border-[var(--graphite-line)] bg-[var(--graphite-2)] text-[var(--graphite-text)]'
                        : 'border-[var(--graphite-line)] text-[var(--graphite-text)]',
                ].join(' ')}
              >
                <span className="w-11 shrink-0 font-mono tabular-nums">{t}</span>
                <span className="truncate">
                  {isTarget ? (won ? 'Sam T., initial assessment' : `Free · ${Math.max(0, sent)} trying`) : (taken ?? 'Free')}
                </span>
              </li>
            );
          })}
        </ol>

        {/* The request log */}
        <div className="flex min-h-[236px] flex-col border-t border-[var(--graphite-line)] p-3.5 font-mono text-[12px] sm:border-t-0">
          <div className="mb-2 flex justify-between text-[var(--graphite-text)]">
            <span>POST /bookings 10:30</span>
            <span className="tabular-nums">{sent}/{TOTAL}</span>
          </div>
          <ul className="grid gap-1" aria-hidden>
            {lines.map((n) => {
              const ok = n === winner;
              return (
                <li key={n} className="flex justify-between gap-2 tabular-nums">
                  <span className="text-[var(--graphite-text)]">req {String(n + 1).padStart(3, '0')}</span>
                  <span className={ok ? 'font-semibold text-[var(--signal-dark)]' : 'text-[#7d8592]'}>
                    {ok ? '201 Created' : '409 SLOT_TAKEN'}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <p className="font-sans text-[13px]" aria-live="polite">
              {done ? (
                <>
                  <span className="font-semibold text-white">1 booked</span>
                  <span className="text-[var(--graphite-text)]">, 99 refused</span>
                </>
              ) : (
                <span className="text-[var(--graphite-text)]">Sending at once…</span>
              )}
            </p>
            <button
              type="button"
              onClick={play}
              disabled={!done}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--graphite-line)] px-2 py-1 font-sans text-[12px] text-[var(--graphite-text)] hover:text-white disabled:opacity-0"
            >
              <RotateCcw className="size-3" aria-hidden /> Run again
            </button>
          </div>
        </div>
      </div>
    </figure>
  );
}
