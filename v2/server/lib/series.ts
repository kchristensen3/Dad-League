/**
 * Standing meetups. Each series keeps its next couple of occurrences on the calendar as real
 * events (so people can RSVP and chat), choosing hosts in rotation. `ensureSeriesEvents` is
 * idempotent and safe to call from the scheduler on every replica.
 */
import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyUsers } from "./push.js";
import { publish } from "./realtime.js";
import { formatWhen, nextOccurrences, todayIn, toInstant } from "./recurrence.js";

/** How many future occurrences each active series keeps on the calendar. */
export const UPCOMING_PER_SERIES = 2;
const HORIZON_DAYS = 120;

type Series = typeof schema.eventSeries.$inferSelect;

/** Next host in rotation, skipping people who have left the league. */
export function pickHost(series: Pick<Series, "hostRotation" | "nextHostIndex" | "createdBy">, leagueMemberIds: Set<string>, ownerId: string) {
  const rotation = series.hostRotation.filter((id) => leagueMemberIds.has(id));
  if (rotation.length > 0) {
    const host = rotation[series.nextHostIndex % rotation.length]!;
    return { host, nextIndex: (series.nextHostIndex % rotation.length) + 1 };
  }
  return { host: leagueMemberIds.has(series.createdBy) ? series.createdBy : ownerId, nextIndex: series.nextHostIndex };
}

/** Generates any missing upcoming events for one series. Returns the ids of events created. */
export async function ensureSeriesEvents(seriesId: string, now = new Date()): Promise<string[]> {
  const created: { id: string; hostId: string; startsAt: Date; title: string; leagueId: string; timezone: string }[] = [];
  await db.transaction(async (tx) => {
    // One generator per series at a time, across replicas.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${seriesId}))`);
    const found = await tx.query.eventSeries.findFirst({ where: eq(schema.eventSeries.id, seriesId) });
    if (!found || found.pausedAt) return;
    let series: Series = found;
    const league = await tx.query.leagues.findFirst({ where: eq(schema.leagues.id, series.leagueId) });
    if (!league) return;

    const [{ value: upcoming } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(schema.events)
      .where(and(eq(schema.events.seriesId, series.id), gt(schema.events.startsAt, now)));
    const needed = UPCOMING_PER_SERIES - upcoming;
    if (needed <= 0) return;

    const today = todayIn(series.timezone, now);
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
    // Never generate in the past: start from today if the last generated date is older.
    const after = series.lastGeneratedOn && series.lastGeneratedOn >= today ? series.lastGeneratedOn : null;
    const dates = nextOccurrences(series.rule, series.startsOn > today ? series.startsOn : today, after, needed + 1, horizon)
      .filter((d) => toInstant(d, series.timeOfDay, series.timezone) > now)
      .slice(0, needed);
    if (dates.length === 0) return;

    const memberRows = await tx
      .select({ userId: schema.leagueMembers.userId })
      .from(schema.leagueMembers)
      .where(eq(schema.leagueMembers.leagueId, series.leagueId));
    const memberIds = new Set(memberRows.map((m) => m.userId));

    for (const day of dates) {
      const { host, nextIndex } = pickHost(series, memberIds, league.ownerId);
      const startsAt = toInstant(day, series.timeOfDay, series.timezone);
      const [event] = await tx
        .insert(schema.events)
        .values({
          leagueId: series.leagueId,
          seriesId: series.id,
          hostId: host,
          title: series.title,
          category: series.category,
          description: series.description,
          location: series.location,
          url: series.url,
          startsAt,
        })
        .returning();
      await tx.insert(schema.eventRsvps).values({ eventId: event!.id, userId: host, status: "going" });
      const [updated] = await tx
        .update(schema.eventSeries)
        .set({ lastGeneratedOn: day, nextHostIndex: nextIndex })
        .where(eq(schema.eventSeries.id, series.id))
        .returning();
      series = updated!;
      created.push({ id: event!.id, hostId: host, startsAt, title: series.title, leagueId: series.leagueId, timezone: series.timezone });
    }
  });

  if (created.length) {
    await publish({ leagueId: created[0]!.leagueId, kind: "events" });
    for (const e of created) {
      void notifyUsers([e.hostId], "events", {
        title: `🔁 You're hosting ${e.title}`,
        body: `${formatWhen(e.startsAt, e.timezone)}. Your turn to rally the crew!`,
        url: `/l/${e.leagueId}/events/${e.id}`,
        tag: `event-${e.id}`,
      });
    }
  }
  return created.map((e) => e.id);
}

export async function ensureAllSeries(now = new Date()) {
  const active = await db
    .select({ id: schema.eventSeries.id })
    .from(schema.eventSeries)
    .where(isNull(schema.eventSeries.pausedAt))
    .orderBy(asc(schema.eventSeries.createdAt));
  for (const s of active) {
    try {
      await ensureSeriesEvents(s.id, now);
    } catch (err) {
      console.error(`series ${s.id} generation failed`, err);
    }
  }
}

/** Removes a series' future events (past ones stay, just no longer linked). */
export async function deleteFutureSeriesEvents(seriesId: string, now = new Date()) {
  const future = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.seriesId, seriesId), gt(schema.events.startsAt, now)));
  if (future.length) await db.delete(schema.events).where(inArray(schema.events.id, future.map((f) => f.id)));
}
