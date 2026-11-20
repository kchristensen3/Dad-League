import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { type Series, createSeriesSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { iso, parseBody, userSummary } from "../lib/http.js";
import { publish } from "../lib/realtime.js";
import { describeRule } from "../lib/recurrence.js";
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
    const body = await parseBody(c, createSeriesSchema);
    const rotation = [...new Set(body.hostRotation)];
    await assertMembers(c.var.leagueId, rotation);
    const [created] = await db
      .insert(schema.eventSeries)
      .values({ ...body, hostRotation: rotation, leagueId: c.var.leagueId, createdBy: c.var.user.id })
      .returning();
    const eventIds = await ensureSeriesEvents(created!.id);
    await publish({ leagueId: c.var.leagueId, kind: "series" });
    const [series] = await listSeries(c.var.leagueId, created!.id);
    return c.json({ series, firstEventId: eventIds[0] ?? null }, 201);
  })

  .patch("/:seriesId", async (c) => {
    const s = await loadSeries(c.var.leagueId, uuidParam(c.req.param("seriesId")));
    if (!canModify(c, s.createdBy)) forbidden("Only whoever set this up, or the league owner, can change it");
    const body = await parseBody(c, z.object({ paused: z.boolean().optional(), hostRotation: z.array(z.uuid()).max(50).optional() }));
    if (body.hostRotation) await assertMembers(c.var.leagueId, body.hostRotation);
    await db
      .update(schema.eventSeries)
      .set({
        ...(body.paused === undefined ? {} : { pausedAt: body.paused ? new Date() : null }),
        ...(body.hostRotation ? { hostRotation: [...new Set(body.hostRotation)], nextHostIndex: 0 } : {}),
      })
      .where(eq(schema.eventSeries.id, s.id));
    if (body.paused === false) await ensureSeriesEvents(s.id);
    await publish({ leagueId: c.var.leagueId, kind: "series" });
    const [series] = await listSeries(c.var.leagueId, s.id);
    return c.json({ series });
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
