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
  /** Enables the email-only sign-in form. Never set this in production. */
  DEV_LOGIN: z.stringbool().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  appUrl:
    parsed.APP_URL ??
    (parsed.RAILWAY_PUBLIC_DOMAIN
      ? `https://${parsed.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${parsed.NODE_ENV === "production" ? parsed.PORT : 5173}`),
  isProd: parsed.NODE_ENV === "production",
  googleEnabled: Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET),
  aiEnabled: Boolean(parsed.ANTHROPIC_API_KEY),
  pushEnabled: Boolean(parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY),
};

if (env.isProd && env.DEV_LOGIN) {
  throw new Error("DEV_LOGIN must not be enabled in production");
}
