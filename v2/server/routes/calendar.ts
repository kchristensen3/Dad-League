/**
 * Calendar files. Phones open .ics links outside the app (in Safari or the calendar app), where
 * there's no Dad League session, so these links carry each member's private calendar token instead.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { uuidParam } from "../lib/access.js";
import { type AppEnv, requireUser } from "../lib/auth.js";
import { buildIcs } from "../lib/ics.js";

export async function calendarTokenFor(userId: string): Promise<string> {
  // Set it only if still empty, so two requests at once end up with the same token.
  await db
    .update(schema.users)
    .set({ calendarToken: randomBytes(24).toString("base64url") })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.calendarToken)));
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return user!.calendarToken!;
}

/** Signed-in: returns this member's calendar token (created on first use). */
export const calendarTokenRoutes = new Hono<AppEnv>().use(requireUser).get("/", async (c) => {
  return c.json({ token: await calendarTokenFor(c.var.user.id) });
});

/** Public, token-authenticated: /cal/:token/events/:eventId.ics */
export const calendarFileRoutes = new Hono().get("/:token/events/:file", async (c) => {
  const token = c.req.param("token");
  const eventId = uuidParam(c.req.param("file").replace(/\.ics$/, ""));
  if (!/^[\w-]{20,64}$/.test(token)) throw new HTTPException(404);
  const user = await db.query.users.findFirst({ where: eq(schema.users.calendarToken, token) });
  if (!user) throw new HTTPException(404, { message: "This calendar link is no longer valid" });
  const [row] = await db
    .select({ event: schema.events })
    .from(schema.events)
    .innerJoin(
      schema.leagueMembers,
      and(eq(schema.leagueMembers.leagueId, schema.events.leagueId), eq(schema.leagueMembers.userId, user.id)),
    )
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Event not found" });
  const e = row.event;
  const ics = buildIcs([
    {
      uid: e.id,
      title: e.title,
      startsAt: e.startsAt,
      location: e.placeAddress ? `${e.location}, ${e.placeAddress}` : e.location,
      description: [e.description, `Details and RSVPs: ${env.appUrl}/l/${e.leagueId}/events/${e.id}`].filter(Boolean).join("\n\n"),
      url: e.url,
      cancelled: e.cancelledAt !== null,
    },
  ]);
  const filename = `${e.title.replace(/[^\w -]+/g, "").trim() || "event"}.ics`;
  return c.body(ics, 200, {
    "content-type": "text/calendar; charset=utf-8",
    // inline lets iPhones show the "Add to Calendar" screen; desktops save or open the file.
    "content-disposition": `inline; filename="${filename}"`,
    "cache-control": "private, no-store",
  });
});
