# Contributing to Slotwise

Thanks for helping. Bug reports, fixes, docs and small focused features are all welcome.

## Before you start

- **Bugs:** open an issue with the steps to reproduce, what you expected and what happened. For anything
  security-related, don't open an issue: see [SECURITY.md](SECURITY.md).
- **Features:** open an issue first and describe the problem it solves, so we can agree on the approach before
  you write code. Slotwise stays deliberately small: one server, PostgreSQL, Redis, no Docker, no paid services.

## Set up

You need Node.js 24, pnpm, PostgreSQL 16 or newer and Redis.

```bash
git clone https://github.com/ToukirOfficial/slotwise.git && cd slotwise
pnpm run setup   # .env with fresh secrets, install, create slotwise_dev + slotwise_test, migrate, seed the demo
pnpm dev         # web http://localhost:8015 · API http://localhost:8115 · worker
```

No email is sent locally: every message is written to `tmp/mail/*.eml`.

## Make your change

- **Where things go:** business rules, auth and permissions live in the NestJS API (`apps/api`). The Next.js
  app (`apps/web`) only displays. Slot logic belongs in the pure engine (`packages/engine`), and request and
  response shapes in `packages/shared` (Zod schemas shared by the API, the docs and the frontend).
- **Tests:** add or update a test for every behaviour change. API tests run against real PostgreSQL and Redis
  (no database mocks); engine tests are plain unit tests. Keep them about what matters, not coverage numbers.
- **Database changes:** add a Prisma migration (`pnpm --filter @slotwise/api exec prisma migrate dev`). Never edit
  a migration that has been released.
- **Decisions:** if you make a non-obvious design choice, add a short note to [`docs/decisions/`](docs/decisions).
- **Never commit secrets** or a real `.env`. Use fictional people in fixtures (`example.com` addresses, Ofcom's
  drama phone numbers such as `07700 900123`).

## Check it

Run exactly what CI runs (CI also repeats it on PostgreSQL 16 and 18):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Open a pull request

- Keep it focused: one change per pull request.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, as the history does:
  `feat(api): …`, `fix(web): …`, `docs: …`, `chore: …`.
- Describe what changed and why, and how you tested it. Add a line under `[Unreleased]` in
  [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

By contributing, you agree that your work is released under the [MIT licence](LICENSE).
