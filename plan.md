# plan.md — Slotwise

Source: `PRD.md` (5 Oct 2026) + `CLAUDE.md` (Stack A). My own decisions are in `ASSUMPTIONS.md`.

**Local:** web `http://localhost:8015` · API `127.0.0.1:8115` (reserved in `~/projects/PORTS.md`) · DBs `slotwise_dev`, `slotwise_test` (both with `btree_gist`) · Redis prefix `slotwise`.
**Mobile apps:** none in the PRD, so no extra mobile API work. `/api/v1` and `GET /api/health` are already part of the design.

## Open questions (answer before "go")

1. **Name** (PRD Q1): "Slotwise" is already taken. Keep it as a working name and find-and-replace it later, or pick the new name now?
2. **Worker process** (PRD Q2): OK to run `slotwise-worker` as a second PM2 process (~100–150 MB)? Recommended: yes. Without it, emails, reminders and webhooks have nowhere to run.
3. **Login vs `(business_id, email)` uniqueness:** the PRD allows the same email in two businesses, but login takes only an email and password, so the login can't tell which business is meant. Proposal: make `users.email` unique across all businesses (one login = one business). See A1.
4. **Docker** (PRD Q5): keep local setup Docker-free (recommended), or add an optional `docker-compose.yml` for local development only?
5. **Deploy-time items** (PRD Q3 + Q4): Redis `noeviction` + AOF on the shared instance, and the domain `slotwise.toukirahmedrony.com`. Neither blocks the build; I'll confirm both at the first deploy. Also, `~/projects/SETUP.md`, which CLAUDE.md points to, doesn't exist on this machine. I'll need it (or its new path) before the first deploy.

## Data model

All 18 tables as in PRD §6, plus these conventions: UUIDv7, `createdAt`/`updatedAt`, `timestamptz`, pence, `@@map` snake_case, FK indexes.
- **Auth:** `businesses`, `users`, `sessions`, `auth_tokens`
- **Catalogue:** `staff`, `services`, `staff_services`, `weekly_hours`, `date_overrides`
- **Booking:** `customers`, `bookings` (+ hand-written `bookings_no_overlap` exclusion constraint), `idempotency_keys`
- **Delivery:** `outbox_events`, `email_log`, `webhook_endpoints`, `webhook_deliveries`
- **Developer:** `api_keys`
- **Logs:** `audit_log` (no PII)

Changes from the PRD: `users.email` is unique across businesses (Q3). Check constraints on minutes (0–1440, start < end), on duration > 0 and on price ≥ 0.

## NestJS modules (`apps/api`)

`Prisma` · `Config` · `Health` · `Auth` (guard, `@Public()`, `@Roles()`, cookies, Origin check, throttling) · `Business` · `Staff` · `Services` · `Schedule` (weekly hours + overrides) · `Availability` (loads data → calls `@slotwise/engine`) · `Bookings` (create/cancel/reschedule, idempotency, `isSlotConflict`, any-staff savepoints) · `Customers` · `Public` (widget + manage-token controllers) · `Outbox` · `Mail` (nodemailer → log + `tmp/mail/*.eml` locally, `.ics` builder) · `Jobs` (BullMQ processors, job-id helper; loaded only by `worker.ts`) · `ApiKeys` · `Webhooks` (signing, SSRF-safe sender, AES-GCM) · `Audit` · `Demo` (seed + nightly reseed).

## API endpoints

Exactly the PRD §7 table, under `/api/v1`, plus `GET /api/health`, `/api/docs` and `/api/openapi.json`. Every route is guarded by default; the public ones are marked `@Public()`. Errors return `{ statusCode, errorCode, message }`. Lists use cursor pagination (max 100). An `Idempotency-Key` is required on every booking create and every reschedule (A9).

## Pages (`apps/web`)

- **Auth:** `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/accept-invite`
- **Dashboard:** `/dashboard` (day/week calendar, per staff or all), `/bookings` (search + cursor list), `/bookings/[id]` (detail, cancel, reschedule, out-of-hours flag), `/bookings/new` (phone/walk-in), `/customers`, `/audit`
- **Settings:** `/settings` with tabs: business & rules, services, staff & invites, hours & overrides, widget embed, API keys, webhooks + delivery log
- **Public:** `/b/[slug]` (hosted widget), `/manage/[token]` (`Referrer-Policy: no-referrer`), `/widget/v1.js`

## Phases

Each phase works end to end (API + UI). Each one ends with CLAUDE.md's quick pass, gets marked done here, and is committed. Tests are written only for the rule-11 items named.

**Phase 1 — Foundation, auth, roles, permissions** ✅ done
Monorepo (pnpm, Turborepo, TypeScript strict, ESLint, Prettier), `pnpm setup`, CI workflow, Prisma 7 config, JSON logger with request id, error-code filter, Zod Standard Schema pipe + Swagger wiring, and the health endpoint. Tables: businesses, users, sessions, auth_tokens, staff, outbox_events. All `/auth/*` endpoints plus `/auth/me` and `GET/PATCH /business`. Global guard, roles, tenant context, Origin check and throttling. Staff CRUD + invite. Minimal outbox → worker → mail-to-file path for verify/reset/invite emails. UI: auth pages, dashboard shell, business settings, staff list + invite.
*Tests:* login; refresh rotation; reuse revokes the family; login rate limit; tenant isolation and staff-role limits on business/staff.

**Phase 2 — Services, staff hours, overrides** ✅ done
Services CRUD, staff↔service links, weekly hours (replace the whole week, no overlapping windows), date overrides. UI: services, staff services, hours editor with split shifts, overrides.
*Tests:* tenant/permission matrix for services, hours and overrides (staff only own).

**Phase 3 — Slot engine + availability** ✅ done
`packages/engine` `findSlots` (pure, Temporal, local grid, gap skipped, fold = first occurrence, linear busy scan). `GET /public/{slug}`, `GET /public/{slug}/availability`, authenticated `GET /availability`. Public routes 404 until the business is verified. CORS for `/public/*`. UI: an availability preview in the dashboard.
*Tests:* 30+ engine cases incl. 29 Mar/25 Oct 2026 and 28 Mar/31 Oct 2027, plus a Vitest bench (< 200 ms, 1 staff, 30 days).

**Phase 4 — Bookings** ✅ done
Exclusion-constraint migration (`--create-only`, commented). Create (public + authenticated) with server-side re-validation, any-staff in savepoints, customer match by normalised email, a limit of 3 future bookings per email, and per-IP rate limit. Idempotency keys. Outbox events. Audit log. Cancel and reschedule (one UPDATE, `version++`). UI: day/week calendar, list + search, detail with cancel/reschedule, manual booking, out-of-hours flag, audit view.
*Tests:* 100 concurrent → 1×201 + 99×409; reschedule into a taken slot; real `23P01` error shape; idempotency (replay, different body → 422, concurrent same key); tenant/staff matrix for bookings.

**Phase 5 — Emails, reminders, manage link** ✅ done
Full outbox relay (`SKIP LOCKED`), job-id helper. Confirmation (`.ics` REQUEST), cancellation (`.ics` CANCEL), reschedule, and owner notification emails, all through an `email_log` check. Reminder delayed job (skipped if the booking is < 24 h away), moved or removed on change. Stale-version check. Hourly reconcile. Manage-token endpoints and the `/manage/[token]` page with cut-off handling.
*Tests:* crash between commit and enqueue → relay delivers; duplicate enqueue → one job; a stale reminder sends nothing; reconcile restores a deleted reminder; real BullMQ accepts the job ids; email_log dedupe.

**Phase 6 — Embeddable widget** ✅ done
`packages/widget` Web Component (Shadow DOM, esbuild IIFE, < 30 KB gz) with the `business`/`service`/`color` attributes and automatic text contrast. Four steps, "just taken" handling with `aria-live`, WCAG 2.2 AA. Served at `/widget/v1.js`, powers `/b/[slug]`. Settings tab with the embed code and a copy button.
*Tests:* none (no rule-11 items).

**Phase 7 — Developer API + webhooks** ✅ done
API keys (shown once, prefix + SHA-256, revoke, `last_used_at`, scope limits, 60/min per key with `Retry-After`). Webhook endpoints (AES-GCM secret shown once), signed delivery, SSRF-safe sender, 8 retries with backoff, delivery log, resend, and a test event. Swagger docs complete with examples. UI: API keys and webhooks tabs.
*Tests:* API-key scope + tenant matrix; per-key rate limit; signature verification; private/loopback/metadata IPs rejected after DNS resolution; retries logged.

**Phase 8 — Data controls, demo, finish** ☐
Customer erase + customers page. Daily clean-up (idempotency 24 h, outbox/webhook payloads 30 d, expired tokens, retention erasure). Demo seed ("Demo Physio Clinic") with `is_demo` limits and a nightly reseed. Decision notes in `docs/decisions/`. README (PRD §5 headings, quick-start, `curl` example, test counts, CI badge), MIT LICENSE, `deploy.sh` (nvm first, works on Mac and WSL), `pnpm audit`, PR and merge.
*Tests:* demo restrictions; erase permission (owner only, tenant-scoped).
