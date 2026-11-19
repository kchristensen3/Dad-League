import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/test/**/*.test.ts"],
    globalSetup: ["server/test/globalSetup.ts"],
    env: {
      NODE_ENV: "test",
      DEV_LOGIN: "true",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/dadleague_test",
      APP_URL: "http://localhost:3000",
    },
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
