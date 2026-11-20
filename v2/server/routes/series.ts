import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { type Series, createSeriesSchema, updateSeriesSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { iso, parseBody, placeColumns, userSummary } from "../lib/http.js";
import { publish } from "../lib/realtime.js";
import { describeRule, localTimeOfDay, toInstant, todayIn } from "../lib/recurrence.js";
import { notifyLeague } from "../lib/push.js";

const formatClock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
import { deleteFutureSeriesEvents, ensureSeriesEvents, pickHost } from "../lib/series.js";
import { canModify, scopedRouter } from "./scope.js";

async function listSeries(leagueId: string, id?: string): Promise<Series[]> {
  const rows = await db
    .select()
    .from(schema.eventSeries)
    .where(and(eq(schema.eventSeries.leagueId, leagueId), id ? eq(schema.eventSeries.id, id) : undefined))
    .orderBy(asc(schema.eventSeries.createdAt));
  if (rows.length === 0) return [];
  const members = await db
    .select({ ...userSummary })
    .from(schema.leagueMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.leagueMembers.userId))
    .where(eq(schema.leagueMembers.leagueId, leagueId));
  const byId = new Map(members.map((m) => [m.id, m]));
  const league = await db.query.leagues.findFirst({ where: eq(schema.leagues.id, leagueId) });
  const next = await db
    .select({ id: schema.events.id, seriesId: schema.events.seriesId, startsAt: schema.events.startsAt })
    .from(schema.events)
    .where(and(inArray(schema.events.seriesId, rows.map((r) => r.id)), gt(schema.events.startsAt, new Date())))
    .orderBy(asc(schema.events.startsAt));

  return rows.map((s) => {
    const upcoming = next.find((e) => e.seriesId === s.id);
    const { host } = pickHost(s, new Set(byId.keys()), league!.ownerId);
    return {
      id: s.id,
      title: s.title,
      category: s.category as Series["category"],
      description: s.description,
      location: s.location,
      place: s.placeId && s.lat !== null && s.lng !== null ? { placeId: s.placeId, address: s.placeAddress ?? "", lat: s.lat, lng: s.lng } : null,
      url: s.url,
      rule: s.rule,
      label: describeRule(s.rule),
      timeOfDay: s.timeOfDay,
      timezone: s.timezone,
      paused: s.pausedAt !== null,
      createdBy: s.createdBy,
      rotation: s.hostRotation.map((uid) => byId.get(uid)).filter((u) => u !== undefined),
      nextHost: byId.get(host) ?? null,
      nextEvent: upcoming ? { id: upcoming.id, startsAt: iso(upcoming.startsAt) } : null,
    };
  });
}

async function loadSeries(leagueId: string, seriesId: string) {
  const s = await db.query.eventSeries.findFirst({
    where: and(eq(schema.eventSeries.id, seriesId), eq(schema.eventSeries.leagueId, leagueId)),
  });
  return s ?? notFound("Standing meetup not found");
}

async function assertMembers(leagueId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  const found = await db
    .select({ id: schema.leagueMembers.userId })
    .from(schema.leagueMembers)
    .where(and(eq(schema.leagueMembers.leagueId, leagueId), inArray(schema.leagueMembers.userId, userIds)));
  if (found.length !== new Set(userIds).size) throw new HTTPException(400, { message: "Host rotation can only include league members" });
}

export const seriesRoutes = scopedRouter()
  .get("/", async (c) => c.json({ series: await listSeries(c.var.leagueId) }))

  .post("/", async (c) => {
    const { place, ...body } = await parseBody(c, createSeriesSchema);
    const rotation = [...new Set(body.hostRotation)];
    await assertMembers(c.var.leagueId, rotation);
    const [created] = await db
      .insert(schema.eventSeries)
      .values({ ...body, ...placeColumns(place ?? null), hostRotation: rotation, leagueId: c.var.leagueId, createdBy: c.var.user.id })
      .returning();
    const eventIds = await ensureSeriesEvents(created!.id);
    await publish({ leagueId: c.var.leagueId, kind: "series" });
    const [series] = await listSeries(c.var.leagueId, created!.id);
    return c.json({ series, firstEventId: eventIds[0] ?? null }, 201);
  })

  /**
   * Edit a standing meetup. Changes also flow to its upcoming dates, except fields someone
   * already changed on a particular date (those one-off edits are kept).
   */
  .patch("/:seriesId", async (c) => {
    const old = await loadSeries(c.var.leagueId, uuidParam(c.req.param("seriesId")));
    if (!canModify(c, old.createdBy)) forbidden("Only whoever set this up, or the league owner, can change it");
    const { paused, place, hostRotation, ...fields } = await parseBody(c, updateSeriesSchema);
    if (hostRotation) await assertMembers(c.var.leagueId, hostRotation);

    const placeChange = place !== undefined ? placeColumns(place) : fields.location !== undefined ? placeColumns(null) : {};
    const [updated] = await db
      .update(schema.eventSeries)
      .set({
        ...fields,
        ...placeChange,
        ...(paused === undefined ? {} : { pausedAt: paused ? new Date() : null }),
        ...(hostRotation ? { hostRotation: [...new Set(hostRotation)], nextHostIndex: 0 } : {}),
      })
      .where(eq(schema.eventSeries.id, old.id))
      .returning();

    // Carry the edit onto upcoming, not-cancelled dates.
    const upcoming = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.seriesId, old.id), gt(schema.events.startsAt, new Date()), isNull(schema.events.cancelledAt)));
    let changedDates = 0;
    for (const e of upcoming) {
      const patch: Partial<typeof schema.events.$inferInsert> = {};
      for (const k of ["title", "category", "description", "url"] as const) {
        if (fields[k] !== undefined && fields[k] !== old[k] && e[k] === old[k]) patch[k] = fields[k] as never;
      }
      // Location and its map pin move together, and only if this date still had the series' location.
      if ((fields.location !== undefined || place !== undefined) && e.location === old.location && e.placeId === old.placeId) {
        if (fields.location !== undefined) patch.location = fields.location;
        Object.assign(patch, placeChange);
      }
      if (fields.timeOfDay && fields.timeOfDay !== old.timeOfDay && localTimeOfDay(e.startsAt, old.timezone) === old.timeOfDay) {
        patch.startsAt = toInstant(todayIn(old.timezone, e.startsAt), fields.timeOfDay, old.timezone);
      }
      if (Object.keys(patch).length) {
        await db.update(schema.events).set(patch).where(eq(schema.events.id, e.id));
        changedDates++;
      }
    }
    if (paused === false) await ensureSeriesEvents(old.id);

    await publish({ leagueId: c.var.leagueId, kind: "series" });
    if (changedDates) await publish({ leagueId: c.var.leagueId, kind: "events" });
    const moved = (fields.location !== undefined && fields.location !== old.location) || (fields.timeOfDay && fields.timeOfDay !== old.timeOfDay);
    if (moved && changedDates) {
      const what = [
        fields.location !== undefined && fields.location !== old.location ? `now at ${fields.location ?? "a new spot"}` : null,
        fields.timeOfDay && fields.timeOfDay !== old.timeOfDay ? `now at ${formatClock(fields.timeOfDay)}` : null,
      ].filter(Boolean);
      void notifyLeague(c.var.leagueId, c.var.user.id, "events", {
        title: `📍 ${updated!.title} update`,
        body: `${what.join(", ")}. Applies to the upcoming dates.`,
        url: `/l/${c.var.leagueId}/league`,
        tag: `series-${old.id}`,
      });
    }
    const [series] = await listSeries(c.var.leagueId, old.id);
    return c.json({ series, changedDates });
  })

  /** Stops the series and removes its upcoming events; past ones are kept. */
  .delete("/:seriesId", async (c) => {
    const s = await loadSeries(c.var.leagueId, uuidParam(c.req.param("seriesId")));
    if (!canModify(c, s.createdBy)) forbidden("Only whoever set this up, or the league owner, can delete it");
    await deleteFutureSeriesEvents(s.id);
    await db.delete(schema.eventSeries).where(eq(schema.eventSeries.id, s.id));
    await publish({ leagueId: c.var.leagueId, kind: "series" });
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    return c.json({ ok: true });
  });
