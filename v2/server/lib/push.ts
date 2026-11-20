/** Web Push (works for installed PWAs on iOS 16.4+, Android and desktop). */
import { and, eq, inArray, ne } from "drizzle-orm";
import * as webpush from "web-push";
import type { NotificationPrefs } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

if (env.pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Notify specific users, respecting their per-category preferences. Never throws. */
export async function notifyUsers(userIds: string[], category: keyof NotificationPrefs, payload: PushPayload) {
  if (!env.pushEnabled || userIds.length === 0) return;
  try {
    const recipients = await db
      .select({ id: schema.users.id, prefs: schema.users.notificationPrefs })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
    const ids = recipients.filter((r) => r.prefs[category] !== false).map((r) => r.id);
    if (ids.length === 0) return;
    const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, ids));
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
          }
        }
      }),
    );
  } catch (err) {
    console.error("push failed", err);
  }
}

/** Notify every member of a league except the actor (null = no one excluded). Never throws. */
export async function notifyLeague(
  leagueId: string,
  actorId: string | null,
  category: keyof NotificationPrefs,
  payload: PushPayload,
) {
  if (!env.pushEnabled) return;
  try {
    const members = await db
      .select({ id: schema.leagueMembers.userId })
      .from(schema.leagueMembers)
      .where(and(eq(schema.leagueMembers.leagueId, leagueId), actorId ? ne(schema.leagueMembers.userId, actorId) : undefined));
    await notifyUsers(members.map((m) => m.id), category, payload);
  } catch (err) {
    console.error("push failed", err);
  }
}
