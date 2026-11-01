# Architecture

```mermaid
flowchart LR
  subgraph Browsers
    W["Booking widget<br/>&lt;slotwise-booking&gt; on any site"]
    D["Owner dashboard<br/>and /b/{slug} booking page"]
  end

  subgraph Server["One Linux server (PM2)"]
    N["Next.js<br/>pages + /api proxy"]
    A["NestJS API<br/>auth, rules, validation"]
    K["Worker<br/>BullMQ processors"]
  end

  subgraph Data
    P[("PostgreSQL<br/>bookings + exclusion constraint<br/>outbox table, send log, audit log")]
    R[("Redis<br/>BullMQ queues")]
  end

  S["SMTP<br/>confirmations, reminders"]
  H["Webhooks<br/>signed POSTs to customers' URLs"]

  W -- "/api/v1/public/*" --> N
  D --> N
  N -- "/api/* (proxy)" --> A
  A -- "booking + outbox event<br/>in one transaction" --> P
  A -- "enqueue after commit<br/>(fast path)" --> R
  K -- "relay: unprocessed outbox<br/>events every 5 s" --> P
  K -- "relay enqueues<br/>(deterministic job ids)" --> R
  R --> K
  K --> S
  K --> H
```

- **Next.js only displays.** Every auth check, permission and business rule lives in the NestJS API. Next.js serves
  the pages and the widget script, and proxies `/api/*` to the API on the same origin.
- **The database prevents double-booking.** An exclusion constraint on confirmed bookings means two overlapping
  bookings can't both commit, however many requests arrive at once.
- **Emails and webhooks are never lost.** A booking change and its outbox event are written in the same
  transaction. After the commit the API enqueues the job straight away (fast path). The worker also relays any
  outbox event that wasn't processed (a crash between commit and enqueue). Deterministic job ids and the send log
  stop duplicates.
- **The worker is a separate process**, so slow SMTP servers or failing webhook endpoints never hold up an API
  request.

See [`docs/decisions/`](decisions) for why each of these was chosen.
