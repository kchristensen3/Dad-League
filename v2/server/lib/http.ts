import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { schema } from "../db/client.js";

export async function parseBody<S extends z.ZodType>(c: Context, s: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Expected a JSON body" });
  }
  const result = s.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HTTPException(400, { message: `${where}${issue?.message ?? "Invalid input"}` });
  }
  return result.data;
}

/** Column selection that yields a `UserSummary`. */
export const userSummary = {
  id: schema.users.id,
  name: schema.users.name,
  avatarUrl: schema.users.avatarUrl,
};

export const iso = (d: Date) => d.toISOString();
