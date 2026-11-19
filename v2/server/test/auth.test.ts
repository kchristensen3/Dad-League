import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
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
