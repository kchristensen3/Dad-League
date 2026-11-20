import { readFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "./db/client.js";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { pruneExpiredSessions } from "./lib/auth.js";
import { startRealtime } from "./lib/realtime.js";

const app = createApp();

if (env.isProd) {
  // The built SPA. Hashed assets get long-lived caching; everything else falls back to index.html.
  const root = path.relative(process.cwd(), path.resolve(import.meta.dirname, "../web"));
  app.use("/assets/*", serveStatic({ root, onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable") }));
  app.use("*", serveStatic({ root }));
  const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  app.get("*", (c) => c.html(indexHtml));
}

console.log(
  `Config: url=${env.appUrl} google=${env.googleEnabled} apple=${env.appleEnabled} ai=${env.aiEnabled} push=${env.pushEnabled}`,
);
// Fail fast with a readable message if the database is unreachable, instead of hanging.
try {
  await Promise.race([
    sql`select 1`,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 15s")), 15_000)),
  ]);
} catch (err) {
  const host = (() => {
    try {
      return new URL(env.DATABASE_URL).host;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  })();
  console.error(`\nDad League can't reach the database at ${host}: ${(err as Error).message}`);
  console.error("Check DATABASE_URL on this service. On Railway it should be ${{Postgres.DATABASE_URL}}.\n");
  process.exit(1);
}
// Railway's pre-deploy step normally does this; running it here too means a missed
// pre-deploy (e.g. railway.json not picked up) can't leave the app without its tables.
try {
  await runMigrations();
} catch (err) {
  console.error("\nDad League can't start: database migrations failed:", (err as Error).message, "\n");
  process.exit(1);
}
void startRealtime();
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) =>
  console.log(`Dad League listening on :${info.port} (${env.NODE_ENV})`),
);

const pruner = setInterval(() => void pruneExpiredSessions().catch(() => {}), 6 * 3600_000);

// Railway sends SIGTERM on redeploy; finish in-flight requests, then close the pool.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    clearInterval(pruner);
    server.close(() => void sql.end({ timeout: 5 }).finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
