# Dad League v2

A small social app for groups of dads ("leagues"): plan events and RSVP, pitch and vote on
ideas (with Claude suggestions), a link board, and group chat with per-event threads.
Deployed on Railway as one service plus a Postgres database.

## Layout
- `server/` Hono API on Node 22. `app.ts` wires routes; `index.ts` is the entrypoint (also serves the built SPA in production).
  - `db/schema.ts` Drizzle schema (source of truth). `db/migrations/` generated SQL, committed.
  - `routes/` one file per resource. League-scoped routers come from `scopedRouter()` in `routes/scope.ts`,
    which guarantees `c.var.user`, `c.var.leagueId`, `c.var.membership`.
  - `lib/` auth (cookie sessions), access checks, realtime (Postgres LISTEN/NOTIFY → SSE), AI, push, link previews,
    `recurrence.ts` (pure date math for standing meetups), `series.ts` (generates their events + host rotation),
    `commissioner.ts` (Claude's weekly note), `storage.ts` (S3 bucket or local disk), `scheduler.ts` (15-min jobs).
  - `test/` Vitest integration tests that hit the real app against a real Postgres.
- `shared/schemas.ts` zod request schemas + response types used by both server and web. Change API shapes here first.
- `web/` React 19 + Vite + Tailwind v4 + TanStack Query + React Router SPA. The founder note lives in `web/src/content/story.ts`.
- `e2e/` Playwright tests. `legal/` privacy and terms sources. `docs/` roadmap, monetization plan and the pro forma page.

## Commands
- `npm run dev` — API on :3000 and Vite on :5173 (proxying /api and /auth). Needs Postgres and `.env` (see `.env.example`).
- `npm run check` — typecheck server + web, then run tests. Run this before you say something works.
- `npm run db:generate -- --name <what_changed>` — after editing `db/schema.ts`. Commit the generated SQL.
- `npm run db:migrate` — apply migrations locally. Railway runs `node dist/server/db/migrate.js` pre-deploy.
- `npm run e2e` — Playwright browser tests in `e2e/` (starts the dev servers itself against a `dadleague_e2e` database;
  answers Google lookups with stand-ins). Add one for every new user-facing flow. CI runs both suites on every PR.
- `python3 legal/layout.py` — regenerate `web/public/privacy.html` and `terms.html` after editing `legal/*.md`.
  Update the privacy policy in the same PR whenever user data starts going to a new third party.
- Tests need a Postgres at `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/dadleague_test`); the schema is dropped and rebuilt each run.

## Conventions
- Every write that other members should see calls `publish({ leagueId, kind })`. The client maps `kind` to
  query keys in `web/src/hooks.ts` (`useLeagueStream`). Adding a new resource means adding a kind in both places.
- Query keys are `[resource, leagueId, ...]` so a league's data can be invalidated by prefix.
- Authorization: members can read everything in their league; authors edit their own things; the league owner can
  moderate anything (`canModify`). Non-members get 404, not 403.
- Validate every body with a schema from `shared/schemas.ts` via `parseBody`. Never trust route params: use `uuidParam`.
- Update (PATCH) schemas must be `.partial()` of fields WITHOUT `.default()`: in zod 4 a default still fires for an
  omitted key, which silently blanks fields the edit didn't touch. Define fields once, add defaults only in create schemas.
- Never edit an applied migration; generate a new one.
- Push notifications go through `notifyLeague` and are fire-and-forget (`void`), never awaited in a request.
- Claude calls live in `server/lib/ai.ts` and `server/lib/commissioner.ts` only. Model: `claude-opus-5-5`, structured
  output via zod. Tests never call the API: `runCommissioner` takes an injectable `write` function.
- Background work goes in `scheduler.ts`. Every job must be idempotent (mark rows as done, e.g. `reminderSentAt`) because
  the advisory lock only stops overlap, not re-runs. The scheduler is off in tests; call the job functions directly.
- Standing meetups keep `UPCOMING_PER_SERIES` future events materialized. Store wall-clock time + IANA zone and convert
  with `toInstant`, never by adding hours, so DST doesn't shift meetups.
- Photos are re-encoded with sharp (strips EXIF/GPS) and served through `/api/leagues/:id/photos/:photoId/:size`, which
  checks membership before redirecting to a short-lived presigned URL. Never expose bucket URLs directly.
- Google Maps calls live in `server/lib/places.ts` and go through our own routes (`/places/*`, `/events/:id/map`) so the
  key stays server-side and only league members can spend it. Autocomplete and details share a session token.
- Keep the UI mobile-first; most people use it as an installed PWA on their phone.

## Auth
Sign in with Apple and Google via arctic (`server/routes/auth.ts`); both go through `signInWithProvider`, which matches on
the provider's account id, then verified email. Apple's callback is a cross-site form POST, so it is exempt from the
Origin check in `sameOriginWrites` and its state cookie is `SameSite=None; Secure`. Don't "fix" either.

## Env
See `.env.example`. `DEV_LOGIN=true` enables email-only sign-in for local dev and tests; it is ignored (with a warning)
in production. Photos in production need the `S3_*` variables; the container disk is wiped on every deploy.
