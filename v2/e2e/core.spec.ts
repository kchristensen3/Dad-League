import { expect, test } from "@playwright/test";
import { api, createLeague, daysFromNow, newUser, signIn } from "./helpers";

test("two dads: join, vote, plan, RSVP, chat and post, with live updates", async ({ page, browser }) => {
  await signIn(page, "Kyle Christensen");
  const league = await createLeague(page);

  // Jeff joins through the invite link.
  const jeff = await (await browser.newContext()).newPage();
  await jeff.goto(`/join/${league.inviteCode}`);
  await jeff.fill("input[type=email]", `jeff-${Date.now()}@e2e.test`);
  await jeff.fill('input[placeholder^="Display name"]', "Jeff Miller");
  await jeff.locator("form").getByRole("button", { name: "Sign in" }).click();
  await jeff.getByRole("button", { name: "Join as Jeff Miller" }).click();
  await jeff.waitForURL(/about\?welcome=1/);
  await jeff.getByRole("button", { name: "Enter the League" }).first().click();
  await jeff.waitForURL(new RegExp(`/l/${league.id}`));

  // Ideas: Kyle pitches two, Jeff's vote re-ranks them on Kyle's screen without a refresh.
  await page.goto(`/l/${league.id}/ideas`);
  for (const title of ["Tigers game", "Axe throwing"]) {
    await page.getByRole("button", { name: "Idea", exact: true }).click();
    await page.fill('input[placeholder^="Axe"]', title);
    await page.click('button:has-text("Add to the list")');
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await jeff.goto(`/l/${league.id}/ideas`);
  await jeff.locator("div").filter({ has: jeff.getByRole("heading", { name: "Axe throwing", exact: true }) }).getByRole("button", { name: "Vote" }).last().click();
  await expect(page.locator("main h3").first()).toHaveText("Axe throwing");

  // Plan the top idea from Home.
  await page.goto(`/l/${league.id}`);
  await page.getByRole("button", { name: "Schedule it" }).click();
  await page.getByRole("button", { name: /put it on the calendar/i }).click();
  await page.waitForURL(/events\//);
  const eventUrl = page.url();

  // Jeff RSVPs from his Home; Kyle's event page updates live.
  await jeff.goto(`/l/${league.id}`);
  await jeff.getByRole("button", { name: "I'm in" }).first().click();
  await expect(jeff.getByRole("button", { name: "Going" }).first()).toBeVisible();
  await expect(page.getByText("In · 2")).toBeVisible();

  // Event thread vs. general chat stay separate; general chat is live both ways.
  await page.getByRole("textbox", { name: "Message" }).fill("I'll drive");
  await page.keyboard.press("Enter");
  await expect(page.getByText("I'll drive")).toBeVisible();
  await page.goto(`/l/${league.id}/chat`);
  await jeff.goto(`/l/${league.id}/chat`);
  await expect(page.getByText("I'll drive")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message" }).fill("Who's around Saturday?");
  await page.keyboard.press("Enter");
  await expect(jeff.getByText("Who's around Saturday?")).toBeVisible();
  await jeff.getByRole("textbox", { name: "Message" }).fill("Me");
  await jeff.keyboard.press("Enter");
  await expect(page.getByText("Me", { exact: true })).toBeVisible();

  // Board: post, like, comment.
  await page.goto(`/l/${league.id}/board`);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.fill('input[placeholder^="Anyone have"]', "Tile saw?");
  await page.locator("form").getByRole("button", { name: "Post" }).click();
  await jeff.goto(`/l/${league.id}/board`);
  await expect(jeff.getByText("Tile saw?")).toBeVisible();
  await jeff.getByRole("button", { name: /comments/ }).click();
  await jeff.getByRole("textbox", { name: "Comment" }).fill("Come grab it");
  await jeff.getByRole("button", { name: "Reply" }).click();
  await expect(jeff.getByText("Come grab it")).toBeVisible();

  // The league tab shows both members and the trophy case.
  await page.goto(`/l/${league.id}/league`);
  await expect(page.getByText("Jeff Miller")).toBeVisible();
  await expect(page.getByText("Trophy Case")).toBeVisible();
  expect(eventUrl).toContain(`/l/${league.id}/events/`);
});

test("cancelling an event keeps its details", async ({ page }) => {
  await signIn(page, "Cancel Tester");
  const league = await createLeague(page);
  const { event } = await api(page, "POST", `/api/leagues/${league.id}/events`, {
    title: "Poker", category: "Games & Trivia", description: "Bring chips", location: "Garage", startsAt: daysFromNow(3),
  });
  await page.goto(`/l/${league.id}/events/${event.id}`);
  await page.getByRole("button", { name: "Event options" }).click();
  await page.getByRole("button", { name: "Cancel event" }).click();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bring chips")).toBeVisible();
});

test("non-members can't open a league", async ({ page, browser }) => {
  const owner = await newUser(browser, "Private Owner");
  const league = await createLeague(owner, "Private League");
  await signIn(page, "Stranger Danger");
  await page.goto(`/l/${league.id}`);
  await expect(page.getByText(/doesn't exist or you're not in it/)).toBeVisible();
});
