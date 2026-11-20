import { TZDate } from "@date-fns/tz";
import { sql } from "drizzle-orm";
import type { Category, UserSummary, Wrapped } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { listPhotos } from "./photos.js";
import { scopedRouter } from "./scope.js";

type Leader = { user: UserSummary; count: number } | null;

/** A league's year in review: counts only events that already happened and weren't cancelled. */
export async function buildWrapped(leagueId: string, year: number, now = new Date()): Promise<Wrapped> {
  const league = (await db.query.leagues.findFirst({ where: (l, { eq }) => eq(l.id, leagueId) }))!;
  const from = new Date(new TZDate(year, 0, 1, 0, 0, league.timezone).getTime());
  const yearEnd = new Date(new TZDate(year + 1, 0, 1, 0, 0, league.timezone).getTime());
  const toDate = yearEnd < now ? yearEnd : now;
  // Raw SQL parameters go to the driver untyped, so pass timestamps as ISO strings.
  const fromS = sql`${from.toISOString()}::timestamptz`;
  const to = sql`${toDate.toISOString()}::timestamptz`;
  const tz = league.timezone;
  const e = schema.events;
  const held = sql`${e.leagueId} = ${leagueId} and ${e.cancelledAt} is null and ${e.startsAt} >= ${fromS} and ${e.startsAt} < ${to}`;

  const [totals] = await db.execute<{ meetups: number; rsvps: number; dads: number }>(sql`
    select count(distinct ${e.id})::int as meetups,
           count(r.user_id) filter (where r.status = 'going')::int as rsvps,
           count(distinct r.user_id) filter (where r.status = 'going')::int as dads
    from ${e} left join ${schema.eventRsvps} r on r.event_id = ${e.id}
    where ${held}`);

  const [busiest] = await db.execute<{ month: number; meetups: number }>(sql`
    select extract(month from ${e.startsAt} at time zone ${tz})::int as month, count(*)::int as meetups
    from ${e} where ${held} group by 1 order by 2 desc, 1 limit 1`);

  const [topCat] = await db.execute<{ category: Category; meetups: number }>(sql`
    select ${e.category} as category, count(*)::int as meetups from ${e} where ${held}
    group by 1 order by 2 desc limit 1`);

  const [biggest] = await db.execute<{ id: string; title: string; starts_at: Date; going: number }>(sql`
    select ${e.id} as id, ${e.title} as title, ${e.startsAt} as starts_at,
           (select count(*)::int from ${schema.eventRsvps} r where r.event_id = ${e.id} and r.status = 'going') as going
    from ${e} where ${held} order by going desc, ${e.startsAt} limit 1`);

  const leader = async (query: ReturnType<typeof sql>): Promise<Leader> => {
    const [row] = await db.execute<{ id: string; name: string; avatar_url: string | null; n: number }>(query);
    return row && row.n > 0 ? { user: { id: row.id, name: row.name, avatarUrl: row.avatar_url }, count: row.n } : null;
  };
  const u = schema.users;
  const members = sql`${u.id} in (select user_id from ${schema.leagueMembers} where league_id = ${leagueId})`;

  const [ironman, headCoach, ideaMachine, giftOfGab] = await Promise.all([
    leader(sql`select ${u.id}, ${u.name}, ${u.avatarUrl} as avatar_url, count(*)::int as n
      from ${schema.eventRsvps} r join ${e} on ${e.id} = r.event_id join ${u} on ${u.id} = r.user_id
      where r.status = 'going' and ${held} and ${members} group by ${u.id} order by n desc limit 1`),
    leader(sql`select ${u.id}, ${u.name}, ${u.avatarUrl} as avatar_url, count(*)::int as n
      from ${e} join ${u} on ${u.id} = ${e.hostId} where ${held} and ${members} group by ${u.id} order by n desc limit 1`),
    leader(sql`select ${u.id}, ${u.name}, ${u.avatarUrl} as avatar_url, count(*)::int as n
      from ${schema.ideas} i join ${u} on ${u.id} = i.author_id
      where i.league_id = ${leagueId} and i.created_at >= ${fromS} and i.created_at < ${to} and ${members}
      group by ${u.id} order by n desc limit 1`),
    leader(sql`select ${u.id}, ${u.name}, ${u.avatarUrl} as avatar_url, count(*)::int as n
      from ${schema.messages} m join ${u} on ${u.id} = m.author_id
      where m.league_id = ${leagueId} and m.created_at >= ${fromS} and m.created_at < ${to} and ${members}
      group by ${u.id} order by n desc limit 1`),
  ]);

  const [counts] = await db.execute<{ ideas: number; messages: number; photos: number }>(sql`
    select (select count(*)::int from ${schema.ideas} where league_id = ${leagueId} and created_at >= ${fromS} and created_at < ${to}) as ideas,
           (select count(*)::int from ${schema.messages} where league_id = ${leagueId} and kind = 'user' and created_at >= ${fromS} and created_at < ${to}) as messages,
           (select count(*)::int from ${schema.photos} p join ${e} on ${e.id} = p.event_id where ${held}) as photos`);

  return {
    year,
    leagueName: league.name,
    meetups: totals?.meetups ?? 0,
    totalRsvps: totals?.rsvps ?? 0,
    dadsInvolved: totals?.dads ?? 0,
    photos: counts?.photos ?? 0,
    busiestMonth: busiest ?? null,
    topCategory: topCat ?? null,
    biggestEvent: biggest ? { id: biggest.id, title: biggest.title, startsAt: new Date(biggest.starts_at).toISOString(), going: biggest.going } : null,
    ideasPitched: counts?.ideas ?? 0,
    messages: counts?.messages ?? 0,
    leaders: { ironman, headCoach, ideaMachine, giftOfGab },
    collage: await listPhotos(leagueId, { from, to: toDate, limit: 60, random: true }).then((p) => p.slice(0, 12)),
  };
}

export const wrappedRoutes = scopedRouter().get("/", async (c) => {
  const thisYear = new Date().getFullYear();
  const year = Number(c.req.query("year") ?? thisYear);
  const safeYear = Number.isInteger(year) && year >= 2020 && year <= thisYear ? year : thisYear;
  return c.json({ wrapped: await buildWrapped(c.var.leagueId, safeYear) });
});
