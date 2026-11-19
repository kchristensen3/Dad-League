import { Hono, type MiddlewareHandler } from "hono";
import type { schema } from "../db/client.js";
import { requireMembership, uuidParam } from "../lib/access.js";
import { type AppEnv, requireUser } from "../lib/auth.js";

export type LeagueEnv = AppEnv & {
  Variables: AppEnv["Variables"] & {
    leagueId: string;
    membership: typeof schema.leagueMembers.$inferSelect;
  };
};

const leagueScope: MiddlewareHandler<LeagueEnv> = async (c, next) => {
  const leagueId = uuidParam(c.req.param("leagueId"));
  c.set("leagueId", leagueId);
  c.set("membership", await requireMembership(leagueId, c.var.user.id));
  await next();
};

/** A router mounted under /api/leagues/:leagueId whose handlers can trust league membership. */
export const scopedRouter = () => new Hono<LeagueEnv>().use(requireUser).use(leagueScope);

/** Authors can edit their own content; league owners can moderate anything. */
export const canModify = (c: { var: LeagueEnv["Variables"] }, authorId: string) =>
  authorId === c.var.user.id || c.var.membership.role === "owner";
