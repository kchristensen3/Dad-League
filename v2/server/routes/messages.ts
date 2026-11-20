import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { type ChatMessage, createMessageSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, requireOwner, uuidParam } from "../lib/access.js";
import { AiUnavailableError } from "../lib/ai.js";
import { runCommissioner } from "../lib/commissioner.js";
import { iso, parseBody, userSummary } from "../lib/http.js";
import { notifyLeague } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { scopedRouter } from "./scope.js";

const PAGE = 50;
/** Owners can ask the Commissioner on demand, but not more than once an hour. */
const MANUAL_COOLDOWN_MS = 3600_000;

type Row = { message: typeof schema.messages.$inferSelect; author: { id: string | null; name: string | null; avatarUrl: string | null } | null };

const toChat = ({ message, author }: Row): ChatMessage => ({
  id: message.id,
  body: message.body,
  eventId: message.eventId,
  author: author?.id ? { id: author.id, name: author.name!, avatarUrl: author.avatarUrl } : null,
  kind: message.kind,
  proposal: message.proposal ?? null,
  createdAt: iso(message.createdAt),
});

export const messageRoutes = scopedRouter()
  /** `?eventId=` selects an event thread; omit it for the general channel. Newest page, oldest-first. */
  .get("/", async (c) => {
    const eventIdParam = c.req.query("eventId");
    const eventId = eventIdParam ? uuidParam(eventIdParam) : null;
    const before = c.req.query("before");
    const m = schema.messages;
    const rows = await db
      .select({ message: m, author: userSummary })
      .from(m)
      .leftJoin(schema.users, eq(schema.users.id, m.authorId))
      .where(
        and(
          eq(m.leagueId, c.var.leagueId),
          eventId ? eq(m.eventId, eventId) : isNull(m.eventId),
          before && !Number.isNaN(Date.parse(before)) ? lt(m.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(m.createdAt))
      .limit(PAGE);
    return c.json({ messages: rows.reverse().map(toChat), hasMore: rows.length === PAGE });
  })

  .post("/", async (c) => {
    const { body, eventId } = await parseBody(c, createMessageSchema);
    let eventTitle: string | null = null;
    if (eventId) {
      const event = await db.query.events.findFirst({
        where: and(eq(schema.events.id, eventId), eq(schema.events.leagueId, c.var.leagueId)),
      });
      if (!event) throw new HTTPException(400, { message: "eventId does not belong to this league" });
      eventTitle = event.title;
    }
    const [message] = await db
      .insert(schema.messages)
      .values({ leagueId: c.var.leagueId, eventId: eventId ?? null, authorId: c.var.user.id, body })
      .returning();
    await publish({ leagueId: c.var.leagueId, kind: "messages", ref: eventId ?? null });
    void notifyLeague(c.var.leagueId, c.var.user.id, "messages", {
      title: eventTitle ? `💬 ${c.var.user.name} · ${eventTitle}` : `💬 ${c.var.user.name}`,
      body: body.slice(0, 140),
      url: eventId ? `/l/${c.var.leagueId}/events/${eventId}` : `/l/${c.var.leagueId}/chat`,
      tag: `chat-${eventId ?? c.var.leagueId}`,
    });
    const me = c.var.user;
    return c.json({ message: toChat({ message: message!, author: { id: me.id, name: me.name, avatarUrl: me.avatarUrl } }) }, 201);
  })

  /** Ask the Commissioner to post now (league owner). */
  .post("/commissioner", async (c) => {
    await requireOwner(c.var.leagueId, c.var.user.id);
    const league = await db.query.leagues.findFirst({ where: eq(schema.leagues.id, c.var.leagueId) });
    const last = league?.commissionerLastRunAt?.getTime() ?? 0;
    if (Date.now() - last < MANUAL_COOLDOWN_MS) {
      throw new HTTPException(429, { message: "The Commissioner posted recently. Try again in an hour." });
    }
    try {
      const message = await runCommissioner(c.var.leagueId);
      return c.json({ ok: Boolean(message) });
    } catch (err) {
      if (err instanceof AiUnavailableError) throw new HTTPException(503, { message: err.message });
      console.error("commissioner failed", err);
      throw new HTTPException(502, { message: "The Commissioner is having a moment. Try again shortly." });
    }
  })

  /** One tap: turn the Commissioner's proposed plan into a real event, hosted by whoever tapped. */
  .post("/:messageId/accept", async (c) => {
    const messageId = uuidParam(c.req.param("messageId"));
    const message = await db.query.messages.findFirst({
      where: and(eq(schema.messages.id, messageId), eq(schema.messages.leagueId, c.var.leagueId)),
    });
    if (!message?.proposal) notFound("No plan to accept");
    if (message.proposal.acceptedEventId) {
      return c.json({ eventId: message.proposal.acceptedEventId, alreadyAccepted: true });
    }
    const p = message.proposal;
    const eventId = await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(schema.events)
        .values({
          leagueId: c.var.leagueId,
          hostId: c.var.user.id,
          ideaId: p.ideaId,
          title: p.title,
          category: p.category,
          location: p.location,
          description: "Proposed by the Commissioner.",
          startsAt: new Date(p.startsAt),
        })
        .returning();
      await tx.insert(schema.eventRsvps).values({ eventId: event!.id, userId: c.var.user.id, status: "going" });
      // Only the first tap wins; a concurrent second tap rolls back.
      const claimed = await tx
        .update(schema.messages)
        .set({ proposal: { ...p, acceptedEventId: event!.id } })
        .where(and(eq(schema.messages.id, message.id), sql`${schema.messages.proposal}->>'acceptedEventId' is null`))
        .returning({ id: schema.messages.id });
      if (claimed.length === 0) throw new HTTPException(409, { message: "Someone already put it on the calendar" });
      return event!.id;
    });
    await publish({ leagueId: c.var.leagueId, kind: "events" });
    await publish({ leagueId: c.var.leagueId, kind: "messages", ref: null });
    void notifyLeague(c.var.leagueId, c.var.user.id, "events", {
      title: `📅 ${p.title}`,
      body: `${c.var.user.name} took the Commissioner up on it. You in?`,
      url: `/l/${c.var.leagueId}/events/${eventId}`,
      tag: `event-${eventId}`,
    });
    return c.json({ eventId, alreadyAccepted: false }, 201);
  })

  .delete("/:messageId", async (c) => {
    const message = await db.query.messages.findFirst({
      where: and(eq(schema.messages.id, uuidParam(c.req.param("messageId"))), eq(schema.messages.leagueId, c.var.leagueId)),
    });
    if (!message) notFound("Message not found");
    if (message.authorId !== c.var.user.id && c.var.membership.role !== "owner") forbidden();
    await db.delete(schema.messages).where(eq(schema.messages.id, message.id));
    await publish({ leagueId: c.var.leagueId, kind: "messages", ref: message.eventId });
    return c.json({ ok: true });
  });
