import { Google, decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { createSession, destroySession } from "../lib/auth.js";
import { parseBody } from "../lib/http.js";

const google = env.googleEnabled
  ? new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, `${env.appUrl}/auth/google/callback`)
  : null;

/** Only allow same-site relative paths, so a crafted link can't bounce users elsewhere. */
export function safeReturnTo(value: string | undefined | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export async function upsertUser(profile: { googleSub?: string; email: string; name: string; avatarUrl?: string | null }) {
  const email = profile.email.toLowerCase();
  const existing =
    (profile.googleSub &&
      (await db.query.users.findFirst({ where: eq(schema.users.googleSub, profile.googleSub) }))) ||
    (await db.query.users.findFirst({ where: eq(schema.users.email, email) }));
  if (existing) {
    const [updated] = await db
      .update(schema.users)
      .set({
        googleSub: existing.googleSub ?? profile.googleSub ?? null,
        avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
      })
      .where(eq(schema.users.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(schema.users)
    .values({ email, name: profile.name, googleSub: profile.googleSub, avatarUrl: profile.avatarUrl ?? null })
    .returning();
  return created!;
}

const cookieOpts = { httpOnly: true, secure: env.isProd, sameSite: "Lax" as const, path: "/", maxAge: 600 };

export const authRoutes = new Hono()
  .get("/config", (c) => c.json({ google: env.googleEnabled, devLogin: env.DEV_LOGIN }))

  .get("/google", (c) => {
    if (!google) throw new HTTPException(404, { message: "Google sign-in is not configured" });
    const state = generateState();
    const verifier = generateCodeVerifier();
    setCookie(c, "dl_oauth_state", state, cookieOpts);
    setCookie(c, "dl_oauth_verifier", verifier, cookieOpts);
    setCookie(c, "dl_return_to", safeReturnTo(c.req.query("returnTo")), cookieOpts);
    const url = google.createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
    url.searchParams.set("prompt", "select_account");
    return c.redirect(url.toString());
  })

  .get("/google/callback", async (c) => {
    if (!google) throw new HTTPException(404);
    const { code, state } = c.req.query();
    const expectedState = getCookie(c, "dl_oauth_state");
    const verifier = getCookie(c, "dl_oauth_verifier");
    const returnTo = safeReturnTo(getCookie(c, "dl_return_to"));
    for (const name of ["dl_oauth_state", "dl_oauth_verifier", "dl_return_to"]) deleteCookie(c, name, { path: "/" });
    if (!code || !state || !verifier || state !== expectedState) {
      return c.redirect("/login?error=state");
    }
    try {
      const tokens = await google.validateAuthorizationCode(code, verifier);
      const claims = decodeIdToken(tokens.idToken()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      if (!claims.email || !claims.email_verified) return c.redirect("/login?error=email");
      const user = await upsertUser({
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email.split("@")[0]!,
        avatarUrl: claims.picture ?? null,
      });
      await createSession(c, user.id);
      return c.redirect(returnTo);
    } catch (err) {
      console.error("google callback failed", err);
      return c.redirect("/login?error=google");
    }
  })

  .post("/dev", async (c) => {
    if (!env.DEV_LOGIN) throw new HTTPException(404);
    const body = await parseBody(
      c,
      z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80).optional() }),
    );
    const user = await upsertUser({ email: body.email, name: body.name ?? body.email.split("@")[0]! });
    await createSession(c, user.id);
    return c.json({ ok: true });
  })

  .post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });
