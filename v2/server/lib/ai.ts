/**
 * Claude-powered idea suggestions. One structured-output call: the league's
 * profile and existing ideas go in, five validated suggestions come out.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CATEGORIES, ideaSuggestionSchema, type IdeaSuggestion } from "../../shared/schemas.js";
import { env } from "../env.js";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export const AI_MODEL = "claude-opus-5-5";

const SYSTEM = `You help a small group of dads (a "league") come up with things to do together.
Suggest activities that are realistic for busy parents: doable in an evening or a weekend
morning, mostly low cost, and specific to where they live when a location is known
(name real kinds of venues, local teams, trails, seasonal events). Mix it up: some
dads-only hangs, some that work with kids along. Never repeat an idea the league already has.
Each description is one or two plain sentences saying what you'd do and why it's fun.
Pick each category from this list only: ${CATEGORIES.join(", ")}.`;

export interface LeagueContext {
  leagueName: string;
  leagueDescription: string;
  members: { location: string | null; availability: string | null; interests: string[] }[];
  existingIdeas: string[];
  request?: string;
}

export function buildPrompt(ctx: LeagueContext) {
  const locations = [...new Set(ctx.members.map((m) => m.location).filter(Boolean))];
  const availability = ctx.members.map((m) => m.availability).filter(Boolean);
  const interests = [...new Set(ctx.members.flatMap((m) => m.interests))];
  return [
    `League: ${ctx.leagueName}${ctx.leagueDescription ? ` — ${ctx.leagueDescription}` : ""}`,
    `Where members live: ${locations.join("; ") || "unknown"}`,
    `When members are free: ${availability.join("; ") || "unknown"}`,
    `Member interests: ${interests.join(", ") || "unknown"}`,
    `Ideas already on the list: ${ctx.existingIdeas.join("; ") || "none yet"}`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
    ctx.request ? `What they asked for: ${ctx.request}` : "",
    "Suggest 5 new activity ideas.",
  ]
    .filter(Boolean)
    .join("\n");
}

export class AiUnavailableError extends Error {}

export async function suggestIdeas(ctx: LeagueContext): Promise<IdeaSuggestion[]> {
  if (!env.aiEnabled) throw new AiUnavailableError("AI suggestions are not configured");
  const response = await getClient().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    // Re-runs on a fallback model server-side if the request is declined.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ideaSuggestionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(ctx) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new AiUnavailableError("Couldn't come up with suggestions this time — try again");
  }
  return response.parsed_output.suggestions.slice(0, 5);
}
