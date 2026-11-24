# Review guide for Dad League

The live app is `v2/` (Node + Hono API, Postgres via Drizzle, React PWA, deployed on Railway from `main`).
The repo root outside `v2/` is the retired AI Studio version; changes there are rare and low-risk.
Project conventions live in `v2/CLAUDE.md`; flag violations of them.

## What matters most (flag as important)
- **Authorization.** Every league-scoped route must go through `scopedRouter()` or `requireMembership`, and
  non-members must get 404, not 403. Edits must check `canModify` (author or league owner). Any route that
  returns or changes league data without these checks is a bug.
- **Partial updates.** PATCH schemas in `v2/shared/schemas.ts` must be `.partial()` of fields without
  `.default()`. A default inside an update schema silently blanks fields the request didn't send.
- **Secrets stay server-side.** Google Maps, Anthropic, S3 and VAPID keys must never reach the browser or be
  logged. Photos must be served through the membership-checked route, never as raw bucket URLs.
- **Migrations** in `v2/server/db/migrations/` must be generated (not hand-edited after merge) and should be
  additive. Flag anything that drops or rewrites columns or data without a stated plan.
- **Realtime.** A write other members should see must call `publish({ leagueId, kind })`, and a new `kind`
  must be handled in `useLeagueStream` (`v2/web/src/hooks.ts`).
- **Scheduled jobs** in `v2/server/lib/scheduler.ts` must be idempotent (mark rows done), because they can rerun.
- **Time.** Standing meetups store wall-clock time + IANA zone and convert with `toInstant`. Adding hours or
  using the server's local time is a DST bug.
- **Privacy.** If a change sends new kinds of user data to a third party (Anthropic, Google, a payment
  processor), `v2/legal/privacy.md` must be updated in the same PR, then regenerated with `python3 v2/legal/layout.py`.

## Tests
- New or changed API behavior needs a Vitest test in `v2/server/test/` that hits the real app.
- New user-facing flows need a Playwright test in `v2/e2e/`. Bug fixes should add a test that would have caught the bug.
- Tests must not call real external APIs (Claude, Google, push services); use the injectable functions or
  route stubs the existing tests use.

## Keep it quiet
- Don't nitpick formatting or naming; there's no linter-level review needed. Cap nits at three per PR.
- Skip generated files: `v2/server/db/migrations/meta/**`, `package-lock.json`, `v2/web/public/privacy.html`,
  `v2/web/public/terms.html` (generated from `v2/legal/*.md`), and image assets.
- The UI is mobile-first; only flag layout issues that would break on a phone-sized screen.
