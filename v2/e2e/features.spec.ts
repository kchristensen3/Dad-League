import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { api, createLeague, daysFromNow, db, signIn } from "./helpers";

const EMB = { placeId: "ChIJEasternMarketBrew01", address: "2515 Riopelle St, Detroit, MI 48207, USA", lat: 42.3478, lng: -83.0412 };

test("standing meetup: start one with rotating hosts, then edit it", async ({ page }) => {
  await signIn(page, "Series Starter");
  const league = await createLeague(page);
  // First Thursday of next month.
  const now = new Date();
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  while (d.getUTCDay() !== 4) d = new Date(d.getTime() + 86_400_000);

  await page.goto(`/l/${league.id}`);
  await page.getByRole("button", { name: "Plan" }).click();
  await page.fill('input[placeholder^="Tigers game"]', "Poker night");
  await page.fill("input[type=date]", d.toISOString().slice(0, 10));
  await page.fill("input[type=time]", "19:30");
  await page.getByRole("combobox").first().selectOption({ label: "Monthly on the first Thursday" });
  await expect(page.getByText("Rotate who hosts")).toBeVisible();
  await page.getByRole("button", { name: "Start the standing meetup" }).click();
  await page.waitForURL(/events\//);
  await expect(page.getByText("First Thursday of the month")).toBeVisible();

  await page.getByRole("button", { name: "Event options" }).click();
  await page.getByRole("button", { name: "Edit standing meetup" }).click();
  await page.getByRole("combobox", { name: "Location" }).fill("The Garage");
  await page.fill("input[type=time]", "20:00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/updated the next 2 dates/)).toBeVisible();

  const { events } = await api(page, "GET", `/api/leagues/${league.id}/events`);
  expect(events).toHaveLength(2);
  for (const e of events) {
    expect(e.location).toBe("The Garage");
    expect(new Date(e.startsAt).toLocaleTimeString("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" })).toBe("8:00 PM");
  }
});

test("place search fills in the location and shows a map", async ({ page }) => {
  // Stand in for Google: the browser only ever talks to our own /places and /map routes.
  await page.route("**/places/autocomplete**", (r) =>
    r.fulfill({ json: { suggestions: [{ placeId: EMB.placeId, name: "Eastern Market Brewing Co.", address: "Riopelle Street, Detroit, MI, USA" }] } }),
  );
  await page.route(`**/places/${EMB.placeId}**`, (r) => r.fulfill({ json: { place: { ...EMB, name: "Eastern Market Brewing Co." } } }));
  const png = await sharp({ create: { width: 640, height: 320, channels: 3, background: "#cfe6c8" } }).png().toBuffer();
  await page.route("**/events/*/map**", (r) => r.fulfill({ body: png, contentType: "image/png" }));

  await signIn(page, "Map Maker");
  const league = await createLeague(page);
  await page.goto(`/l/${league.id}`);
  await page.getByRole("button", { name: "Plan" }).click();
  await page.fill('input[placeholder^="Tigers game"]', "Trivia");
  await page.getByRole("combobox", { name: "Location" }).pressSequentially("Eastern Market Brew", { delay: 30 });
  await page.getByRole("listbox").getByRole("option", { name: /Eastern Market Brewing Co/ }).click();
  await expect(page.getByText("2515 Riopelle St")).toBeVisible();
  await page.getByRole("button", { name: /put it on the calendar/i }).click();
  await page.waitForURL(/events\//);
  await expect(page.getByRole("img", { name: /Map showing Eastern Market Brewing/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Apple Maps" })).toHaveAttribute("href", /maps\.apple\.com/);
});

test("photos: upload to a past event and see them in Season Wrapped", async ({ page }) => {
  await signIn(page, "Photo Dad");
  const league = await createLeague(page);
  const { event } = await api(page, "POST", `/api/leagues/${league.id}/events`, {
    title: "Backyard cookout", category: "Food & Drink", startsAt: daysFromNow(-1),
  });
  const files = await Promise.all(
    ["#2d6a4f", "#e8913a"].map(async (bg, i) => ({
      name: `photo${i}.jpg`,
      mimeType: "image/jpeg",
      buffer: await sharp({ create: { width: 1200, height: 800, channels: 3, background: bg } }).jpeg().toBuffer(),
    })),
  );
  await page.goto(`/l/${league.id}/events/${event.id}`);
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.getByRole("heading", { name: "Photos · 2" })).toBeVisible();

  await page.goto(`/l/${league.id}/wrapped`);
  await expect(page.getByText("Season Wrapped")).toBeVisible();
  // Tap through to the photo slide, letting each slide finish fading in before checking.
  const photoSlide = page.getByText(/photos worth keeping/);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700);
    if (await photoSlide.isVisible()) break;
    await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByText("2 photos worth keeping")).toBeVisible();
});

test("the Commissioner's plan goes on the calendar with one tap", async ({ page }) => {
  await signIn(page, "Commish Fan");
  const league = await createLeague(page);
  const startsAt = daysFromNow(9);
  const sql = db();
  await sql`insert into messages (league_id, kind, body, proposal) values (
    ${league.id}, 'commissioner', 'Nothing on the calendar. How about disc golf?',
    ${sql.json({ title: "Disc golf", category: "Outdoors", ideaId: null, startsAt, location: "Rouge Park", acceptedEventId: null })}
  )`;
  await sql.end();
  await page.goto(`/l/${league.id}/chat`);
  await expect(page.getByText("The Commissioner")).toBeVisible();
  await page.getByRole("button", { name: /put it on the calendar/i }).click();
  await page.waitForURL(/events\//);
  await expect(page.getByRole("heading", { name: "Disc golf" })).toBeVisible();
});

test("calendar heat map shows the day's meetups, and add to calendar offers working links", async ({ page }) => {
  await signIn(page, "Calendar Dad");
  const league = await createLeague(page);
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const { event } = await api(page, "POST", `/api/leagues/${league.id}/events`, {
    title: "Coney dog lunch",
    category: "Food & Drink",
    startsAt: noon.toISOString(),
    location: "Lafayette Coney Island",
  });

  await page.goto(`/l/${league.id}`);
  await page.getByRole("button", { name: "calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }) })).toBeVisible();
  const day = page.getByRole("button", { name: /Coney dog lunch \(1 in\)/ });
  await expect(day).toBeVisible();
  await day.click();
  await expect(page.getByRole("link", { name: "Coney dog lunch" })).toBeVisible();
  await expect(page.getByText("Food & Drink").first()).toBeVisible();

  await page.goto(`/l/${league.id}/events/${event.id}`);
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const apple = page.getByRole("link", { name: /Apple, Outlook/ });
  await expect(apple).toHaveAttribute("href", new RegExp(`/cal/[\\w-]+/events/${event.id}\\.ics$`));
  const ics = await page.request.get((await apple.getAttribute("href"))!);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:Coney dog lunch");
  await expect(page.getByRole("link", { name: /Google Calendar/ })).toHaveAttribute("href", /calendar\.google\.com.*Coney\+dog\+lunch/);
});
