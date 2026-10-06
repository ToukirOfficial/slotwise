# ASSUMPTIONS.md — decisions the PRD doesn't make

Change any of these by telling me. Items marked (Q) depend on an open question in `plan.md`.

## Environment
- **A0.** Development happens on WSL (Ubuntu), not the Mac that CLAUDE.md mentions. Scripts, `pnpm setup` and `deploy.sh` must work on both: load nvm from `~/.nvm/nvm.sh`, with Homebrew paths only as a fallback.
- **A0b.** Ports: web 8015, API 8115. Databases: `slotwise_dev` and `slotwise_test`.

## Answers to the open questions
- **Q0.** "Go" was given without answering the plan's open questions, so I went with the recommended answers. The name stays "Slotwise" (a working name, easy to find-and-replace). The worker runs as a second process. Emails are unique across all businesses (A1). Local setup stays Docker-free. Redis and the domain will be confirmed at the first deploy.

## Auth and accounts
- **A1 (Q3).** `users.email` is unique across all businesses. One login belongs to one business, so login needs no business picker.
- **A2.** Access token (JWT, `@nestjs/jwt`) lasts 15 minutes. Refresh token lasts 30 days and rotates on every use. Cookies are `Secure` in dev too, because browsers treat `localhost` as a secure context.
- **A3.** Token lifetimes: email verification 24 h, password reset 1 h (PRD), staff invite 7 days. All are single-use.
- **A4.** An unverified owner can log in and set everything up. Only the public endpoints stay 404 until the email is verified.
- **A5.** Signing up also creates a `staff` row for the owner (most small businesses are one person). The owner can deactivate it.
- **A6.** Rate limits: login 5/min per email and 20/min per IP; register 3/min per IP; forgot-password 3/15 min per email and 5/15 min per IP; token links (verify/reset/invite) 20/min per IP; public availability 60/min per IP; public booking create 10/min per IP; API key 60/min per key (PRD).

## Business rules and defaults
- **A7.** Defaults: minimum notice 120 min, maximum 60 days ahead, slot step 15 min, cut-off 24 h, retention 24 months, owner notifications on.
- **A8.** Staff can create, cancel and reschedule bookings only in their own diary. They can't edit services or business settings.
- **A9.** `Idempotency-Key` is required on **every** reschedule endpoint (dashboard, API and manage link), not only the manage-link one listed in PRD §7. CLAUDE.md requires it for reschedule in general.
- **A10.** For "any staff", only active staff linked to the service are tried. "Fewest bookings that day" counts confirmed bookings on that local date.
- **A11.** The manage token stays the same on reschedule, and its expiry moves to the new end time. After a cancel the link still opens (showing "cancelled") until the original end time, but every change is refused.
- **A12.** The limit of 3 future bookings per email does not apply to bookings made by the owner or staff in the dashboard (walk-ins, regulars).
- **A13.** The week view starts on Monday. All UI times show in `Europe/London` with a "UK time" label.
- **A14.** Booking search matches customer name, email or phone (case-insensitive, at least 2 characters). Cursor = `(starts_at, id)`.

## Caching and jobs
- **A15.** Availability is **not** cached in Redis in v1. A stale cache could offer a slot that's taken, and the engine plus one indexed query already meets the 200 ms target. Only the public business profile (`GET /public/{slug}`) is cached, with a 60 s TTL and invalidated on change.
- **A16.** The outbox relay runs every 5 s, reconcile hourly, clean-up daily at 03:00 UK time, and the demo reseed nightly at 04:00 UK time, all as BullMQ repeatable jobs inside the worker. No system cron.
- **A17.** Auth emails (verify, reset, invite) also go through the outbox and worker (rule 8), so the minimal worker path is built in Phase 1.

## Demo
- **A18.** Demo owner login: `demo@slotwise.example` with a fixed public password, shown in the README. Demo accounts can't reset their password or change their email. The `.example` domain means no mail could ever reach anyone.

## Webhooks
- **A19.** Retry schedule: 8 attempts, with gaps of 1 m, 5 m, 30 m, 1 h, 3 h, 6 h and 12 h (≈ 23 h in total). HTTP URLs are allowed only when `NODE_ENV !== 'production'`, and private IPs stay blocked even in dev unless `WEBHOOK_ALLOW_PRIVATE=true`, which is refused in production and never set by default.

## Added while building (Phase 1)
- **A20.** `pnpm setup` is a built-in pnpm command (it installs pnpm itself), so the project script is **`pnpm run setup`**. It lives in `scripts/setup.mjs`.
- **A21.** `POST /auth/resend-verification` (owner only, 3 per 15 min) was added. Without it, an expired 24-hour link would leave a business unable to go live.
- **A22.** Auth emails (verify, reset, invite) get their token in the **worker**, at send time. The outbox only holds the user id, so a plain token is never stored in the database or in Redis.
- **A23.** The access token (JWT, 15 min) carries role, business, staff id and the demo flag, so a removed or changed login keeps working for at most 15 minutes. Refresh always re-reads the user.
- **A24.** An invite that was never accepted doesn't reserve the email: registering a new business with that email removes the pending invite. Demo businesses can't invite anyone, so a demo visitor can't use up someone else's email.
- **A25.** Every list endpoint uses the same `{ items, nextCursor }` shape. Where possible the cursor is the UUIDv7 id (time-ordered). The dashboard loads services, staff, keys and webhooks with `limit=100`.
- **A26.** `ioredis` is a direct dependency. It's the client BullMQ already uses, and it's needed for the health `PING` and the cache.
- **A27.** `CLAUDE.md` and `PRD.md` are local working docs and are gitignored: neither is on the allowed-docs list for the public repo, and `CLAUDE.md` names other projects.
- **A28.** The demo business's web address (slug) can't be changed, so the README's embed example keeps working.


## Added while building (Phases 3–4)
- **A29.** The slot grid is anchored at the start of each working window (a 09:10 window offers 09:10, 09:25, …). The horizon is by local date: "60 days ahead" means up to and including today + 60.
- **A30.** Window edges that fall in a spring-forward gap move to the moment the clocks jump (Temporal's `compatible`). Candidate starts in the gap are skipped.
- **A31.** Slugs `manage`, `api`, `admin`, `b`, `widget`, `public`, `docs` and `health` are reserved, because they would clash with routes.
- **A32.** The public profile (`GET /public/{slug}`) lists only active services that at least one active staff member delivers, and only staff with at least one such service.
- **A33.** A booking at a start that is valid but already taken gets 409 `SLOT_TAKEN`. A start that was never offered (off-grid, outside hours or notice) gets 422 `SLOT_UNAVAILABLE`.
- **A34.** The manage-link token is `HMAC-SHA256(MANAGE_TOKEN_SECRET, bookingId)`: 256 bits, with only its SHA-256 hash stored. Because it's derived rather than random, the worker can rebuild the link for any email without the plain token ever being stored. The cost is that a link can't be rotated, only expired: when the appointment ends, or on cancel.
- **A35.** Cancelling is itself idempotent (cancelling twice returns the booking unchanged), so it needs no Idempotency-Key. Bookings that have already started can't be cancelled or moved by anyone.
- **A36.** Reschedule keeps the same staff member and uses the booking's own snapshot (length and buffers), not the service's current settings.
- **A37.** Idempotency rows store only `{ bookingId }`. The response is rebuilt from the database, so no customer details sit outside `customers`.
- **A38.** The calendar is an agenda-style day/week view (a list per day) rather than a time grid. It reads better on a phone.
- **A39.** Owner notices go to every verified owner login of the business, as one job per booking version.
- **A40.** If Redis lost a reminder and the 24-hour mark has already passed (but the appointment hasn't started, and it was booked more than 24 h ahead), the hourly reconcile sends the reminder straight away rather than skipping it.
- **A41.** A confirmation or reschedule email whose booking has changed since the job was queued is skipped, because a newer email for the new version is already on its way.
- **A42.** The widget shows 14 days at a time (Earlier/Later), with a staff picker only when more than one person delivers the chosen service ("Anyone available" by default). It finds the API from its own script URL, so a site embedding it from slotwise's domain needs no setup.
- **A43.** `/b/{slug}` may be framed by other sites (it's a booking page). Every dashboard page sends `X-Frame-Options: DENY`.
- **A44.** Webhook payloads carry ids and times only (booking, service, staff and customer ids, start/end, status, version). Receivers fetch customer details with their API key, which keeps personal data out of the 30-day delivery log.
- **A45.** API keys can't be edited, only created and revoked. A revoked key stays listed, showing when it was last used. `last_used_at` is updated at most once a minute.
- **A46.** Webhook endpoints can be switched off without deleting them. Deliveries to a switched-off or deleted endpoint are dropped silently.
- **A47.** Erasing a customer who still has upcoming confirmed bookings is refused (cancel them first), so erasure never silently cancels appointments. Automatic retention erasure only ever affects customers with no booking inside the retention window.
- **A48.** Clean-up blanks webhook payloads older than 30 days but keeps the delivery-log rows (status, timing, error). Expired sessions, and email tokens that have been used or expired for a day, are deleted.
- **A49.** The demo clinic ("Demo Physio Clinic", `demo-physio`) uses fictional people only (example.com addresses, Ofcom's drama phone numbers). Its bookings are placed with the real slot engine. `/login?demo=1` fills in the public demo login.
- **A50.** `deploy.sh` keeps 3 releases (for rollback) and the last 5 database dumps. Server paths are variables to confirm against `SETUP.md` at the first deploy. Next.js reads `PORT` in production, so the server `.env` sets it to the web port.
- **A51.** `pnpm audit`: the critical and high issues that have fixes are patched with overrides (`mysql2`, `deepmerge-ts`, both pulled in by the Prisma CLI). One high remains: `braces`, with no fixed version yet. It's reached only through the shadcn CLI at build time, on globs we write ourselves, never on user input.
