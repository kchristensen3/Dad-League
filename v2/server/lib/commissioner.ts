/**
 * The Commissioner: a weekly note in league chat, written by Claude from the league's real
 * calendar, RSVPs and idea list. When the calendar is empty it also proposes a concrete plan
 * that anyone can put on the calendar with one tap.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { CATEGORIES, type CommissionerProposal, categorySchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { AI_MODEL, AiUnavailableError } from "./ai.js";
import { notifyLeague } from "./push.js";
import { publish } from "./realtime.js";
import { formatWhen, todayIn, toInstant } from "./recurrence.js";

export interface CommissionerContext {
  leagueName: string;
  timezone: string;
  today: string;
  weekday: string;
  members: { name: string; availability: string | null }[];
  upcoming: { title: string; when: string; host: string; going: string[]; out: string[]; noReply: string[]; cancelled: boolean }[];
  topIdeas: { id: string; title: string; category: string; votes: number; location: string | null }[];
  messagesLastWeek: number;
  lastNote: string | null;
}

export const commissionerOutputSchema = z.object({
  message: z.string(),
  proposal: z
    .object({
      ideaId: z.string().nullable(),
      title: z.string(),
      category: categorySchema,
      date: z.string(),
      time: z.string(),
      location: z.string().nullable(),
    })
    .nullable(),
});
export type CommissionerOutput = z.infer<typeof commissionerOutputSchema>;

const SYSTEM = `You are "The Commissioner" of a Dad League: a small group of dads who try to hang out regularly.
Once a week you post a short note in their group chat. Your job is to keep momentum without nagging.

Write like a friendly, slightly wry league commissioner: warm, plain, a light joke at most. Under 90 words.
No hashtags, no lists of more than three items, no corporate tone, never guilt-trip anyone.

What to cover, using only the facts you're given:
- What's coming up in the next two weeks and how many are in.
- If people haven't replied to an upcoming event, nudge them by name with an @ in front of their full name
  (e.g. "@Jeff Smith"), at most three names.
- If nothing is planned in the next two weeks, say so and pitch ONE concrete plan in the note. Base it on the
  highest-voted idea when there is one (use its id as ideaId), otherwise a simple classic (pickup basketball,
  breakfast, a ballgame). Pick a date 4-14 days out and a time that fits members' availability.
  Return it in "proposal" with date as YYYY-MM-DD and time as HH:MM (24h) in the league's local time.
- If things are already planned, "proposal" must be null.
Never invent events, RSVPs or people. Category must be one of: ${CATEGORIES.join(", ")}.`;

export function buildCommissionerPrompt(ctx: CommissionerContext): string {
  const lines = [
    `League: ${ctx.leagueName}`,
    `Today: ${ctx.weekday} ${ctx.today} (${ctx.timezone})`,
    `Members: ${ctx.members.map((m) => (m.availability ? `${m.name} (free: ${m.availability})` : m.name)).join("; ")}`,
    "Upcoming (next 14 days):",
    ...(ctx.upcoming.length
      ? ctx.upcoming.map(
          (e) =>
            `- ${e.title}, ${e.when}, host ${e.host}${e.cancelled ? " [CANCELLED]" : ""}. In: ${e.going.join(", ") || "nobody yet"}. Out: ${e.out.join(", ") || "none"}. No reply: ${e.noReply.join(", ") || "none"}.`,
        )
      : ["- nothing planned"]),
    "Top ideas (by votes):",
    ...(ctx.topIdeas.length
      ? ctx.topIdeas.map((i) => `- [id ${i.id}] ${i.title} (${i.category}, ${i.votes} votes${i.location ? `, ${i.location}` : ""})`)
      : ["- none yet"]),
    `Chat messages in the last week: ${ctx.messagesLastWeek}`,
    ctx.lastNote ? `Your previous note (don't repeat it): ${ctx.lastNote}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function buildCommissionerContext(leagueId: string, now = new Date()): Promise<CommissionerContext | null> {
  const league = await db.query.leagues.findFirst({ where: eq(schema.leagues.id, leagueId) });
  if (!league) return null;
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, availability: schema.users.availability })
    .from(schema.leagueMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.leagueMembers.userId))
    .where(eq(schema.leagueMembers.leagueId, leagueId))
    .orderBy(asc(schema.leagueMembers.joinedAt));
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  const twoWeeks = new Date(now.getTime() + 14 * 86_400_000);
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.leagueId, leagueId), gt(schema.events.startsAt, now), lt(schema.events.startsAt, twoWeeks)))
    .orderBy(asc(schema.events.startsAt));
  const rsvps = events.length
    ? await db
        .select()
        .from(schema.eventRsvps)
        .where(inArray(schema.eventRsvps.eventId, events.map((e) => e.id)))
    : [];

  const upcoming = events.map((e) => {
    const mine = rsvps.filter((r) => r.eventId === e.id);
    const replied = new Set(mine.map((r) => r.userId));
    return {
      title: e.title,
      when: formatWhen(e.startsAt, league.timezone),
      host: nameOf.get(e.hostId) ?? "someone",
      going: mine.filter((r) => r.status === "going").map((r) => nameOf.get(r.userId) ?? "?"),
      out: mine.filter((r) => r.status === "not_going").map((r) => nameOf.get(r.userId) ?? "?"),
      noReply: members.filter((m) => !replied.has(m.id)).map((m) => m.name),
      cancelled: e.cancelledAt !== null,
    };
  });

  const votes = sql<number>`(select count(*)::int from ${schema.ideaVotes} v where v.idea_id = ${schema.ideas.id})`;
  const topIdeas = await db
    .select({ id: schema.ideas.id, title: schema.ideas.title, category: schema.ideas.category, location: schema.ideas.location, votes })
    .from(schema.ideas)
    .where(and(eq(schema.ideas.leagueId, leagueId), isNull(schema.ideas.archivedAt)))
    .orderBy(desc(votes))
    .limit(5);

  const [{ n: messagesLastWeek } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(eq(schema.messages.leagueId, leagueId), eq(schema.messages.kind, "user"), gt(schema.messages.createdAt, new Date(now.getTime() - 7 * 86_400_000))));

  const [last] = await db
    .select({ body: schema.messages.body })
    .from(schema.messages)
    .where(and(eq(schema.messages.leagueId, leagueId), eq(schema.messages.kind, "commissioner")))
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);

  return {
    leagueName: league.name,
    timezone: league.timezone,
    today: todayIn(league.timezone, now),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: league.timezone, weekday: "long" }).format(now),
    members: members.map(({ name, availability }) => ({ name, availability })),
    upcoming,
    topIdeas,
    messagesLastWeek,
    lastNote: last?.body ?? null,
  };
}

let client: Anthropic | null = null;

export async function writeCommissionerNote(ctx: CommissionerContext): Promise<CommissionerOutput> {
  if (!env.aiEnabled) throw new AiUnavailableError("The Commissioner needs ANTHROPIC_API_KEY");
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(commissionerOutputSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: buildCommissionerPrompt(ctx) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new AiUnavailableError("The Commissioner couldn't write a note this time");
  }
  return response.parsed_output;
}

/** Turns Claude's local date/time into a proposal, or null if it's malformed or not 1-45 days out. */
export function toProposal(out: CommissionerOutput["proposal"], timezone: string, ideaIds: Set<string>, now = new Date()): CommissionerProposal | null {
  if (!out || !/^\d{4}-\d{2}-\d{2}$/.test(out.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.time)) return null;
  const startsAt = toInstant(out.date, out.time, timezone);
  const days = (startsAt.getTime() - now.getTime()) / 86_400_000;
  if (Number.isNaN(days) || days < 1 || days > 45) return null;
  return {
    title: out.title.slice(0, 120),
    category: out.category,
    ideaId: out.ideaId && ideaIds.has(out.ideaId) ? out.ideaId : null,
    startsAt: startsAt.toISOString(),
    location: out.location?.slice(0, 200) || null,
    acceptedEventId: null,
  };
}

/**
 * Builds context, asks Claude, posts the note in general chat and notifies the league.
 * `write` is injectable so tests don't call the API.
 */
export async function runCommissioner(leagueId: string, opts: { now?: Date; write?: typeof writeCommissionerNote } = {}) {
  const now = opts.now ?? new Date();
  const ctx = await buildCommissionerContext(leagueId, now);
  if (!ctx) return null;
  const out = await (opts.write ?? writeCommissionerNote)(ctx);
  const proposal = toProposal(out.proposal, ctx.timezone, new Set(ctx.topIdeas.map((i) => i.id)), now);
  const [message] = await db
    .insert(schema.messages)
    .values({ leagueId, kind: "commissioner", authorId: null, body: out.message.trim().slice(0, 4000), proposal })
    .returning();
  await db.update(schema.leagues).set({ commissionerLastRunAt: now }).where(eq(schema.leagues.id, leagueId));
  await publish({ leagueId, kind: "messages", ref: null });
  void notifyLeague(leagueId, null, "messages", {
    title: "🏆 The Commissioner",
    body: out.message.slice(0, 140),
    url: `/l/${leagueId}/chat`,
    tag: `commissioner-${leagueId}`,
  });
  return message!;
}
