# 0007 — Webhook signing and SSRF protection

## Context
Webhooks let an account holder make our server send HTTP requests to a URL of their choosing. Unchecked, that
turns the VPS into a proxy into its own private network: Redis on `127.0.0.1`, cloud metadata on
`169.254.169.254`, other sites' admin ports. Receivers, for their part, need to know a request really came from us.

## Decision
- **Signing.** `Slotwise-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Receivers compare in
  constant time and reject timestamps more than 5 minutes old (replay protection). The secret is shown once
  and stored with AES-256-GCM (key in env). It can't be hashed, because we need it to sign.
- **SSRF.** Before every delivery: HTTPS only in production, no credentials in the URL, the host resolved
  and **every** answer checked against blocked ranges (loopback, RFC 1918, link-local/metadata, CGNAT, multicast,
  reserved, IPv6 ULA/link-local, IPv4-mapped in both notations). The socket then connects to the **vetted IP**
  (a pinned `lookup`), so DNS rebinding between check and connect doesn't work. Redirects aren't followed,
  there's a 10 s timeout, and only 1 KB of the response is logged.
- **Payloads carry ids and times only** (booking, service, staff, customer id). Receivers fetch customer details
  with their API key. This keeps personal data out of the 30-day delivery log.
- **Retries.** 8 attempts over about 23 h (1 m, 5 m, 30 m, 1 h, 3 h, 6 h, 12 h). Every attempt is a row in the
  delivery log, and the owner can resend or send a test event.

## Alternatives
- **An allow-list of domains.** Too restrictive for a public product.
- **Checking only when the URL is saved.** DNS can change afterwards, so the check runs again on every send.

## Consequences
- Tests cover private-IP rejection after DNS resolution (including `localhost` and `[::ffff:127.0.0.1]`),
  that redirects aren't followed, signature verification, retries logged, and secrets encrypted at rest.
- A business that really needs a private receiver can't use one. That's deliberate.
