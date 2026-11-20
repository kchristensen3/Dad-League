import { and, asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { type Me, pushSubscriptionSchema, updateProfileSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { type AppEnv, type SessionUser, destroySession, getSessionUser, requireUser } from "../lib/auth.js";
import { iso, parseBody } from "../lib/http.js";
import { deletePhotoFiles } from "../lib/storage.js";

export const toMe = (u: SessionUser): Me => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarUrl: u.avatarUrl,
  location: u.location,
  availability: u.availability,
  interests: u.interests,
  notificationPrefs: u.notificationPrefs,
  createdAt: iso(u.createdAt),
});

export const meRoutes = new Hono<AppEnv>()
  // Not behind requireUser: the client asks this to learn whether it is signed in.
  .get("/", async (c) => {
    const user = await getSessionUser(c);
    return c.json({ user: user ? toMe(user) : null });
  })

  .patch("/", requireUser, async (c) => {
    const body = await parseBody(c, updateProfileSchema);
    const [updated] = await db
      .update(schema.users)
      .set(body)
      .where(eq(schema.users.id, c.var.user.id))
      .returning();
    return c.json({ user: toMe(updated!) });
  })

  .delete("/", requireUser, async (c) => {
    const userId = c.var.user.id;
    await deletePhotoFiles({ uploaderId: userId });
    await db.transaction(async (tx) => {
      // Hand each owned league to its longest-standing other member; delete leagues left empty.
      const owned = await tx.select().from(schema.leagues).where(eq(schema.leagues.ownerId, userId));
      for (const league of owned) {
        const [heir] = await tx
          .select()
          .from(schema.leagueMembers)
          .where(and(eq(schema.leagueMembers.leagueId, league.id), ne(schema.leagueMembers.userId, userId)))
          .orderBy(asc(schema.leagueMembers.joinedAt))
          .limit(1);
        if (heir) {
          await tx.update(schema.leagues).set({ ownerId: heir.userId }).where(eq(schema.leagues.id, league.id));
          await tx
            .update(schema.leagueMembers)
            .set({ role: "owner" })
            .where(and(eq(schema.leagueMembers.leagueId, league.id), eq(schema.leagueMembers.userId, heir.userId)));
        } else {
          await tx.delete(schema.leagues).where(eq(schema.leagues.id, league.id));
        }
      }
      await tx.delete(schema.users).where(eq(schema.users.id, userId));
    });
    await destroySession(c);
    return c.json({ ok: true });
  })

  .get("/push", (c) => c.json({ enabled: env.pushEnabled, publicKey: env.VAPID_PUBLIC_KEY ?? null }))

  .post("/push", requireUser, async (c) => {
    const sub = await parseBody(c, pushSubscriptionSchema);
    await db
      .insert(schema.pushSubscriptions)
      .values({ userId: c.var.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: c.var.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
    return c.json({ ok: true });
  })

  .delete("/push", requireUser, async (c) => {
    const endpoint = c.req.query("endpoint");
    if (endpoint) {
      await db
        .delete(schema.pushSubscriptions)
        .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, c.var.user.id)));
    }
    return c.json({ ok: true });
  });
