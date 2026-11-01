# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | Yes |
| < 1.0 | No |

Security fixes go into the latest 1.x release.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub:
**[Report a vulnerability](https://github.com/ToukirOfficial/slotwise/security/advisories/new)**
(the repository's Security tab → *Report a vulnerability*).

Include what you found, the steps to reproduce it and the impact you expect. You'll get a reply within
**5 working days**. Once a fix is ready, it's released and the advisory is published, with credit to you if you'd
like it.

## Testing against the live demo

<https://slotwise.toukirahmedrony.com> is a public demo on a shared server. You're welcome to look for
vulnerabilities there within these limits:

- Only use the demo account and the demo clinic. Don't try to reach other sites on the server.
- No denial-of-service, load testing or automated scanning that sends large volumes of requests.
- Don't try to send email or webhooks to third parties.

For anything heavier, run your own copy locally (see the [README](README.md#run-it-locally)).

## How Slotwise protects data

The README's [Security section](README.md#security) lists the measures in place: argon2id passwords, rotating
refresh tokens with reuse detection, hashed tokens and API keys, encrypted webhook secrets, rate limits, webhook
SSRF protection, same-origin checks on cookie-authenticated writes, and no personal data in logs.
