import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.js";

/** Throws 404 (not 403, to avoid leaking existence) unless the user belongs to the league. */
export async function requireMembership(leagueId: string, userId: string) {
  const [m] = await db
    .select()
    .from(schema.leagueMembers)
    .where(and(eq(schema.leagueMembers.leagueId, leagueId), eq(schema.leagueMembers.userId, userId)))
    .limit(1);
  if (!m) throw new HTTPException(404, { message: "League not found" });
  return m;
}

export async function requireOwner(leagueId: string, userId: string) {
  const m = await requireMembership(leagueId, userId);
  if (m.role !== "owner") throw new HTTPException(403, { message: "Only the league owner can do that" });
  return m;
}

export function forbidden(message = "Not allowed"): never {
  throw new HTTPException(403, { message });
}

export function notFound(message = "Not found"): never {
  throw new HTTPException(404, { message });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Route params arrive as free text; reject non-UUIDs before they reach Postgres. */
export function uuidParam(value: string | undefined): string {
  if (!value || !UUID.test(value)) notFound();
  return value;
}
