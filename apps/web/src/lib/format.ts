/** £12.50 from 1250. Display only. */
export const formatPence = (pence: number): string =>
  pence === 0 ? 'Free' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

/** "1250" ← "12.50". Returns NaN for bad input. */
export const poundsToPence = (s: string): number => (s.trim() === '' ? 0 : Math.round(Number(s) * 100));

export const formatDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

const LONDON = 'Europe/London';

/** Times are always shown in business time (UK), whatever the viewer's own zone. */
export const formatUkTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const formatUkDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, ...opts }).format(new Date(iso));

export const formatUkDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** A local date string (2026-10-25) formatted without any time-zone shifting. */
export const formatLocalDate = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));

/** Today's date in the UK as YYYY-MM-DD. */
export const ukToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
