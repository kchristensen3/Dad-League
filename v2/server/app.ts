import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "./db/client.js";
import { env } from "./env.js";
import { sameOriginWrites } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { ideaRoutes } from "./routes/ideas.js";
import { inviteRoutes, leagueRoutes } from "./routes/leagues.js";
import { meRoutes } from "./routes/me.js";
import { messageRoutes } from "./routes/messages.js";
import { postRoutes } from "./routes/posts.js";

export function createApp() {
  const app = new Hono();

  if (env.NODE_ENV !== "test") app.use(logger());
  app.use(secureHeaders({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: undefined }));
  app.use("/api/*", sameOriginWrites);
  app.use("/auth/*", sameOriginWrites);

  app.get("/healthz", async (c) => {
    await sql`select 1`;
    return c.json({ ok: true });
  });

  app.route("/auth", authRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/invites", inviteRoutes);
  app.route("/api/leagues/:leagueId/ideas", ideaRoutes);
  app.route("/api/leagues/:leagueId/events", eventRoutes);
  app.route("/api/leagues/:leagueId/posts", postRoutes);
  app.route("/api/leagues/:leagueId/messages", messageRoutes);
  app.route("/api/leagues", leagueRoutes);

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message || "Request failed" }, err.status);
    }
    console.error(err);
    return c.json({ error: "Something went wrong" }, 500);
  });

  return app;
}
