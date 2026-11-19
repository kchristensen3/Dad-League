import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { type Idea, createIdeaSchema, updateIdeaSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { AiUnavailableError, suggestIdeas } from "../lib/ai.js";
import { iso, parseBody, userSummary } from "../lib/http.js";
import { notifyLeague } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { canModify, scopedRouter } from "./scope.js";

async function listIdeas(leagueId: string, meId: string, opts: { archived?: boolean; id?: string }): Promise<Idea[]> {
  const i = schema.ideas;
  const voteCount = sql<number>`(select count(*)::int from ${schema.ideaVotes} v where v.idea_id = ${i.id})`;
  const rows = await db
    .select({
      idea: i,
      author: userSummary,
      voteCount,
      votedByMe: sql<boolean>`exists(select 1 from ${schema.ideaVotes} v where v.idea_id = ${i.id} and v.user_id = ${meId})`,
    })
    .from(i)
    .innerJoin(schema.users, eq(schema.users.id, i.authorId))
    .where(
      and(
        eq(i.leagueId, leagueId),
        opts.id ? eq(i.id, opts.id) : opts.archived ? isNotNull(i.archivedAt) : isNull(i.archivedAt),
      ),
    )
    .orderBy(desc(voteCount), desc(i.createdAt)); // most votes first
  return rows.map(({ idea, author, voteCount, votedByMe }) => ({
    id: idea.id,
    title: idea.title,
    description: idea.description,
    category: idea.category as Idea["category"],
    location: idea.location,
    aiSuggested: idea.aiSuggested,
    archived: idea.archivedAt !== null,
    author,
    voteCount,
    votedByMe,
    createdAt: iso(idea.createdAt),
  }));
}

async function loadIdea(leagueId: string, ideaId: string) {
  const idea = await db.query.ideas.findFirst({
    where: and(eq(schema.ideas.id, ideaId), eq(schema.ideas.leagueId, leagueId)),
  });
  return idea ?? notFound("Idea not found");
}

// Per-user cooldown so one person can't run up the AI bill.
const lastSuggest = new Map<string, number>();
const SUGGEST_COOLDOWN_MS = 15_000;

export const ideaRoutes = scopedRouter()
  .get("/", async (c) => {
    const archived = c.req.query("archived") === "true";
    return c.json({ ideas: await listIdeas(c.var.leagueId, c.var.user.id, { archived }) });
  })

  .post("/", async (c) => {
    const body = await parseBody(c, createIdeaSchema);
    const [idea] = await db
      .insert(schema.ideas)
      .values({ ...body, leagueId: c.var.leagueId, authorId: c.var.user.id })
      .returning();
    // Proposing an idea counts as your vote for it.
    await db.insert(schema.ideaVotes).values({ ideaId: idea!.id, userId: c.var.user.id });
    await publish({ leagueId: c.var.leagueId, kind: "ideas" });
    void notifyLeague(c.var.leagueId, c.var.user.id, "ideas", {
      title: `💡 New idea from ${c.var.user.name}`,
      body: idea!.title,
      url: `/l/${c.var.leagueId}/ideas`,
    });
    const [full] = await listIdeas(c.var.leagueId, c.var.user.id, { id: idea!.id });
    return c.json({ idea: full }, 201);
  })

  .post("/suggest", async (c) => {
    const { request } = await parseBody(c, z.object({ request: z.string().trim().max(300).optional() }));
    const last = lastSuggest.get(c.var.user.id) ?? 0;
    if (Date.now() - last < SUGGEST_COOLDOWN_MS) {
      throw new HTTPException(429, { message: "Give it a few seconds before asking again" });
    }
    lastSuggest.set(c.var.user.id, Date.now());

    const league = await db.query.leagues.findFirst({ where: eq(schema.leagues.id, c.var.leagueId) });
    const members = await db
      .select({
        location: schema.users.location,
        availability: schema.users.availability,
        interests: schema.users.interests,
      })
      .from(schema.leagueMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.leagueMembers.userId))
      .where(eq(schema.leagueMembers.leagueId, c.var.leagueId));
    const existing = await db
      .select({ title: schema.ideas.title })
      .from(schema.ideas)
      .where(eq(schema.ideas.leagueId, c.var.leagueId));
    try {
      const suggestions = await suggestIdeas({
        leagueName: league!.name,
        leagueDescription: league!.description,
        members,
        existingIdeas: existing.map((e) => e.title),
        request,
      });
      return c.json({ suggestions });
    } catch (err) {
      if (err instanceof AiUnavailableError) throw new HTTPException(503, { message: err.message });
      console.error("suggestIdeas failed", err);
      throw new HTTPException(502, { message: "The idea generator is having a moment — try again shortly" });
    }
  })

  .patch("/:ideaId", async (c) => {
    const idea = await loadIdea(c.var.leagueId, uuidParam(c.req.param("ideaId")));
    if (!canModify(c, idea.authorId)) forbidden("Only the author or league owner can edit this idea");
    const { archived, ...rest } = await parseBody(c, updateIdeaSchema);
    await db
      .update(schema.ideas)
      .set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(eq(schema.ideas.id, idea.id));
    await publish({ leagueId: c.var.leagueId, kind: "ideas" });
    const [full] = await listIdeas(c.var.leagueId, c.var.user.id, { id: idea.id });
    return c.json({ idea: full });
  })

  .delete("/:ideaId", async (c) => {
    const idea = await loadIdea(c.var.leagueId, uuidParam(c.req.param("ideaId")));
    if (!canModify(c, idea.authorId)) forbidden("Only the author or league owner can delete this idea");
    await db.delete(schema.ideas).where(eq(schema.ideas.id, idea.id));
    await publish({ leagueId: c.var.leagueId, kind: "ideas" });
    return c.json({ ok: true });
  })

  .put("/:ideaId/vote", async (c) => {
    const idea = await loadIdea(c.var.leagueId, uuidParam(c.req.param("ideaId")));
    await db.insert(schema.ideaVotes).values({ ideaId: idea.id, userId: c.var.user.id }).onConflictDoNothing();
    await publish({ leagueId: c.var.leagueId, kind: "ideas" });
    return c.json({ ok: true });
  })

  .delete("/:ideaId/vote", async (c) => {
    const idea = await loadIdea(c.var.leagueId, uuidParam(c.req.param("ideaId")));
    await db
      .delete(schema.ideaVotes)
      .where(and(eq(schema.ideaVotes.ideaId, idea.id), eq(schema.ideaVotes.userId, c.var.user.id)));
    await publish({ leagueId: c.var.leagueId, kind: "ideas" });
    return c.json({ ok: true });
  });
