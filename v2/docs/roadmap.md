# Dad League roadmap

_Last updated November 24, 2026. Ordered by value to leagues against effort. "Now" is the next 1–2 months, "Next" 2–6 months, "Later" 6+ months._

## Where things stand

Live on Railway from `main`:
- **Planning:** leagues and invites; events with RSVPs, reminders and event chat; standing meetups with rotating hosts and editing; ideas with voting and Claude suggestions; the Commissioner.
- **Social:** board and chat; photos and Season Wrapped; Trophy Case.
- **Platform:** place search and maps, push notifications, Google sign-in, and the new landing and legal pages.
- **Testing:** 58 API tests and 14 browser tests run on every pull request.

## Now: finish and harden what's shipped

**Fixes and loose ends**
- [ ] **Confirm map search works with the real Google key.** Watch the deploy logs on first use; the usual fix is enabling *Places API (New)* on the key's project.
- [ ] **Sign in with Apple.** The code is ready; it needs the Apple Developer account and the four `APPLE_*` variables.
- [ ] **Re-enter league descriptions** blanked by the edit bug fixed on Nov 24.
- [ ] **Turn on GitHub branch protection** for `main` with the `check` and `e2e` CI jobs required, and turn on Railway's "Wait for CI".
- [ ] **Code-split the web bundle.** It's about 750 KB, so loading Wrapped, the forecast-heavy pages and the motion library on demand would speed up first load on phones.
- [ ] **Error monitoring** (for example Sentry, which has a free tier) on server and web, so crashes surface before someone texts you.
- [ ] **Confirm Railway Postgres backups** are on, and do one test restore.

**Small features with big payoff**
- [ ] **Date polls.** Propose 2–4 dates, members tap which work, and the winner becomes the event. The old app's data model planned for this; it's the most-requested group-planning feature.
- [ ] **"Who's bringing what" lists** on events (gear, food, rides).
- [ ] **Calendar feed.** A private iCal link per member, so events show up in Apple or Google Calendar automatically. Each member already has a private calendar token (used by "Add to calendar"), so this is one more route under `/cal/:token`.
- [ ] **Text-message invite helper:** "Copy invite message" with a friendly pre-written text, since iMessage is where invites actually happen.
- [ ] **Edit and delete for comments and chat messages** (only delete exists today), plus a light **report** button for moderation.

## Next: monetization and the native app

**League Pro and donations** (see [monetization-plan.md](monetization-plan.md))
- [ ] Subscriptions table, Stripe Checkout and Customer Portal, webhook, and an `isPro(league)` check.
- [ ] Pro limits from the plan: free gets 1 standing meetup, 3 Claude suggestion rounds a month and a monthly Commissioner note; Pro gets photo retention and the full Wrapped.
- [ ] Founding-league offer and 60-day Pro trial for existing leagues.
- [ ] "Cause of the season" with partner nonprofits, a donate button via Every.org, and season totals in Wrapped.
- [ ] Update the Terms and Privacy Policy for payments before launch.

**Native iOS app**
- [ ] Capacitor wrapper of the web app (the old repo has a starting point).
- [ ] Native push notifications (APNs) alongside web push.
- [ ] Sign in with Apple (required by Apple when Google sign-in is offered).
- [ ] App Store subscriptions through RevenueCat, so a web purchase and an in-app purchase unlock the same Pro.
- [ ] App Store listing: screenshots, privacy "nutrition label" (from the Privacy Policy), and review notes with a demo account.

**Planning tools**
- [ ] **Availability finder:** members mark their usual free times, and the app suggests the best slot for the group.
- [ ] **Chip-in / cost split:** record who fronted tickets or a tee time and settle up with Venmo or PayPal links.
- [ ] **Weather on outdoor events,** with an automatic "rain plan?" nudge.
- [ ] **RSVP limits and waitlists** (for example 4 spots for a golf foursome).

## Later: grow beyond one league

**Growth and community**
- [ ] **Shareable Wrapped cards** (images sized for Instagram and iMessage) and a December "Wrapped is ready" moment.
- [ ] **Referral credit:** a league that brings in another league gets a free month of Pro.
- [ ] **Public league pages** (opt-in) for clubs that want new members.
- [ ] **Nearby leagues** so a dad who moves can find a crew. Opt-in only, and city-level location only.
- [ ] **Organization plans:** one admin managing many leagues (employers, churches, schools), with branding and simple reports.

**Product depth**
- [ ] **Custom trophies,** seasonal challenges ("10 meetups by June") and Commissioner-run mini competitions.
- [ ] **Family events mode:** headcounts for kids and partners, plus age-friendly idea suggestions.
- [ ] **Recurring idea themes** ("Golf season," "Winter indoor") that the Commissioner rotates through.
- [ ] **Import from the old app:** a one-off script to bring existing Firestore leagues, members and events into v2, if anyone still needs that history.

**Interfaces**
- [ ] Android app on Google Play (after iOS).
- [ ] Home-screen widgets on iOS and Android: next meetup with an RSVP button.
- [ ] Apple Watch and lock-screen RSVP from the notification ("I'm in" / "Can't" actions).
- [ ] Optional SMS reminders for members who don't install the app.
- [ ] Dark mode for the main app (the landing page and legal pages already handle it).

## Engineering health (ongoing)

- **Staging:** Railway PR environments, so each pull request gets its own URL and database to try on a phone.
- **Claude Ship:** connect the repo, start Code Review on "after every push," and keep Claude Approvals in observe mode for a few weeks before enforcing. The `REVIEW.md` and `.claude/approvals.yml` files are already in place.
- **Tests:** every bug fix adds a test that would have caught it, and every new user-facing flow gets a browser test in `v2/e2e/`.
- **Accessibility pass:** screen-reader labels, color contrast, focus order, and larger tap targets on the bottom nav.
- **Rate limiting** shared across replicas (Postgres- or Redis-based) before scaling past one server.
- **Image delivery:** serve photos through a CDN once albums grow.
- **Data export:** a "download my data" button (also helps with privacy-law requests).
