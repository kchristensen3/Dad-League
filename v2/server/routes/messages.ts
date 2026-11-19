import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { type ChatMessage, createMessageSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { iso, parseBody, userSummary } from "../lib/http.js";
import { notifyLeague } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { scopedRouter } from "./scope.js";

const PAGE = 50;

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
      .innerJoin(schema.users, eq(schema.users.id, m.authorId))
      .where(
        and(
          eq(m.leagueId, c.var.leagueId),
          eventId ? eq(m.eventId, eventId) : isNull(m.eventId),
          before && !Number.isNaN(Date.parse(before)) ? lt(m.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(m.createdAt))
      .limit(PAGE);
    const messages: ChatMessage[] = rows.reverse().map(({ message, author }) => ({
      id: message.id,
      body: message.body,
      eventId: message.eventId,
      author,
      createdAt: iso(message.createdAt),
    }));
    return c.json({ messages, hasMore: rows.length === PAGE });
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
    const out: ChatMessage = {
      id: message!.id,
      body: message!.body,
      eventId: message!.eventId,
      author: { id: c.var.user.id, name: c.var.user.name, avatarUrl: c.var.user.avatarUrl },
      createdAt: iso(message!.createdAt),
    };
    return c.json({ message: out }, 201);
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
