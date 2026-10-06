# 0003 — Idempotency keys for booking create and reschedule

## Context
A customer double-clicks "Book" on a slow phone, or a client library retries after a timeout. Without
protection, that creates two bookings (for "any staff" both can succeed) or moves a booking twice.

## Decision
- `POST` create and reschedule require an `Idempotency-Key` header (8–100 chars).
- A row `(business_id, key)` holds a hash of the request and the response. It is inserted **inside the booking
  transaction, before the booking**.
  - A concurrent duplicate blocks on the primary key until the first transaction commits. It then gets a
    unique violation and returns the stored response (`Idempotent-Replayed: true`).
  - If the first attempt fails (e.g. 409), its transaction rolls back, key row included, so a retry is a genuine
    new attempt.
  - The same key with a different body gets 422 `IDEMPOTENCY_KEY_REUSED`.
- Validation reads (hours, existing bookings) run before the transaction opens, so a transaction never waits
  for a second pool connection under load.
- Rows are deleted after 24 hours by the daily clean-up.

## Alternatives
- **Redis `SET NX` lock.** It's a second source of truth, and a crash between "lock" and "commit" leaves it wrong.
- **Dedupe on (customer, start time).** That breaks legitimate re-bookings after a cancellation and doesn't
  cover reschedule.

## Consequences
- Tests cover: same key twice → one booking with the same response; 10 concurrent requests with one key →
  one booking; a different body → 422; a failed attempt leaves no key behind.
