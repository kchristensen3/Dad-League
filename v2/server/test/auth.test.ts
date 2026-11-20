import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "../db/client.js";
import { appleDisplayName, applePrivateKeyBytes, signInWithProvider } from "../routes/auth.js";
import { anonymous } from "./helpers.js";

afterAll(() => sql.end());

describe("Sign in with Apple", () => {
  it("advertises Apple when configured", async () => {
    const res = await anonymous("GET", "/auth/config");
    expect(await res.json()).toMatchObject({ apple: true, devLogin: true });
  });

  it("redirects to Apple with form_post and a cross-site-safe state cookie", async () => {
    const res = await anonymous("GET", "/auth/apple?returnTo=/join/ABCD2345");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin).toBe("https://appleid.apple.com");
    expect(url.searchParams.get("client_id")).toBe("app.dadleague.test");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/apple/callback");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("scope")).toBe("name email");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/dl_apple_state=[^;]+;.*SameSite=None/);
    expect(cookies).toMatch(/dl_apple_state=[^;]+;.*Secure/);
  });

  it("accepts Apple's cross-site POST but rejects a bad state", async () => {
    const res = await anonymous("POST", "/auth/apple/callback", {
      headers: { origin: "https://appleid.apple.com", "content-type": "application/x-www-form-urlencoded", cookie: "dl_apple_state=expected" },
      body: new URLSearchParams({ code: "abc", state: "forged" }).toString(),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?error=state");
  });

  it("sends a cancelled sign-in back to the login page quietly", async () => {
    const res = await anonymous("POST", "/auth/apple/callback", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ error: "user_cancelled_authorize", state: "x" }).toString(),
    });
    expect(res.headers.get("location")).toBe("/login");
  });

  it("still blocks other cross-origin writes", async () => {
    const res = await anonymous("POST", "/auth/logout", { headers: { origin: "https://appleid.apple.com" } });
    expect(res.status).toBe(403);
  });

  it("reads the .p8 key whether pasted with real or escaped newlines", () => {
    const pem = String(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }));
    for (const variant of [pem, pem.replace(/\n/g, "\\n")]) {
      const key = createPrivateKey({ key: Buffer.from(applePrivateKeyBytes(variant)), format: "der", type: "pkcs8" });
      expect(key.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    }
  });

  it("uses the name Apple sends once, and never shows a relay address as a name", () => {
    expect(appleDisplayName(JSON.stringify({ name: { firstName: "Jeff", lastName: "Smith" } }), "j@x.com")).toBe("Jeff Smith");
    expect(appleDisplayName(undefined, "abc123@privaterelay.appleid.com")).toBe("New member");
    expect(appleDisplayName("not json", "jeff@example.com")).toBe("jeff");
  });
});

describe("Google sign-in failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  const callback = () =>
    anonymous("GET", "/auth/google/callback?code=c0de&state=s1", {
      headers: { cookie: "dl_oauth_state=s1; dl_oauth_verifier=v1; dl_return_to=/" },
    });

  it("sends trimmed credentials and the exact redirect URI to Google", async () => {
    let body = "";
    let auth = "";
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
      const req = new Request(input, init);
      body = await req.text();
      auth = req.headers.get("authorization") ?? "";
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    await callback();
    expect(new URLSearchParams(body).get("redirect_uri")).toBe("http://localhost:3000/auth/google/callback");
    const creds = Buffer.from(auth.replace(/^Basic /, ""), "base64").toString();
    expect(creds).toBe("test-client.apps.googleusercontent.com:test-secret");
  });

  it("tells the user Google rejected the app's settings when the secret is wrong", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }));
    const res = await callback();
    expect(res.headers.get("location")).toBe("/login?error=google_rejected");
    expect(log.mock.calls.flat().join(" ")).toMatch(/invalid_client.*GOOGLE_CLIENT_SECRET/s);
    log.mockRestore();
  });

  it("signs the user in when Google accepts", async () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: `g-${Date.now()}`, email: `ok-${Date.now()}@example.com`, email_verified: true, name: "Pat" }),
    ).toString("base64url");
    const idToken = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ access_token: "a", token_type: "Bearer", expires_in: 3600, id_token: idToken }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await callback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toMatch(/dl_session=/);
  });
});

describe("account linking across providers", () => {
  it("links Apple to an existing Google account with the same email", async () => {
    const email = `linked-${Date.now()}@example.com`;
    const viaGoogle = await signInWithProvider({ provider: "google", sub: `g-${email}`, email, name: "Kyle" });
    const viaApple = await signInWithProvider({ provider: "apple", sub: `a-${email}`, email: email.toUpperCase(), name: "Other" });
    expect(viaApple.id).toBe(viaGoogle.id);
    expect(viaApple).toMatchObject({ name: "Kyle", googleSub: `g-${email}`, appleSub: `a-${email}` });
    // Next time Apple sends a different (relay) email, the Apple account id still finds the same person.
    const again = await signInWithProvider({ provider: "apple", sub: `a-${email}`, email: "zz@privaterelay.appleid.com", name: "x" });
    expect(again.id).toBe(viaGoogle.id);
  });

  it("keeps a Hide My Email Apple account separate", async () => {
    const google = await signInWithProvider({ provider: "google", sub: `g2-${Date.now()}`, email: `real-${Date.now()}@example.com`, name: "A" });
    const apple = await signInWithProvider({ provider: "apple", sub: `a2-${Date.now()}`, email: `r${Date.now()}@privaterelay.appleid.com`, name: "New member" });
    expect(apple.id).not.toBe(google.id);
  });
});
