# Dad League monetization plan

_Proposal, November 24, 2026. Interactive forecast: [Dad League pro forma](https://claude.ai/artifact/TiWdSWMHaKcjfAtnhM1jrJ) (source in [`proforma.html`](proforma.html))._

## Summary

- **Keep running a league free, forever.** The free tier has to be good enough that a group of dads actually meets. That's the product, and it's what spreads by invite link.
- **Charge the league, not each dad: League Pro at $4.99/month or $39.99/year per league.** One person (usually the organizer) pays, or the league splits it. $40 a year across six dads is under $7 each.
- **Pro is the "runs itself" tier:** the Commissioner, unlimited Claude ideas, unlimited photos and the full Season Wrapped, plus future planning tools (date polls, chip-in, custom trophies).
- **Let leagues give back:** optional donations to a short list of vetted partner nonprofits, paid directly to the nonprofit through a donation platform, so Dad League never holds the money.
- **Expect a side business before a big one.** In the base case of the forecast, 155 Pro leagues pay about $670 a month by month 36, and the business turns profitable around month 22. The optimistic case reaches about 1,170 Pro leagues and roughly $4,750 a month. Growth in new leagues matters far more than price.

## Principles

1. **Never paywall showing up.** Events, RSVPs, chat, invites, ideas and reminders stay free. If a league can't function on free, it won't grow into Pro.
2. **Charge for things that cost us money or save the organizer real effort.** AI (Claude), photo storage and planning automation have real running costs and obvious value.
3. **One price per league.** Dads already split tabs; a per-league plan fits how groups think, and one paying member unlocks it for everyone.
4. **No ads and no selling data.** This is already promised in the Privacy Policy, and it's part of the trust that gets a group to adopt the app.
5. **Charity is optional and transparent.** Donations never unlock features, and Dad League takes no cut by default.

## (a) Free vs. League Pro

| Area | Free (every league) | League Pro ($4.99/mo or $39.99/yr per league) |
|---|---|---|
| Members & leagues | Unlimited members; join as many leagues as you like | Same |
| Events | Unlimited events, RSVPs, reminders, add to calendar, event chat | Same |
| Standing meetups | 1 standing meetup with rotating hosts | Unlimited standing meetups |
| Ideas | Unlimited ideas and voting; 3 Claude suggestion rounds per month | Unlimited Claude suggestions |
| The Commissioner | Monthly note | Weekly note with one-tap plans and RSVP nudges |
| Chat & board | Full chat, @mentions, board, link previews | Same |
| Maps | Place search and map previews | Same |
| Photos | Last 12 months of photos, up to 200 per league | Unlimited photos, kept forever, full-resolution downloads |
| Season Wrapped | Highlights (meetups, top event, awards) | Full Wrapped with photo collage, shareable cards and past seasons |
| Trophy case | The five standard trophies | Custom trophies and league branding (name, colors, crest) |
| Planning tools (roadmap) | Basic date poll | Availability finder, chip-in / cost split, "who's bringing what" lists |
| Notifications | All categories | Same |
| Support | Help pages | Priority email support |

Why these lines:
- **The Commissioner and unlimited AI** are the clearest Pro features. They cost money per use and replace the organizer's "does anyone want to do something?" text.
- **Photos and Wrapped** are emotional and get more valuable over time. That makes the annual plan an easy choice, and Wrapped shared in December doubles as marketing.
- **Standing meetups:** one is free, so every league experiences the habit. Leagues running several are the most engaged, and they're the ones who'll pay.
- **Rollout:** when Pro launches, give existing leagues 60 days of Pro free and a founding-league price ($29/year locked) to reward early adopters.

### Other revenue to test later
- **A personal "Supporter" plan** ($1.99/month, a badge, and a vote on the roadmap) for dads who want to chip in without upgrading their league.
- **Gift a year of Pro** for Father's Day and the holidays, paid by partners and families.
- **Organization plans** (employers' parent groups, churches, schools) at about $300–$1,500 a year, covering many leagues with admin tools.
- **Booking referral fees and venue deals** once leagues are concentrated in a few cities.

## (b) Charitable giving

**How it works for members**
- Each league picks a **"cause of the season"** from a short list of partner nonprofits, for example a men's mental health charity, a fatherhood nonprofit, or the local food bank where the league volunteers.
- The League tab shows the cause, a **donate** button and the league's season total. Wrapped shows "Detroit Dads raised $1,240 for …"
- Donating opens the nonprofit's donation page on a donation platform. The donor pays the nonprofit directly and gets a tax receipt from the platform.
- **Optional league challenges:** "If we hit 10 meetups this season, everyone chips in $20," tracked automatically from attendance.

**How the money flows (recommended): Every.org**
- Every.org charges nonprofits **no platform fee** for its donate button or API, and donors can optionally tip Every.org. Card processing costs still apply ([pricing](https://every.org/pricing), [fees FAQ](https://support.every.org/hc/en-us/articles/360061886773-Does-Every-org-charge-fees)).
- Its Charity API is free for non-commercial use; a for-profit app like Dad League should contact them about their enterprise terms ([Charity API](https://every.org/charity-api)). Their simple donate links and button need no API agreement and are the place to start.
- **Dad League never touches donated funds.** Collecting donations on a nonprofit's behalf can trigger "commercial co-venturer" or charitable-solicitation registration rules in some states. Sending donors to the nonprofit's own platform page avoids most of that. Confirm with a lawyer before advertising "X% of Pro revenue goes to charity," because that kind of promise is what those rules regulate.

**Optional: a Dad League match.** For example, Dad League adds $1 for every Pro league per month to a quarterly gift to the partner nonprofits. Make it a fixed, published commitment you pay from your own business account, and announce it as a company donation.

**Apple rules (for when there's a native iOS app):** Apple only lets *approved nonprofits* collect donations inside an app, and expects Apple Pay when they do. Other apps must send donors outside the app to give ([developer forum discussion](https://developer.apple.com/forums/thread/712285), [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). Dad League isn't a nonprofit, so in the iOS app the donate button should open the nonprofit's page in Safari. Donations aren't in-app purchases, so Apple takes no commission on them. The current web app is a website, so none of these App Store rules apply until there's a native app.

## (c) How to set it up

### 1. Business basics (before taking any money)
1. **Form an LLC** in your state, so payments and liability sit with the business rather than with you personally.
2. **Get an EIN** (free, from the IRS website) and **open a business bank account**.
3. **Update the Terms and Privacy Policy** (in `v2/legal/`) to name the payment processor and describe refunds and cancellation. The current versions already say this will happen before launch.
4. **Pick a bookkeeping tool** that connects to Stripe and your bank, and talk to an accountant about **sales tax**: digital subscriptions are taxable in some US states.

### 2. Web payments with Stripe (start here)
Stripe's standard US card rate is widely reported as **2.9% + 30¢** per successful charge. Stripe Billing adds a percentage on subscription revenue: sources say **0.5–0.7%**, so check [stripe.com/pricing](https://stripe.com/pricing) before relying on it.

1. Create a Stripe account, verify the business, and connect the bank account.
2. In Stripe, create a product **League Pro** with two prices: $4.99 monthly and $39.99 yearly.
3. In the app (about 1–2 days of work):
   - Add a `subscriptions` table (league, plan, status, renewal date).
   - Add an **Upgrade** button that opens **Stripe Checkout**, and a **Manage billing** button that opens the **Stripe Customer Portal**. Stripe hosts both pages, so card details never touch our server.
   - Add a **webhook** endpoint that updates the subscription when Stripe reports a payment, renewal or cancellation.
   - Gate Pro features with one `isPro(league)` check on the server.
4. Turn on **Stripe Tax** if your accountant says you need to collect sales tax.
5. Put the Stripe keys in Railway as variables, using a **test mode** environment first and switching to live keys only after a full test.

### 3. iOS App Store (when you ship a native app)
1. **Join the Apple Developer Program** ($99/year) under the LLC, which needs a D-U-N-S number for an organization account.
2. **Wrap the web app** with Capacitor (the old version already had a Capacitor setup to borrow from) and add native push notifications and Sign in with Apple.
3. **In App Store Connect**, accept the **Paid Apps agreement** and add banking and tax details.
4. **Enroll in the Small Business Program.** Apple's commission on in-app purchases and subscriptions drops from 30% to **15%** for developers earning under $1M a year ([Apple](https://developer.apple.com/app-store/small-business-program/), [RevenueCat](https://www.revenuecat.com/blog/engineering/app-store-fees)).
5. **Create an auto-renewable subscription group** "League Pro" with the monthly and yearly products. Apple generally requires in-app purchase for digital subscriptions sold inside an iOS app.
6. **Use [RevenueCat](https://www.revenuecat.com)**, which is free at small scale. It tracks one "Pro" status across Apple and Stripe purchases, so a league that paid on the web is Pro on iPhone and the reverse.
7. **Linking out to the web to pay (US only):** after the *Epic v. Apple* injunction, US apps may link to an outside purchase page. Apple was **barred from charging commission** on those purchases as of August 2026, but it has asked the court to allow a fee of up to 15%, and the outcome is pending ([TechCrunch](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/), [AppleInsider](https://appleinsider.com/articles/26/08/13/apples-latest-commission-rates-for-external-app-store-purchases-havent-satisfied-epic)). Offer both: in-app purchase for convenience, and a web link at a slightly lower price. Recheck the rules before launch.
8. **Google Play** works similarly (in-app billing, about 15% on subscriptions). It's lower priority, since the web app already works well on Android.

### 4. Donations
1. Shortlist 3–5 partner nonprofits and confirm they're on Every.org (or have their own donation pages).
2. Add a `cause` setting to leagues and a **Donate** button that opens the nonprofit's donation page in a new tab, with a league tag in the link so totals can be counted.
3. Ask partners for a monthly total by tag, or use Every.org's reporting once you have an agreement, then show the season total in the League tab and in Wrapped.

## (d) Forecast

**[Open the interactive pro forma](https://claude.ai/artifact/TiWdSWMHaKcjfAtnhM1jrJ).** Every assumption is editable: league growth, upgrades and cancellations, prices, annual-plan share, iOS launch month and App Store share, fees, AI, hosting and maps costs, marketing, and donations. It shows a 36-month income statement by year or by month, a chart, and key results, and can copy the monthly numbers as CSV for a spreadsheet.

Three presets as of today:

| | Conservative | Base | Optimistic |
|---|---:|---:|---:|
| New leagues in month 1 / monthly signup growth | 4 / 4% | 8 / 8% | 15 / 12% |
| Free → Pro per month / Pro cancellations per month | 1% / 5% | 2% / 3% | 3.5% / 2% |
| Pro leagues at months 12 / 24 / 36 | 2 / 7 / 15 | 11 / 52 / 155 | 43 / 271 / 1,166 |
| Subscription revenue, month 36 | $66 | $669 | $4,754 |
| Subscription revenue, year 1 / 2 / 3 | $54 / $264 / $597 | $222 / $1,566 / $5,191 | $738 / $6,881 / $32,195 |
| Net income, year 1 / 2 / 3 | −$1,275 / −$1,231 / −$1,025 | −$1,208 / −$388 / $1,654 | −$894 / $2,666 / $16,905 |
| Profitable from | Not within 36 months | Month 22 | Month 13 |
| Raised for nonprofits over 36 months | $2,064 | $18,647 | $158,279 |

All three use $4.99/month and $39.99/year, an iOS app in month 7 (month 10 for Conservative, month 5 for Optimistic) with half of Pro revenue through Apple at 15%, and about $100–150 a month in fixed costs. Fixed costs are hosting baseline, tools, legal and accounting; marketing is set to $0.

What the forecast says:
- **New-league growth is the main driver.** Doubling the price changes year-3 profit far less than moving signup growth from 8% to 12% a month. Invest first in invites, Wrapped sharing and word of mouth.
- **Running costs are small.** AI, maps and storage stay at cents per league, so even a few dozen Pro leagues cover the server bill.
- **Annual plans matter.** They lower card fees and cancellations; nudge them with Wrapped and the founding-league offer.
- **Revisit after 3 months of real data.** Replace the assumptions with your actual signups, upgrade rate and cancellations.

## Suggested rollout

1. **Now (free):** grow leagues, and add simple counts of active leagues, standing meetups and Commissioner use, so the upgrade rate can be measured later.
2. **Month 1–2:** add the donations feature with 3 partner nonprofits. It's free to run and good for the brand.
3. **Month 2–3:** form the LLC and set up Stripe, then launch League Pro on the web with the founding-league offer.
4. **Month 4–7:** build the Capacitor iOS app with in-app subscriptions through RevenueCat and Sign in with Apple, and submit it.
5. **Month 9+:** test organization plans and gift subscriptions.

## Sources

- Apple: [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [developer forum: donations via app](https://developer.apple.com/forums/thread/712285)
- RevenueCat: [App Store fees explained](https://www.revenuecat.com/blog/engineering/app-store-fees)
- US link-out commission status: [TechCrunch, Aug 14 2026](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/), [AppleInsider, Aug 13 2026](https://appleinsider.com/articles/26/08/13/apples-latest-commission-rates-for-external-app-store-purchases-havent-satisfied-epic), [AppleInsider, Apr 6 2026](https://appleinsider.com/articles/26/04/06/epic-vs-apple-lawsuit-over-app-store-fees-is-moving-to-the-supreme-court-again)
- Stripe: [pricing](https://stripe.com/pricing); third-party summary: [Stripe fees in 2026](https://checkoutpage.com/blog/stripe-processing-fees)
- Every.org: [pricing](https://every.org/pricing), [Charity API](https://every.org/charity-api), [fees FAQ](https://support.every.org/hc/en-us/articles/360061886773-Does-Every-org-charge-fees)

_Fees, App Store rules and the US link-out litigation change often. Recheck each before launch. This plan is not legal, tax or accounting advice._
