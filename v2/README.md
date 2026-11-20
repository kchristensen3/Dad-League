# Dad League v2

A rebuild of Dad League as a conventional web app: one Node service and one Postgres database
on Railway, installable on phones as a PWA. No Firebase, no Capacitor wrapper, no client-side database rules.

**What's in it:** standing meetups ("first Thursday of the month") with rotating hosts and day-before reminders ·
the Commissioner, a weekly Claude-written note in chat that nudges RSVPs and pitches a one-tap plan when the calendar
is empty · event photo albums and an animated Season Wrapped · leagues with invite links and codes · events with RSVPs, cancel/edit, add-to-calendar and a chat
thread per event · an idea list with voting, archiving, "schedule this idea", and Claude-generated suggestions
tailored to where the league lives and what they're into · a board for posts, links (with previews), likes and comments ·
league chat with @mentions · member stats · Web Push notifications with per-category settings · account deletion.

## Architecture

```
Browser (React SPA, PWA)
   │  REST  /api/*      (cookie session)
   │  SSE   /api/leagues/:id/stream   ← "ideas changed", "new message"… → client refetches
   ▼
Hono on Node 22  ── Drizzle ──►  Postgres
   │                     ▲
   │   pg_notify/LISTEN ─┘  (so live updates reach clients on every replica)
   ├─► Claude API (idea suggestions)
   └─► Web Push
```

| Concern | v1 (AI Studio export) | v2 |
|---|---|---|
| Data | Firestore, arrays inside documents, 9 KB of security rules | Postgres with real relations, FKs and cascades |
| Authorization | Firestore rules + client code | Server-side checks on every route (`requireMembership`, `canModify`) |
| Auth | Firebase Auth (+ native plugin) | Sign in with Apple and Google (arctic) + httpOnly session cookie; accounts link by verified email |
| Realtime | Firestore listeners | SSE + Postgres LISTEN/NOTIFY |
| AI | Gemini helper that no screen used; Vite bakes its key into the client bundle | Claude on the Ideas tab, server-only, schema-validated output |
| Notifications | Local `Notification` while the tab is open | Web Push (works when the app is closed, incl. iOS home-screen apps) |
| Mobile | Capacitor iOS shell | PWA (install from Safari/Chrome) |
| Tests | none | 20 API integration tests against real Postgres, CI on every push |

## Run locally

Needs Node 22+ and Postgres 14+.

```bash
cp .env.example .env          # DEV_LOGIN=true lets you sign in with any email
createdb dadleague && createdb dadleague_test
npm install
npm run db:migrate
npm run dev                   # http://localhost:5173
```

`npm run check` runs typechecks and the test suite.

## Deploy on Railway

1. **New project → Deploy from GitHub repo** → pick this repo.
2. In the service's **Settings**:
   - **Root Directory**: `/v2`
   - **Config file path**: `/v2/railway.json` (the config file path doesn't follow the root directory)
   - **Networking → Generate Domain**
3. **+ New → Database → PostgreSQL** in the same project.
4. Service **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Cloud Console → Credentials → OAuth client (Web).
     Authorized redirect URI: `https://<your-domain>/auth/google/callback`
   - `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` — optional, enables Sign in with Apple (see below)
   - `ANTHROPIC_API_KEY` — optional, enables "Suggest" on the Ideas tab and the Commissioner
   - `GOOGLE_MAPS_API_KEY` — optional, turns on place search in the location field and map previews on events.
     In Google Cloud: enable **Places API (New)** and **Maps Static API**, create an API key, and restrict it to those two APIs.
   - `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_REGION` if not `auto`) — for photos.
     Add a Storage Bucket to the project (**+ New → Bucket**) and reference its credentials here.
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — optional, from `npx web-push generate-vapid-keys`
   - `APP_URL` — only if you add a custom domain (otherwise it uses Railway's domain)
5. Deploy. `railway.json` builds the Dockerfile, runs migrations as the pre-deploy step, and health-checks `/healthz`.
   Every push to the deploy branch redeploys; a failed migration or health check leaves the previous version running.

### Setting up Sign in with Apple

Needs a paid Apple Developer account. Apple only allows real HTTPS domains, so it can't be tried on localhost;
set it up once the Railway domain exists. In [developer.apple.com](https://developer.apple.com/account/resources) →
Certificates, Identifiers & Profiles:

1. **Identifiers → App IDs → +**: create one (e.g. `com.yourname.dadleague`) with **Sign in with Apple** checked.
2. **Identifiers → Services IDs → +**: create one (e.g. `com.yourname.dadleague.web`). This is `APPLE_CLIENT_ID`.
   Enable **Sign in with Apple → Configure**, pick the App ID from step 1, and add:
   - Domain: `<your-domain>` (no `https://`)
   - Return URL: `https://<your-domain>/auth/apple/callback`
3. **Keys → +**: enable **Sign in with Apple**, configure it with the same App ID, and download the `.p8` file
   (you can only download it once). Its Key ID is `APPLE_KEY_ID`; paste the file's contents as `APPLE_PRIVATE_KEY`.
4. `APPLE_TEAM_ID` is shown at the top right of the developer portal.

How accounts fit together: someone who signs in with Google and later with Apple using the same email lands in the
same account. If they choose Apple's **Hide My Email**, Apple gives us a relay address instead, so that becomes a
separate account. Apple shares the person's name only the first time; if they decline, they show up as
"New member" until they edit their profile.

**PR environments:** turn them on under Project Settings → Environments and each PR gets its own URL and
database, which pairs well with having Claude Code open PRs.

## Working on it with Claude Code

`CLAUDE.md` explains the architecture and conventions, so Claude Code starts each session knowing them.
`.claude/settings.json` pre-approves the safe commands (tests, typecheck, build, migrations) and blocks reading `.env`
and running `railway up`/`down`.

- `/add-resource carpools for events` walks through schema → migration → API → realtime → UI → tests.
- `/ship-check` checks the branch is safe to deploy, including destructive SQL in new migrations.

A typical loop: describe the feature → Claude Code makes the change and runs `npm run check` → it opens a PR →
CI plus a Railway PR environment let you try it on your phone → merge → Railway deploys `main`.

## Not carried over (yet)

- **Existing Firestore data.** v2 starts empty. Moving the current leagues, members, events and chat over takes a
  one-off import script run with Firebase admin credentials.
- **Photo uploads on board posts.** Event albums have photos; board posts still take links only.
- **The native iOS app.** The PWA covers it, including push on iOS 16.4+ once it's added to the Home Screen.
  If App Store presence matters, Capacitor can wrap this build later.
