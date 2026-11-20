import { Apple, Google, OAuth2RequestError, decodeIdToken, generateCodeVerifier, generateState } from "arctic";
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

/** Turns the .p8 key Apple gives you (PEM text, possibly with escaped newlines) into PKCS#8 bytes. */
export function applePrivateKeyBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(body, "base64"));
}

const apple = env.appleEnabled
  ? new Apple(
      env.APPLE_CLIENT_ID!,
      env.APPLE_TEAM_ID!,
      env.APPLE_KEY_ID!,
      applePrivateKeyBytes(env.APPLE_PRIVATE_KEY!),
      `${env.appUrl}/auth/apple/callback`,
    )
  : null;

/**
 * Logs why a provider sign-in failed and picks the login-page error to show:
 * `<provider>_rejected` when the provider refused our credentials (fix the env vars),
 * `<provider>` for anything else (see the logged error).
 */
function signInFailure(provider: "google" | "apple", err: unknown): string {
  if (err instanceof OAuth2RequestError) {
    console.error(
      `${provider} sign-in: the provider rejected the code exchange (${err.code}${err.description ? `: ${err.description}` : ""}).`,
      err.code === "invalid_client"
        ? `Check ${provider === "google" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "the APPLE_* variables"}.`
        : err.code === "redirect_uri_mismatch" || err.code === "invalid_grant"
          ? `The redirect URI registered with ${provider} must be exactly ${env.appUrl}/auth/${provider}/callback`
          : "",
    );
    return `/login?error=${provider}_rejected`;
  }
  console.error(`${provider} sign-in failed after the provider approved it:`, err);
  return `/login?error=${provider}`;
}

/** Only allow same-site relative paths, so a crafted link can't bounce users elsewhere. */
export function safeReturnTo(value: string | undefined | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

type Provider = "google" | "apple";
const subColumn = { google: schema.users.googleSub, apple: schema.users.appleSub } as const;
const subField = { google: "googleSub", apple: "appleSub" } as const;

/**
 * Finds or creates the user for a provider sign-in. Lookup order: the provider's own account id,
 * then the (provider-verified) email, so someone who used Google first can later use Apple with the
 * same address and land in the same account. Apple "Hide My Email" addresses won't match, by design.
 */
export async function signInWithProvider(profile: {
  provider: Provider;
  sub: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}) {
  const email = profile.email.toLowerCase();
  const field = subField[profile.provider];
  const existing =
    (await db.query.users.findFirst({ where: eq(subColumn[profile.provider], profile.sub) })) ??
    (await db.query.users.findFirst({ where: eq(schema.users.email, email) }));
  if (existing) {
    const [updated] = await db
      .update(schema.users)
      .set({
        ...(existing[field] ? {} : { [field]: profile.sub }),
        avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
      })
      .where(eq(schema.users.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(schema.users)
    .values({ email, name: profile.name, [field]: profile.sub, avatarUrl: profile.avatarUrl ?? null })
    .returning();
  return created!;
}

/** Dev/test sign-in by email only. */
async function upsertDevUser(email: string, name: string) {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (existing) return existing;
  const [created] = await db.insert(schema.users).values({ email: email.toLowerCase(), name }).returning();
  return created!;
}

/** Best display name from Apple's first-sign-in `user` payload, which Apple sends only once. */
export function appleDisplayName(userField: string | undefined, email: string): string {
  try {
    const parsed = userField ? (JSON.parse(userField) as { name?: { firstName?: string; lastName?: string } }) : null;
    const full = [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(" ").trim();
    if (full) return full.slice(0, 80);
  } catch {
    // fall through
  }
  return email.endsWith("@privaterelay.appleid.com") ? "New member" : email.split("@")[0]!;
}

const cookieOpts = { httpOnly: true, secure: env.isProd, sameSite: "Lax" as const, path: "/", maxAge: 600 };

export const authRoutes = new Hono()
  .get("/config", (c) => c.json({ google: env.googleEnabled, apple: env.appleEnabled, devLogin: env.DEV_LOGIN }))

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
      const user = await signInWithProvider({
        provider: "google",
        sub: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email.split("@")[0]!,
        avatarUrl: claims.picture ?? null,
      });
      await createSession(c, user.id);
      return c.redirect(returnTo);
    } catch (err) {
      return c.redirect(signInFailure("google", err));
    }
  })

  .get("/apple", (c) => {
    if (!apple) throw new HTTPException(404, { message: "Sign in with Apple is not configured" });
    const state = generateState();
    // Apple returns to us with a cross-site POST, which SameSite=Lax cookies don't ride along on.
    const opts = { ...cookieOpts, sameSite: "None" as const, secure: true };
    setCookie(c, "dl_apple_state", state, opts);
    setCookie(c, "dl_return_to", safeReturnTo(c.req.query("returnTo")), opts);
    const url = apple.createAuthorizationURL(state, ["name", "email"]);
    url.searchParams.set("response_mode", "form_post"); // required by Apple when asking for name/email
    return c.redirect(url.toString());
  })

  /** Apple POSTs the result here (form_post). CSRF is covered by the state check, not the Origin check. */
  .post("/apple/callback", async (c) => {
    if (!apple) throw new HTTPException(404);
    const form = await c.req.parseBody();
    const code = typeof form.code === "string" ? form.code : undefined;
    const state = typeof form.state === "string" ? form.state : undefined;
    const expectedState = getCookie(c, "dl_apple_state");
    const returnTo = safeReturnTo(getCookie(c, "dl_return_to"));
    for (const name of ["dl_apple_state", "dl_return_to"]) deleteCookie(c, name, { path: "/", secure: true, sameSite: "None" });
    if (typeof form.error === "string") return c.redirect(form.error === "user_cancelled_authorize" ? "/login" : "/login?error=apple", 303);
    if (!code || !state || state !== expectedState) return c.redirect("/login?error=state", 303);
    try {
      const tokens = await apple.validateAuthorizationCode(code);
      const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean | string };
      const verified = claims.email_verified === true || claims.email_verified === "true";
      if (!claims.email || !verified) return c.redirect("/login?error=email", 303);
      const user = await signInWithProvider({
        provider: "apple",
        sub: claims.sub,
        email: claims.email,
        name: appleDisplayName(typeof form.user === "string" ? form.user : undefined, claims.email),
      });
      await createSession(c, user.id);
      return c.redirect(returnTo, 303);
    } catch (err) {
      return c.redirect(signInFailure("apple", err), 303);
    }
  })

  .post("/dev", async (c) => {
    if (!env.DEV_LOGIN) throw new HTTPException(404);
    const body = await parseBody(
      c,
      z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80).optional() }),
    );
    const user = await upsertDevUser(body.email, body.name ?? body.email.split("@")[0]!);
    await createSession(c, user.id);
    return c.json({ ok: true });
  })

  .post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });
