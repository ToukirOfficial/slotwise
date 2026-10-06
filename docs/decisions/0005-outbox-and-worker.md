# 0005 — Outbox, deterministic job ids, a send log and a separate worker

## Context
Emails and webhooks must never be lost and should practically never be duplicated. Exactly-once delivery to
SMTP is impossible in general: a crash can always land between "the server accepted it" and "we recorded that".

## Decision
- **Outbox.** A booking change and its `outbox_events` row commit in one transaction. After commit, the API
  turns the event into jobs (fast path). Every 5 s, a relay in the worker claims unprocessed events with
  `FOR UPDATE SKIP LOCKED` (safety net). A crash between commit and enqueue therefore loses nothing.
- **Deterministic job ids** (`email-confirm-<booking>-v<version>`, `reminder-<booking>`,
  `webhook-<event>-<endpoint>`), built by one helper. BullMQ rejects `:` in custom ids, so the brief's
  `reminder:ID` is out. A test runs the helper's ids through real BullMQ.
- **Send log.** `email_log` has a unique key on (booking, kind, version). The worker checks it before sending
  and inserts the row after SMTP accepts.
- **Stale jobs.** Jobs carry the booking version. The worker re-reads the booking and sends nothing if it was
  cancelled or moved since.
- **Redis is never trusted alone.** An hourly reconcile re-creates any missing reminder (same id, so a no-op
  when it exists). If a reminder was lost inside its 24 h window, reconcile sends it straight away.
- **A separate worker process** (`src/worker.ts`, the same Nest codebase as the API) runs every job, so slow
  SMTP or webhook retries never block API requests.

## Alternatives
- **Sending inside the request.** That's slow, and a crash after commit loses the email.
- **Publishing to Redis inside the database transaction.** Two systems with no shared commit.
- **A separate `apps/worker` app.** That duplicates modules and config for no benefit.

## Consequences
- The one documented duplicate window: a crash between "SMTP accepted" and "email_log row written".
- Tests cover: relay after a lost fast path, double processing enqueues once, stale reminder sends nothing,
  reconcile restores a deleted reminder, send-log dedupe.
