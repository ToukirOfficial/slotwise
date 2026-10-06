# 0001 — The database prevents double-booking (exclusion constraint)

## Context
Check-then-insert in application code isn't safe. Two requests can both see 10:00 as free and both insert.
Row locks don't help either, because the conflicting row doesn't exist yet.

## Decision
PostgreSQL refuses the overlap itself:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (staff_id WITH =, tstzrange(blocked_start, blocked_end, '[)') WITH &&)
  WHERE (status = 'confirmed');
```

- `blocked_start/end` is the appointment widened by the service's buffers. `[)` lets one booking start the
  moment the previous one ends.
- The constraint lives in a hand-edited `--create-only` migration (Prisma can't express it). `prisma migrate
  diff` shows no drift, so later migrations don't try to drop it. Each new migration is still checked by hand.
- One helper, `isSlotConflict`, recognises the error. With Prisma 7 + `@prisma/adapter-pg`, SQLSTATE `23P01`
  arrives in `meta.driverAdapterError.cause.originalCode`; the helper also checks the constraint name. It maps
  to HTTP 409 `SLOT_TAKEN`. An integration test triggers the real error against real PostgreSQL.
- "Any staff" tries candidates in a fixed order (fewest bookings that day, then id), each inside a
  `SAVEPOINT`, so one conflict doesn't abort the whole transaction.
- Reschedule is a single `UPDATE` of the times. The constraint checks the new range against every other
  booking, so the old slot is freed and the new one taken in one step, or nothing changes.

## Alternatives
- **PostgreSQL 18 `UNIQUE (… WITHOUT OVERLAPS)`** uses the same GiST mechanism with nicer syntax, but a unique
  constraint can't have a `WHERE`, and cancelled bookings must not block the diary.
- **`SELECT … FOR UPDATE` on the staff row** serialises all bookings per person. That's correct, but it moves the
  guarantee into code that every write path must remember to call.
- **Advisory locks**: the same objection, and easy to get wrong across savepoints.

## Consequences
- Proof: 100 parallel `POST /bookings` for one slot give exactly 1 × 201, 99 × 409, and 1 row (integration test).
- The slot engine is still used first, for good UX and to reject off-grid times (422 `SLOT_UNAVAILABLE`),
  but correctness never depends on it.
