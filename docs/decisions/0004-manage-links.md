# 0004 — Manage links without storing the token

## Context
Customers have no account. Each email carries a link (`/manage/{token}`) that lets them view, move or cancel
their booking. The PRD says only a hash of the token may be stored. But emails are sent later, by the worker:
confirmation now, a reminder days later, another email after a reschedule. Each one needs the working link.

## Decision
The token is `HMAC-SHA256(MANAGE_TOKEN_SECRET, "manage:" + bookingId)`, base64url (256 bits). The booking row
stores `SHA-256(token)`, and lookups go by that hash. The worker re-derives the token whenever it renders an
email, so the plain token is never written to the database, the outbox or Redis. The link expires when the
appointment ends. After a cancel it still opens (showing "cancelled"), but changes are refused.

## Alternatives
- **A random token stored only as a hash.** Then nothing can rebuild the link for the reminder or the
  reschedule email, unless the plain token sits in the outbox or job payload (where it would be stored after all).
- **Storing the token encrypted.** This works, but it's a secret at rest for the life of the booking.

## Consequences
- A database leak alone reveals no working links. An attacker also needs the env secret.
- A link can't be rotated without changing the secret (which rotates all of them). It can only expire. For a
  link that dies at the end of the appointment, that's acceptable.
- Same pattern as auth emails, whose single-use tokens are created by the worker at send time.
