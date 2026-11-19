import { readFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "./db/client.js";
import { env } from "./env.js";
import { createApp } from "./app.js";
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

await startRealtime();
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
