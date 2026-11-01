# Changelog

All notable changes to Slotwise are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- Next.js 16.4.3 (fixes two critical remote code execution advisories and a denial of service), zod 4.6.7,
  nodemailer 10.3.1, and patched transitive dependencies (body-parser, multer, qs, fast-uri, vite, minimatch)
  through pnpm overrides. `pnpm audit` reports no known vulnerabilities.
- The shadcn CLI is no longer a dependency (its one stylesheet is vendored), which removes its dependency tree
  from installs.
- Public demo: the demo clinic resets every hour, and demo businesses are capped at 20 services, 15 staff, 300
  bookings and 300 customers (`403 DEMO_LIMIT`).

### Fixed

- Re-seeding the demo now clears its cached public profile, so the widget never offers old service ids
  (which made bookings fail for up to a minute after each reset).

### Added

- Dependabot version updates for npm and GitHub Actions, weekly.

## [1.0.0] - 2026-11-01

The first public release. Live demo: <https://slotwise.toukirahmedrony.com>.

### Added

- **Bookings that can't double-book.** A PostgreSQL exclusion constraint on confirmed bookings (with
  `btree_gist`) rejects any overlap, whatever the app code does. 100 parallel requests for one slot give exactly
  one booking and 99 `409 SLOT_TAKEN` responses. "Any staff" bookings try each free person inside savepoints.
- **Pure slot engine** (`packages/engine`) built on Temporal: split shifts, buffers, minimum notice, booking
  horizon, slot step and date overrides, correct across all UK clock changes (all four 2026–2027 changes are
  tested). About 10 ms for one staff member over 30 days.
- **REST API** (NestJS) with OpenAPI docs at `/api/docs`, a stable `errorCode` on every error, cursor
  pagination, and required `Idempotency-Key` headers for creating and moving bookings.
- **Owner dashboard** (Next.js): calendar (day and week), bookings list and detail with an audit trail,
  manual bookings, customers, services, staff and who delivers what, weekly hours and time off, API keys,
  webhooks with a delivery log, and the embed code.
- **Booking widget**: a `<slotwise-booking>` Web Component in Shadow DOM, one file, about 5 KB gzipped,
  that works on any website. Plus a hosted booking page at `/b/{slug}`.
- **Customer manage link** to view, move or cancel a booking, bound by the business's cut-off.
- **Emails that are never lost**: confirmation, reminder, cancellation and reschedule emails with `.ics`
  invites, sent by a separate worker through a transactional outbox, deterministic job ids and a send log.
- **Signed webhooks** with retries, a delivery log and SSRF protection (resolved-IP checks, no redirects).
- **Roles and tenancy**: owners and staff, with every query scoped to one business; staff see only their own
  diary.
- **Privacy**: customer erasure and a daily retention clean-up (24 months by default); nothing personal or
  secret is logged.
- **Public demo mode** (`PUBLIC_DEMO=true`): sign-up, invite acceptance and password reset return
  `403 DEMO_MODE` and are hidden in the UI, and mail only goes to the log. A demo clinic is re-seeded every night
  with the past week and the next fortnight of bookings, including their history.
- **Deploy script** for one Linux server with PM2: builds locally, uploads a release, dumps the database before
  migrations, switches atomically and rolls back if the health check fails.
- **CI** on PostgreSQL 16 and 18: typecheck, lint, 176 tests (49 engine, 7 web, 120 API against real
  PostgreSQL and Redis) and build.

### Security

- Passwords hashed with argon2id; rotating refresh tokens with reuse detection in `httpOnly`, `Secure`,
  `SameSite=Lax` cookies; same-origin checks on cookie-authenticated writes.
- API keys, refresh tokens, email tokens and manage links stored as SHA-256 hashes; webhook secrets encrypted with
  AES-256-GCM.
- Rate limits on login, sign-up, password reset, public availability, public booking and API keys.
- Every form posts with `method="post"` and stays disabled until the page is interactive, so form data can never
  end up in a URL.

[Unreleased]: https://github.com/ToukirOfficial/slotwise/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ToukirOfficial/slotwise/releases/tag/v1.0.0
