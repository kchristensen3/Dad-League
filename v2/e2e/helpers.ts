import { type Browser, type Page, expect } from "@playwright/test";
import postgres from "postgres";

let n = 0;
export const uniqueEmail = (name: string) => `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}-${n++}@e2e.test`;

/** Signs in with the dev login, gets past the one-time welcome page, and lands on /leagues or a league. */
export async function signIn(page: Page, name: string) {
  await page.goto("/login");
  await page.fill("input[type=email]", uniqueEmail(name));
  await page.fill('input[placeholder^="Display name"]', name);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/about\?welcome=1/);
  await page.getByRole("button", { name: "Enter the League" }).first().click();
  await page.waitForURL(/\/(leagues|l\/)/);
}

export async function newUser(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, name);
  return page;
}

/** Calls the API as the signed-in user of `page`. */
export async function api<T = any>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ([method, path, body]) => {
      const res = await fetch(path as string, {
        method: method as string,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    },
    [method, path, body] as const,
  );
}

export async function createLeague(page: Page, name = "Detroit Dads") {
  const { league } = await api(page, "POST", "/api/leagues", { name, description: "Weekend hangs", timezone: "America/Detroit" });
  return league as { id: string; inviteCode: string };
}

export const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/** Direct database access, for setting up things the UI can't (e.g. a Commissioner note without calling Claude). */
export function db() {
  return postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/dadleague_e2e", { onnotice: () => {} });
}

export { expect };
