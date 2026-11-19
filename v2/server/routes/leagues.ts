import { randomInt } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  type LeagueSummary,
  type Member,
  createLeagueSchema,
  joinLeagueSchema,
  updateLeagueSchema,
} from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { requireMembership, requireOwner, uuidParam } from "../lib/access.js";
import { type AppEnv, requireUser } from "../lib/auth.js";
import { iso, parseBody } from "../lib/http.js";
import { publish, startRealtime, subscribe } from "../lib/realtime.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const newInviteCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function leagueSummaries(userId: string, leagueId?: string): Promise<LeagueSummary[]> {
  const memberCount = sql<number>`(select count(*)::int from ${schema.leagueMembers} lm where lm.league_id = ${schema.leagues.id})`;
  const rows = await db
    .select({
      id: schema.leagues.id,
      name: schema.leagues.name,
      description: schema.leagues.description,
      inviteCode: schema.leagues.inviteCode,
      role: schema.leagueMembers.role,
      memberCount,
    })
    .from(schema.leagueMembers)
    .innerJoin(schema.leagues, eq(schema.leagues.id, schema.leagueMembers.leagueId))
    .where(
      and(eq(schema.leagueMembers.userId, userId), leagueId ? eq(schema.leagues.id, leagueId) : undefined),
    )
    .orderBy(asc(schema.leagueMembers.joinedAt));
  return rows;
}

async function insertUniqueLeague(values: { name: string; description: string; ownerId: string }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [league] = await db
        .insert(schema.leagues)
        .values({ ...values, inviteCode: newInviteCode() })
        .returning();
      return league!;
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err; // unique violation → retry
    }
  }
  throw new Error("could not allocate invite code");
}

export const inviteRoutes = new Hono()
  /** Public: lets the invite landing page show what you're joining before sign-in. */
  .get("/:code", async (c) => {
    const code = normalizeCode(c.req.param("code"));
    const [row] = await db
      .select({ name: schema.leagues.name, description: schema.leagues.description, memberCount: count() })
      .from(schema.leagues)
      .leftJoin(schema.leagueMembers, eq(schema.leagueMembers.leagueId, schema.leagues.id))
      .where(eq(schema.leagues.inviteCode, code))
      .groupBy(schema.leagues.id);
    if (!row) throw new HTTPException(404, { message: "That invite code doesn't match a league" });
    return c.json({ invite: row });
  });

export const leagueRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get("/", async (c) => c.json({ leagues: await leagueSummaries(c.var.user.id) }))

  .post("/", async (c) => {
    const body = await parseBody(c, createLeagueSchema);
    const league = await insertUniqueLeague({ ...body, ownerId: c.var.user.id });
    await db.insert(schema.leagueMembers).values({ leagueId: league.id, userId: c.var.user.id, role: "owner" });
    const [summary] = await leagueSummaries(c.var.user.id, league.id);
    return c.json({ league: summary }, 201);
  })

  .post("/join", async (c) => {
    const { code } = await parseBody(c, joinLeagueSchema);
    const league = await db.query.leagues.findFirst({ where: eq(schema.leagues.inviteCode, normalizeCode(code)) });
    if (!league) throw new HTTPException(404, { message: "That invite code doesn't match a league" });
    const inserted = await db
      .insert(schema.leagueMembers)
      .values({ leagueId: league.id, userId: c.var.user.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) await publish({ leagueId: league.id, kind: "members" });
    const [summary] = await leagueSummaries(c.var.user.id, league.id);
    return c.json({ league: summary, alreadyMember: inserted.length === 0 });
  })

  .get("/:leagueId", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireMembership(leagueId, c.var.user.id);
    const [summary] = await leagueSummaries(c.var.user.id, leagueId);
    return c.json({ league: summary });
  })

  .patch("/:leagueId", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireOwner(leagueId, c.var.user.id);
    const body = await parseBody(c, updateLeagueSchema);
    await db.update(schema.leagues).set(body).where(eq(schema.leagues.id, leagueId));
    await publish({ leagueId, kind: "league" });
    const [summary] = await leagueSummaries(c.var.user.id, leagueId);
    return c.json({ league: summary });
  })

  .post("/:leagueId/invite-code", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireOwner(leagueId, c.var.user.id);
    await db.update(schema.leagues).set({ inviteCode: newInviteCode() }).where(eq(schema.leagues.id, leagueId));
    await publish({ leagueId, kind: "league" });
    const [summary] = await leagueSummaries(c.var.user.id, leagueId);
    return c.json({ league: summary });
  })

  .delete("/:leagueId", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireOwner(leagueId, c.var.user.id);
    await db.delete(schema.leagues).where(eq(schema.leagues.id, leagueId));
    return c.json({ ok: true });
  })

  .get("/:leagueId/members", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireMembership(leagueId, c.var.user.id);
    const u = schema.users;
    const rows = await db
      .select({
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        location: u.location,
        availability: u.availability,
        interests: u.interests,
        role: schema.leagueMembers.role,
        joinedAt: schema.leagueMembers.joinedAt,
        eventsAttended: sql<number>`(select count(*)::int from ${schema.eventRsvps} r join ${schema.events} e on e.id = r.event_id
          where r.user_id = ${u.id} and r.status = 'going' and e.league_id = ${leagueId} and e.cancelled_at is null and e.starts_at < now())`,
        eventsHosted: sql<number>`(select count(*)::int from ${schema.events} e
          where e.host_id = ${u.id} and e.league_id = ${leagueId} and e.cancelled_at is null)`,
        ideasProposed: sql<number>`(select count(*)::int from ${schema.ideas} i where i.author_id = ${u.id} and i.league_id = ${leagueId})`,
      })
      .from(schema.leagueMembers)
      .innerJoin(u, eq(u.id, schema.leagueMembers.userId))
      .where(eq(schema.leagueMembers.leagueId, leagueId))
      .orderBy(asc(schema.leagueMembers.joinedAt));
    const members: Member[] = rows.map(({ eventsAttended, eventsHosted, ideasProposed, joinedAt, ...m }) => ({
      ...m,
      joinedAt: iso(joinedAt),
      stats: { eventsAttended, eventsHosted, ideasProposed },
    }));
    return c.json({ members });
  })

  /** Leave the league (yourself) or remove someone (owner only). */
  .delete("/:leagueId/members/:userId", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    const targetId = uuidParam(c.req.param("userId"));
    const me = await requireMembership(leagueId, c.var.user.id);
    const isSelf = targetId === c.var.user.id;
    if (!isSelf && me.role !== "owner") throw new HTTPException(403, { message: "Only the owner can remove members" });
    if (isSelf && me.role === "owner") {
      throw new HTTPException(409, { message: "Hand ownership to someone else (or delete the league) before leaving" });
    }
    await db
      .delete(schema.leagueMembers)
      .where(and(eq(schema.leagueMembers.leagueId, leagueId), eq(schema.leagueMembers.userId, targetId)));
    await publish({ leagueId, kind: "members" });
    return c.json({ ok: true });
  })

  .post("/:leagueId/owner", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireOwner(leagueId, c.var.user.id);
    const { userId } = await parseBody(c, z.object({ userId: z.uuid() }));
    await requireMembership(leagueId, userId);
    await db.transaction(async (tx) => {
      await tx.update(schema.leagues).set({ ownerId: userId }).where(eq(schema.leagues.id, leagueId));
      await tx.update(schema.leagueMembers).set({ role: "member" }).where(eq(schema.leagueMembers.leagueId, leagueId));
      await tx
        .update(schema.leagueMembers)
        .set({ role: "owner" })
        .where(and(eq(schema.leagueMembers.leagueId, leagueId), eq(schema.leagueMembers.userId, userId)));
    });
    await publish({ leagueId, kind: "members" });
    return c.json({ ok: true });
  })

  /** Server-sent events: tells the client which data changed so it can refetch. */
  .get("/:leagueId/stream", async (c) => {
    const leagueId = uuidParam(c.req.param("leagueId"));
    await requireMembership(leagueId, c.var.user.id);
    await startRealtime();
    return streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let wake: (() => void) | null = null;
      const unsubscribe = subscribe(leagueId, (change) => {
        queue.push(JSON.stringify(change));
        wake?.();
      });
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ event: "change", data: queue.shift()! });
        // Heartbeat every 25s keeps Railway's proxy from closing an idle connection.
        await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(25_000)]);
        wake = null;
        if (!queue.length && !stream.aborted) await stream.writeSSE({ event: "ping", data: "" });
      }
      unsubscribe();
    });
  });

