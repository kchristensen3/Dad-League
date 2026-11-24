import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: real browser, real API, real Postgres (a separate `dadleague_e2e` database).
 * Runs the dev servers with email-only sign-in. `npm run e2e` locally; CI runs the same command.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/dadleague_e2e";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: "http://localhost:5173",
    timezoneId: "America/Detroit",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL,
      DEV_LOGIN: "true",
      SCHEDULER: "false",
      // Placeholder so map search is switched on; tests answer the Google lookups themselves.
      GOOGLE_MAPS_API_KEY: "e2e-placeholder",
      UPLOAD_DIR: "e2e/.uploads",
    },
  },
});
