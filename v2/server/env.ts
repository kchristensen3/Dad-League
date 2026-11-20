import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/dadleague"),
  /** Public origin, e.g. https://dadleague.up.railway.app. Falls back to Railway's injected domain. */
  APP_URL: z.string().url().optional(),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Sign in with Apple: the Services ID (not the App ID), Team ID, and the Sign in with Apple key (.p8). */
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  /** Enables the email-only sign-in form. Never set this in production. */
  DEV_LOGIN: z.stringbool().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
});

// Blank values (e.g. `GOOGLE_CLIENT_ID=` pasted from .env.example) count as unset.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
const result = schema.safeParse(raw);
if (!result.success) {
  const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
  console.error(`\nDad League can't start: these environment variables are invalid.\n${lines.join("\n")}\n`);
  process.exit(1);
}
const parsed = result.data;

const problems: string[] = [];
if (parsed.NODE_ENV === "production") {
  if (!raw.DATABASE_URL) problems.push("DATABASE_URL is not set. On Railway, set it to ${{Postgres.DATABASE_URL}}.");
  else if (/@(localhost|127\.0\.0\.1)[:/]/.test(parsed.DATABASE_URL)) {
    problems.push("DATABASE_URL points at localhost (copied from .env.example?). On Railway, use ${{Postgres.DATABASE_URL}}.");
  }
  if (parsed.APP_URL && !parsed.APP_URL.startsWith("https://")) problems.push("APP_URL must start with https://");
}
if (problems.length) {
  console.error(`\nDad League can't start:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
  process.exit(1);
}
if (parsed.NODE_ENV === "production" && parsed.DEV_LOGIN) {
  console.warn("DEV_LOGIN is ignored in production. Remove it from this service's variables.");
  parsed.DEV_LOGIN = false;
}

export const env = {
  ...parsed,
  appUrl:
    parsed.APP_URL ??
    (parsed.RAILWAY_PUBLIC_DOMAIN
      ? `https://${parsed.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${parsed.NODE_ENV === "production" ? parsed.PORT : 5173}`),
  isProd: parsed.NODE_ENV === "production",
  googleEnabled: Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET),
  appleEnabled: Boolean(parsed.APPLE_CLIENT_ID && parsed.APPLE_TEAM_ID && parsed.APPLE_KEY_ID && parsed.APPLE_PRIVATE_KEY),
  aiEnabled: Boolean(parsed.ANTHROPIC_API_KEY),
  pushEnabled: Boolean(parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY),
};

