import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// A throwaway key so the Apple provider can be constructed in tests (Apple is never actually called).
const appleTestKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" });

export default defineConfig({
  test: {
    include: ["server/test/**/*.test.ts"],
    globalSetup: ["server/test/globalSetup.ts"],
    env: {
      NODE_ENV: "test",
      DEV_LOGIN: "true",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/dadleague_test",
      APP_URL: "http://localhost:3000",
      UPLOAD_DIR: path.join(tmpdir(), `dadleague-test-uploads-${process.pid}`),
      GOOGLE_MAPS_API_KEY: "test-maps-key",
      GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "  test-secret\n",
      APPLE_CLIENT_ID: "app.dadleague.test",
      APPLE_TEAM_ID: "TEAMID1234",
      APPLE_KEY_ID: "KEYID12345",
      APPLE_PRIVATE_KEY: String(appleTestKey).replace(/\n/g, "\\n"),
    },
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
