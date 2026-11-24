import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  type EventItem,
  type UserSummary,
  createEventSchema,
  handOffHostSchema,
  rsvpSchema,
  updateEventSchema,
} from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, requireMembership, uuidParam } from "../lib/access.js";
import { describeRule } from "../lib/recurrence.js";
import { deletePhotoFiles } from "../lib/storage.js";
import { iso, parseBody, placeColumns, userSummary } from "../lib/http.js";
import { MapsUnavailableError, staticMap } from "../lib/places.js";
import { notifyLeague, notifyUsers } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { canModify, scopedRouter } from "./scope.js";

/** Events stay under "upcoming" until 6 hours after they start. */
const UPCOMING_GRACE_MS = 6 * 3600_000;

async function listEvents(
  leagueId: string,
  meId: string,
  opts: { scope?: "upcoming" | "past"; id?: string },
): Promise<EventItem[]> {
  const e = schema.events;
  const cutoff = new Date(Date.now() - UPCOMING_GRACE_MS);
  const rows = await db
    .select({
      event: e,
      host: userSummary,
      messageCount: sql<number>`(select count(*)::int from ${schema.messages} m where m.event_id = ${e.id})`,
      photoCount: sql<number>`(select count(*)::int from ${schema.photos} p where p.event_id = ${e.id})`,
      seriesRule: schema.eventSeries.rule,
    })
    .from(e)
    .innerJoin(schema.users, eq(schema.users.id, e.hostId))
    .leftJoin(schema.eventSeries, eq(schema.eventSeries.id, e.seriesId))
    .where(
      and(
        eq(e.leagueId, leagueId),
        opts.id ? eq(e.id, opts.id) : opts.scope === "past" ? lt(e.startsAt, cutoff) : gte(e.startsAt, cutoff),
      ),
    )
    .orderBy(opts.scope === "past" ? desc(e.startsAt) : asc(e.startsAt))
    .limit(100);
  if (rows.length === 0) return [];

  const rsvps = await db
    .select({ eventId: schema.eventRsvps.eventId, status: schema.eventRsvps.status, user: userSummary })
    .from(schema.eventRsvps)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventRsvps.userId))
    .where(inArray(schema.eventRsvps.eventId, rows.map((r) => r.event.id)))
    .orderBy(asc(schema.eventRsvps.updatedAt));
  const byEvent = new Map<string, { going: UserSummary[]; notGoing: UserSummary[]; mine: EventItem["myRsvp"] }>();
  for (const r of rsvps) {
    const entry = byEvent.get(r.eventId) ?? { going: [], notGoing: [], mine: null };
    (r.status === "going" ? entry.going : entry.notGoing).push(r.user);
    if (r.user.id === meId) entry.mine = r.status;
    byEvent.set(r.eventId, entry);
  }

  return rows.map(({ event, host, messageCount, photoCount, seriesRule }) => {
    const r = byEvent.get(event.id);
    return {
      id: event.id,
      title: event.title,
      category: event.category as EventItem["category"],
      description: event.description,
      location: event.location,
      url: event.url,
      startsAt: iso(event.startsAt),
      cancelled: event.cancelledAt !== null,
      ideaId: event.ideaId,
      place:
        event.placeId && event.lat !== null && event.lng !== null
          ? { placeId: event.placeId, address: event.placeAddress ?? "", lat: event.lat, lng: event.lng }
          : null,
      series: event.seriesId && seriesRule ? { id: event.seriesId, label: describeRule(seriesRule) } : null,
      host,
      going: r?.going ?? [],
      notGoing: r?.notGoing ?? [],
      myRsvp: r?.mine ?? null,
      messageCount,
      photoCount,
    };
  });
}

async function loadEvent(leagueId: string, eventId: string) {
  const event = await db.query.events.findFirst({
    where: and(eq(schema.events.id, eventId), eq(schema.events.leagueId, leagueId)),
  });
  return event ?? notFound("Event not found");
}

export const eventRoutes = scopedRouter()
  .get("/", async (c) => {
    const scope = c.req.query("scope") === "past" ? "past" : "upcoming";
    return c.json({ events: await listEvents(c.var.leagueId, c.var.user.id, { scope }) });
  })

  .post("/", async (c) => {
    const { place, ...body } = await parseBody(c, createEventSchema);
    if (body.ideaId) {
      const idea = await db.query.ideas.findFirst({
        where: and(eq(schema.ideas.id, body.ideaId), eq(schema.ideas.leagueId, c.var.leagueId)),
      });
      if (!idea) throw new HTTPException(400, { message: "ideaId does not belong to this league" });
    }
    const [event] = await db
      .insert(schema.events)
      .values({ ...body, ...placeColumns(place ?? null), startsAt: new Date(body.startsAt), leagueId: c.var.leagueId, hostId: c.var.user.id })
      .returning();
    await db.insert(schema.eventRsvps).values({ eventId: event!.id, userId: c.var.user.id, status: "going" });
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    void notifyLeague(c.var.leagueId, c.var.user.id, "events", {
      title: `📅 ${event!.title}`,
      body: `${c.var.user.name} put it on the calendar. You in?`,
      url: `/l/${c.var.leagueId}/events/${event!.id}`,
      tag: `event-${event!.id}`,
    });
    const [full] = await listEvents(c.var.leagueId, c.var.user.id, { id: event!.id });
    return c.json({ event: full }, 201);
  })

  .get("/:eventId", async (c) => {
    const eventId = uuidParam(c.req.param("eventId"));
    const [event] = await listEvents(c.var.leagueId, c.var.user.id, { id: eventId });
    if (!event) notFound("Event not found");
    return c.json({ event });
  })

  .patch("/:eventId", async (c) => {
    const event = await loadEvent(c.var.leagueId, uuidParam(c.req.param("eventId")));
    if (!canModify(c, event.hostId)) forbidden("Only the host or league owner can edit this event");
    const { cancelled, startsAt, place, ...rest } = await parseBody(c, updateEventSchema);
    await db
      .update(schema.events)
      .set({
        ...rest,
        // A new picked place replaces the old one; retyping the location by hand clears it.
        ...(place !== undefined ? placeColumns(place) : rest.location !== undefined ? placeColumns(null) : {}),
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(cancelled === undefined ? {} : { cancelledAt: cancelled ? new Date() : null }),
      })
      .where(eq(schema.events.id, event.id));
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    if (cancelled && !event.cancelledAt) {
      void notifyLeague(c.var.leagueId, c.var.user.id, "events", {
        title: `❌ Cancelled: ${event.title}`,
        body: `${c.var.user.name} called it off.`,
        url: `/l/${c.var.leagueId}/events/${event.id}`,
        tag: `event-${event.id}`,
      });
    }
    const [full] = await listEvents(c.var.leagueId, c.var.user.id, { id: event.id });
    return c.json({ event: full });
  })

  .delete("/:eventId", async (c) => {
    const event = await loadEvent(c.var.leagueId, uuidParam(c.req.param("eventId")));
    if (!canModify(c, event.hostId)) forbidden("Only the host or league owner can delete this event");
    await deletePhotoFiles({ eventId: event.id });
    await db.delete(schema.events).where(eq(schema.events.id, event.id));
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    return c.json({ ok: true });
  })

  /** Map image for the event's picked place (proxied so the Google key stays server-side). */
  .get("/:eventId/map", async (c) => {
    const event = await loadEvent(c.var.leagueId, uuidParam(c.req.param("eventId")));
    if (event.lat === null || event.lng === null) notFound("This event has no map location");
    try {
      const img = await staticMap(event.lat, event.lng);
      c.header("Cache-Control", "private, max-age=604800");
      return c.body(new Uint8Array(img.body), 200, { "content-type": img.contentType });
    } catch (err) {
      if (err instanceof MapsUnavailableError) throw new HTTPException(503, { message: err.message });
      throw new HTTPException(502, { message: "Couldn't load the map" });
    }
  })

  /** Pass hosting duties to another member (current host or league owner). */
  .put("/:eventId/host", async (c) => {
    const event = await loadEvent(c.var.leagueId, uuidParam(c.req.param("eventId")));
    if (!canModify(c, event.hostId)) forbidden("Only the host or league owner can hand off hosting");
    const { userId } = await parseBody(c, handOffHostSchema);
    await requireMembership(c.var.leagueId, userId);
    await db.update(schema.events).set({ hostId: userId }).where(eq(schema.events.id, event.id));
    await db
      .insert(schema.eventRsvps)
      .values({ eventId: event.id, userId, status: "going" })
      .onConflictDoUpdate({ target: [schema.eventRsvps.eventId, schema.eventRsvps.userId], set: { status: "going", updatedAt: new Date() } });
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    if (userId !== c.var.user.id) {
      void notifyUsers([userId], "events", {
        title: `🎤 You're hosting ${event.title}`,
        body: `${c.var.user.name} handed hosting to you.`,
        url: `/l/${c.var.leagueId}/events/${event.id}`,
        tag: `event-${event.id}`,
      });
    }
    const [full] = await listEvents(c.var.leagueId, c.var.user.id, { id: event.id });
    return c.json({ event: full });
  })

  .put("/:eventId/rsvp", async (c) => {
    const event = await loadEvent(c.var.leagueId, uuidParam(c.req.param("eventId")));
    const { status } = await parseBody(c, rsvpSchema);
    const key = and(eq(schema.eventRsvps.eventId, event.id), eq(schema.eventRsvps.userId, c.var.user.id));
    if (status === null) {
      await db.delete(schema.eventRsvps).where(key);
    } else {
      await db
        .insert(schema.eventRsvps)
        .values({ eventId: event.id, userId: c.var.user.id, status })
        .onConflictDoUpdate({
          target: [schema.eventRsvps.eventId, schema.eventRsvps.userId],
          set: { status, updatedAt: new Date() },
        });
    }
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    const [full] = await listEvents(c.var.leagueId, c.var.user.id, { id: event.id });
    return c.json({ event: full });
  });
