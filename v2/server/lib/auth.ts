import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

export const SESSION_COOKIE = "dl_session";
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

export type SessionUser = typeof schema.users.$inferSelect;
export type AppEnv = { Variables: { user: SessionUser } };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(c: Context, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.authSessions).values({ tokenHash: hash(token), userId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(schema.authSessions).where(eq(schema.authSessions.tokenHash, hash(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Loads the signed-in user, or null. Extends sessions that are past the halfway mark. */
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = hash(token);
  const [row] = await db
    .select({ user: schema.users, expiresAt: schema.authSessions.expiresAt })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(and(eq(schema.authSessions.tokenHash, tokenHash), gt(schema.authSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * 86_400_000) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.update(schema.authSessions).set({ expiresAt }).where(eq(schema.authSessions.tokenHash, tokenHash));
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "Lax", path: "/", expires: expiresAt });
  }
  return row.user;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) throw new HTTPException(401, { message: "Sign in required" });
  c.set("user", user);
  await next();
};

/**
 * CSRF defence for cookie-authenticated writes: browsers always send Origin on
 * cross-site POST/PATCH/DELETE, so reject any that don't match our own origin.
 */
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin && origin !== env.appUrl) {
      throw new HTTPException(403, { message: "Cross-origin request blocked" });
    }
  }
  await next();
};

export async function pruneExpiredSessions() {
  await db.delete(schema.authSessions).where(lt(schema.authSessions.expiresAt, new Date()));
}
