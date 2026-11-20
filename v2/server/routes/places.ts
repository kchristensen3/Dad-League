import { and, avg, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.js";
import { MapsUnavailableError, autocomplete, placeDetails } from "../lib/places.js";
import { scopedRouter } from "./scope.js";

// Typing fires a request every few keystrokes; cap each person so a stuck client can't run up the bill.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const usage = new Map<string, { start: number; count: number }>();
function rateLimit(userId: string) {
  const now = Date.now();
  const u = usage.get(userId);
  if (!u || now - u.start > WINDOW_MS) return void usage.set(userId, { start: now, count: 1 });
  if (++u.count > MAX_PER_WINDOW) throw new HTTPException(429, { message: "Slow down a little and try again" });
}

const session = (v: string | undefined) => (v && /^[\w-]{8,64}$/.test(v) ? v : undefined);

function mapsError(err: unknown): never {
  if (err instanceof MapsUnavailableError) throw new HTTPException(503, { message: err.message });
  throw new HTTPException(502, { message: "Map search isn't responding right now" });
}

export const placeRoutes = scopedRouter()
  .get("/autocomplete", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    if (q.length < 2) return c.json({ suggestions: [] });
    rateLimit(c.var.user.id);
    // Bias toward where this league usually meets (otherwise Google would bias toward the server's location).
    const [center] = await db
      .select({ lat: avg(schema.events.lat), lng: avg(schema.events.lng) })
      .from(schema.events)
      .where(and(eq(schema.events.leagueId, c.var.leagueId), isNotNull(schema.events.lat)));
    const near = center?.lat && center.lng ? { lat: Number(center.lat), lng: Number(center.lng) } : null;
    try {
      return c.json({ suggestions: await autocomplete(q, session(c.req.query("session")) ?? crypto.randomUUID(), near) });
    } catch (err) {
      mapsError(err);
    }
  })

  .get("/:placeId", async (c) => {
    rateLimit(c.var.user.id);
    const placeId = c.req.param("placeId");
    if (!/^[\w-]{10,300}$/.test(placeId)) throw new HTTPException(400, { message: "Bad place id" });
    try {
      return c.json({ place: await placeDetails(placeId, session(c.req.query("session"))) });
    } catch (err) {
      mapsError(err);
    }
  });
