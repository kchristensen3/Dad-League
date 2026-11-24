import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page explains the app and offers sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/friendships that matter/i);
    await expect(page.getByRole("heading", { name: /how it works/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /why I started dad league/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /put it on your phone/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /questions/i })).toBeVisible();
    await expect(page.getByText("Dev sign-in")).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toHaveAttribute("href", "/terms");
  });

  test("FAQ answers open and close", async ({ page }) => {
    await page.goto("/login");
    const q = page.getByRole("button", { name: /is it free/i });
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
  });

  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ] as const) {
    test(`${path} is reachable without signing in`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByText(/Last updated/i)).toBeVisible();
    });
  }

  test("the welcome page tells the founder's story", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: /why I started dad league/i })).toBeVisible();
  });

  test("invite links show the league before sign-in", async ({ page, browser }) => {
    const { signIn, createLeague } = await import("./helpers");
    const owner = await (await browser.newContext()).newPage();
    await signIn(owner, "Owner Olson");
    const league = await createLeague(owner, "Invite Test League");
    await page.goto(`/join/${league.inviteCode}`);
    await expect(page.getByText("Invite Test League")).toBeVisible();
    await expect(page.getByText(/1 dad so far/)).toBeVisible();
  });
});
