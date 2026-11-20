/**
 * Background jobs, run every 15 minutes. A Postgres advisory lock makes sure only one
 * replica runs a pass at a time, so scaling the service up doesn't double-send anything.
 */
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { runCommissioner } from "./commissioner.js";
import { notifyUsers } from "./push.js";
import { formatWhen, localWeekdayHour } from "./recurrence.js";
import { ensureAllSeries } from "./series.js";

const INTERVAL_MS = 15 * 60_000;
const LOCK_ID = 727275;

/** Day-before reminders to everyone who hasn't said they're out. */
export async function sendReminders(now = new Date()) {
  const due = await db
    .select({ event: schema.events, timezone: schema.leagues.timezone })
    .from(schema.events)
    .innerJoin(schema.leagues, eq(schema.leagues.id, schema.events.leagueId))
    .where(
      and(
        isNull(schema.events.reminderSentAt),
        isNull(schema.events.cancelledAt),
        gt(schema.events.startsAt, now),
        lt(schema.events.startsAt, new Date(now.getTime() + 24 * 3600_000)),
      ),
    );
  for (const { event, timezone } of due) {
    await db.update(schema.events).set({ reminderSentAt: now }).where(eq(schema.events.id, event.id));
    // Something planned on short notice already got its "new event" notification.
    if (event.startsAt.getTime() - event.createdAt.getTime() < 30 * 3600_000) continue;
    const recipients = await db
      .select({ id: schema.leagueMembers.userId })
      .from(schema.leagueMembers)
      .where(
        and(
          eq(schema.leagueMembers.leagueId, event.leagueId),
          sql`${schema.leagueMembers.userId} not in (select user_id from ${schema.eventRsvps} where event_id = ${event.id} and status = 'not_going')`,
        ),
      );
    void notifyUsers(recipients.map((r) => r.id), "events", {
      title: `⏰ Tomorrow: ${event.title}`,
      body: `${formatWhen(event.startsAt, timezone)}${event.location ? ` · ${event.location}` : ""}`,
      url: `/l/${event.leagueId}/events/${event.id}`,
      tag: `event-${event.id}`,
    });
  }
  return due.length;
}

/** The morning after: ask the people who went to add photos. */
export async function sendRecapPrompts(now = new Date()) {
  if (!env.photosEnabled) return 0;
  const due = await db
    .select()
    .from(schema.events)
    .where(
      and(
        isNull(schema.events.recapPromptedAt),
        isNull(schema.events.cancelledAt),
        lt(schema.events.startsAt, new Date(now.getTime() - 12 * 3600_000)),
        gt(schema.events.startsAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    );
  for (const event of due) {
    await db.update(schema.events).set({ recapPromptedAt: now }).where(eq(schema.events.id, event.id));
    const going = await db
      .select({ id: schema.eventRsvps.userId })
      .from(schema.eventRsvps)
      .where(and(eq(schema.eventRsvps.eventId, event.id), eq(schema.eventRsvps.status, "going")));
    void notifyUsers(going.map((g) => g.id), "events", {
      title: `📸 How was ${event.title}?`,
      body: "Add a few photos for the season recap.",
      url: `/l/${event.leagueId}/events/${event.id}`,
      tag: `recap-${event.id}`,
    });
  }
  return due.length;
}

/** Monday 9am-noon local time, once a week per league. */
export async function runWeeklyCommissioner(now = new Date()) {
  if (!env.aiEnabled) return 0;
  const leagues = await db
    .select({ id: schema.leagues.id, timezone: schema.leagues.timezone, lastRun: schema.leagues.commissionerLastRunAt })
    .from(schema.leagues)
    .where(eq(schema.leagues.commissionerEnabled, true));
  let ran = 0;
  for (const l of leagues) {
    const { weekday, hour } = localWeekdayHour(l.timezone, now);
    if (weekday !== 1 || hour < 9 || hour >= 12) continue;
    if (l.lastRun && now.getTime() - l.lastRun.getTime() < 5 * 86_400_000) continue;
    try {
      await runCommissioner(l.id, { now });
      ran++;
    } catch (err) {
      console.error(`commissioner for ${l.id} failed`, err);
    }
  }
  return ran;
}

export async function runScheduledJobs(now = new Date()) {
  const [lock] = await db.execute<{ ok: boolean }>(sql`select pg_try_advisory_lock(${LOCK_ID}) as ok`);
  if (!lock?.ok) return;
  try {
    await ensureAllSeries(now);
    await sendReminders(now);
    await sendRecapPrompts(now);
    await runWeeklyCommissioner(now);
  } catch (err) {
    console.error("scheduled jobs failed", err);
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${LOCK_ID})`);
  }
}

export function startScheduler() {
  if (!env.schedulerEnabled) return () => {};
  const first = setTimeout(() => void runScheduledJobs(), 20_000);
  const timer = setInterval(() => void runScheduledJobs(), INTERVAL_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
