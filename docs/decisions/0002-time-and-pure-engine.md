# 0002 — Temporal, wall-clock hours and a pure slot engine

## Context
UK clocks change twice a year. On the last Sunday of March, 01:00–01:59 local time doesn't exist. On the last
Sunday of October, 01:00–01:59 happens twice. Booking code that adds hours to a JavaScript `Date`, or stores
working hours in UTC, quietly moves appointments by an hour on those days.

## Decision
- **Bookings are instants** (`timestamptz`, UTC). **Working hours are wall-clock minutes** since local midnight
  (540 = 09:00 UK time), never UTC.
- All conversion goes through the Temporal API (`temporal-polyfill`, imported as a module). It forces us to say
  whether a value is a `PlainDate`, a wall-clock time or an `Instant`.
- DST rules are explicit, not left to library defaults. A start in the spring gap is **skipped**. A start in the
  autumn fold is offered **once**, at its first (BST) occurrence. Window edges in a gap move to the moment the
  clocks jump. Durations and buffers are real elapsed minutes.
- `packages/engine` is a **pure function**. It does no I/O, reads no clock (`now` is an argument) and imports
  nothing from Nest. The API loads hours, overrides and busy intervals (one query per table for all candidate
  staff) and passes them in.

## Alternatives
- Luxon or date-fns-tz. They work, but their DST behaviour is implicit, and Temporal is native in Node 26.
- Storing hours as UTC or `TIME` columns. This is the classic bug: "09:00" changes meaning twice a year.

## Consequences
- 47 unit tests run in milliseconds, including both 2026 and both 2027 clock changes. Changing the fold rule
  to "later" makes 6 of them fail.
- The engine takes about 11 ms for one staff member over 30 days (Vitest bench), well inside the 200 ms budget.
- The engine is zone-agnostic, but tested only with `Europe/London` (PRD non-goal).
