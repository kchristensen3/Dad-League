---
description: Verify the app is ready to deploy to Railway
---
Check that the current branch is safe to deploy:
1. `npm run check` (typecheck + tests) must pass.
2. `npm run build` must succeed.
3. If `server/db/schema.ts` changed since `origin/main`, confirm a matching migration exists in `server/db/migrations/`
   and that it doesn't drop or rewrite data without saying so. Flag any destructive SQL.
4. Any new env var must be in `.env.example`, read through `server/env.ts`, and listed in the README's Railway section.
Report pass/fail per step. Don't deploy anything.
