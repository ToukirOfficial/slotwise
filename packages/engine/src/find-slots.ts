import { Temporal } from 'temporal-polyfill';

/**
 * The slot engine: a pure function. No database, no clock, no I/O — `now` and every busy interval are
 * passed in, so the trickiest logic in the product can be tested exhaustively and fast.
 *
 * Time model:
 * - Working hours are LOCAL wall-clock minutes since midnight in the business zone (540 = 09:00 UK time).
 * - Bookings and busy intervals are INSTANTS (UTC).
 * - Candidate starts are generated on the local grid inside each working window, then turned into instants.
 *   A local time that doesn't exist (spring-forward gap) is skipped. A local time that happens twice
 *   (autumn fold) is offered once, at its first (earlier, BST) occurrence. Durations and buffers are real
 *   elapsed minutes.
 */

const MINUTE_MS = 60_000;

export interface WeeklyWindow {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface DateOverride {
  /** Local date, YYYY-MM-DD. */
  date: string;
  closed: boolean;
  startMin: number | null;
  endMin: number | null;
}

export interface BusyInterval {
  start: Temporal.Instant;
  end: Temporal.Instant;
}

export interface FindSlotsInput {
  /** IANA zone of the business, e.g. "Europe/London". */
  zone: string;
  /** First and last local date to search, inclusive (YYYY-MM-DD). */
  fromDate: string;
  toDate: string;
  now: Temporal.Instant;
  weeklyHours: WeeklyWindow[];
  /** Overrides replace the weekly hours of their date: one closed row, or one or more windows. */
  overrides: DateOverride[];
  /** Existing bookings of this staff member, already widened by their own buffers. */
  busy: BusyInterval[];
  service: { durationMin: number; bufferBeforeMin: number; bufferAfterMin: number };
  rules: { minNoticeMin: number; maxDaysAhead: number; slotStepMin: number };
}

export interface Slot {
  /** UTC ISO instant. */
  startsAt: string;
  /** UTC ISO instant (start + duration, without buffers). */
  endsAt: string;
  /** Local wall-clock label in the business zone, e.g. "09:15". */
  localTime: string;
}

export interface SlotDay {
  date: string;
  slots: Slot[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const label = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/**
 * The epoch-ms instant of local `minute` on `date`, or null if that local time doesn't exist (DST gap).
 * Ambiguous times (DST fold) resolve to the earlier occurrence.
 */
export function localToEpochMs(date: Temporal.PlainDate, minute: number, zone: string): number | null {
  const wallClock =
    minute === 1440
      ? date.add({ days: 1 }).toPlainDateTime()
      : date.toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 });
  const zdt = wallClock.toZonedDateTime(zone, { disambiguation: 'earlier' });
  // In a gap, 'earlier' moves the time; if the wall clock changed, this local time never happened.
  if (!Temporal.PlainDateTime.compare(zdt.toPlainDateTime(), wallClock)) return zdt.epochMilliseconds;
  return null;
}

/** For window edges: a gap edge moves to the moment the clocks jump (Temporal's 'compatible'). */
function windowEdgeMs(date: Temporal.PlainDate, minute: number, zone: string): number {
  const wallClock =
    minute === 1440
      ? date.add({ days: 1 }).toPlainDateTime()
      : date.toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 });
  return wallClock.toZonedDateTime(zone, { disambiguation: 'compatible' }).epochMilliseconds;
}

/** Sorts and merges busy intervals so a single forward-moving pointer can test overlap. */
function mergeBusy(busy: BusyInterval[]): { start: number; end: number }[] {
  const sorted = busy
    .map((b) => ({ start: b.start.epochMilliseconds, end: b.end.epochMilliseconds }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const b of sorted) {
    const last = merged.at(-1);
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  return merged;
}

/** Working windows (local minutes) for one date: the override if there is one, otherwise the weekly hours. */
function windowsFor(
  date: Temporal.PlainDate,
  input: Pick<FindSlotsInput, 'weeklyHours' | 'overrides'>,
): { startMin: number; endMin: number }[] {
  const iso = date.toString();
  const overrides = input.overrides.filter((o) => o.date === iso);
  const windows =
    overrides.length > 0
      ? overrides.some((o) => o.closed)
        ? []
        : overrides.map((o) => ({ startMin: o.startMin ?? 0, endMin: o.endMin ?? 0 }))
      : input.weeklyHours.filter((w) => w.weekday === date.dayOfWeek);
  return windows.filter((w) => w.startMin < w.endMin).sort((a, b) => a.startMin - b.startMin);
}

export function findSlots(input: FindSlotsInput): SlotDay[] {
  const { zone, service, rules } = input;
  if (rules.slotStepMin < 1) throw new RangeError('slotStepMin must be at least 1');
  if (service.durationMin < 1) throw new RangeError('durationMin must be at least 1');

  const from = Temporal.PlainDate.from(input.fromDate);
  const to = Temporal.PlainDate.from(input.toDate);
  if (Temporal.PlainDate.compare(from, to) > 0) throw new RangeError('fromDate is after toDate');

  const nowMs = input.now.epochMilliseconds;
  const earliestStart = nowMs + rules.minNoticeMin * MINUTE_MS;
  // Horizon by local date: "book up to N days ahead" means up to and including today + N.
  const lastDate = input.now.toZonedDateTimeISO(zone).toPlainDate().add({ days: rules.maxDaysAhead });
  const before = service.bufferBeforeMin * MINUTE_MS;
  const length = service.durationMin * MINUTE_MS;
  const after = service.bufferAfterMin * MINUTE_MS;

  const busy = mergeBusy(input.busy);
  let pointer = 0; // candidates only move forward in time, so the busy pointer never goes back

  const days: SlotDay[] = [];
  for (let date = from; Temporal.PlainDate.compare(date, to) <= 0; date = date.add({ days: 1 })) {
    const slots: Slot[] = [];
    if (Temporal.PlainDate.compare(date, lastDate) <= 0) {
      for (const window of windowsFor(date, input)) {
        const windowStart = windowEdgeMs(date, window.startMin, zone);
        const windowEnd = windowEdgeMs(date, window.endMin, zone);

        for (let minute = window.startMin; minute < window.endMin; minute += rules.slotStepMin) {
          const start = localToEpochMs(date, minute, zone);
          if (start === null) continue; // doesn't exist today (spring forward)
          if (start < earliestStart) continue;

          const blockStart = start - before;
          const blockEnd = start + length + after;
          if (blockStart < windowStart || blockEnd > windowEnd) continue;

          while (pointer < busy.length && busy[pointer]!.end <= blockStart) pointer++;
          const next = busy[pointer];
          if (next && next.start < blockEnd) continue; // [) ranges: touching is fine

          slots.push({
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(start + length).toISOString(),
            localTime: label(minute),
          });
        }
      }
    }
    days.push({ date: date.toString(), slots });
  }
  return days;
}

/** True if `startsAt` is one of the starts findSlots would offer (server-side re-validation of a booking). */
export function isOfferedStart(input: Omit<FindSlotsInput, 'fromDate' | 'toDate'>, startsAt: Temporal.Instant): boolean {
  const date = startsAt.toZonedDateTimeISO(input.zone).toPlainDate().toString();
  const iso = new Date(startsAt.epochMilliseconds).toISOString();
  return findSlots({ ...input, fromDate: date, toDate: date }).some((d) => d.slots.some((s) => s.startsAt === iso));
}

/**
 * True if [start, end) lies inside one of the staff member's working windows on the start's local date.
 * Used to flag confirmed bookings that no longer fit after hours were changed (bookings are never moved).
 */
export function isWithinWorkingHours(args: {
  zone: string;
  weeklyHours: WeeklyWindow[];
  overrides: DateOverride[];
  start: Temporal.Instant;
  end: Temporal.Instant;
}): boolean {
  const date = args.start.toZonedDateTimeISO(args.zone).toPlainDate();
  const windows = windowsFor(date, { weeklyHours: args.weeklyHours, overrides: args.overrides });
  const start = args.start.epochMilliseconds;
  const end = args.end.epochMilliseconds;
  return windows.some(
    (w) => start >= windowEdgeMs(date, w.startMin, args.zone) && end <= windowEdgeMs(date, w.endMin, args.zone),
  );
}
