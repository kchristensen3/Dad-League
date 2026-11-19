---
description: Add a new league-scoped resource end to end (schema, migration, API, realtime, UI, tests)
argument-hint: <what the resource is, e.g. "carpools for events">
---
Add this to Dad League: $ARGUMENTS

Follow the existing pattern (look at `server/routes/ideas.ts` and `web/src/pages/Ideas.tsx` as the reference):
1. Table(s) in `server/db/schema.ts`, then `npm run db:generate -- --name <name>`. Read the generated SQL.
2. Request schemas and response type in `shared/schemas.ts`.
3. Router built with `scopedRouter()` in `server/routes/`, mounted in `server/app.ts`. Use `parseBody`, `uuidParam`,
   `canModify`, and call `publish()` after every write.
4. Add the new `kind` to `LeagueChange` and handle it in `useLeagueStream` (`web/src/hooks.ts`).
5. API client methods in `web/src/api.ts`, then the UI.
6. Integration tests in `server/test/` covering the happy path and one authorization failure.
7. Run `npm run check` and fix everything before reporting back.
