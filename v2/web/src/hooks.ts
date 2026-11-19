import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router";
import type { LeagueChange } from "../../shared/schemas";
import { api } from "./api";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });

export function useLeagueId() {
  const { leagueId } = useParams();
  if (!leagueId) throw new Error("useLeagueId used outside a league route");
  return leagueId;
}

export const useLeague = (leagueId: string) => useQuery({ queryKey: ["league", leagueId], queryFn: () => api.league(leagueId) });
export const useMembers = (leagueId: string) =>
  useQuery({ queryKey: ["members", leagueId], queryFn: () => api.members(leagueId) });

/**
 * Subscribes to the league's server-sent event stream and refetches whatever changed.
 * EventSource reconnects on its own; on reconnect we refetch everything once.
 */
export function useLeagueStream(leagueId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource(`/api/leagues/${leagueId}/stream`);
    let first = true;
    es.addEventListener("ready", () => {
      if (!first) void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === leagueId });
      first = false;
    });
    es.addEventListener("change", (e) => {
      const change = JSON.parse((e as MessageEvent).data) as LeagueChange;
      const inv = (...key: unknown[]) => void qc.invalidateQueries({ queryKey: key });
      switch (change.kind) {
        case "messages":
          inv("messages", leagueId);
          inv("events", leagueId); // message counts
          inv("event", leagueId);
          break;
        case "events":
          inv("events", leagueId);
          inv("event", leagueId);
          inv("members", leagueId); // stats
          break;
        case "ideas":
          inv("ideas", leagueId);
          break;
        case "posts":
          inv("posts", leagueId);
          if (change.ref) inv("comments", leagueId, change.ref);
          break;
        case "members":
        case "league":
          inv("members", leagueId);
          inv("league", leagueId);
          inv("leagues");
          break;
      }
    });
    return () => es.close();
  }, [leagueId, qc]);
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Dad League` : "Dad League";
  }, [title]);
}

export const LAST_LEAGUE_KEY = "dl:lastLeague";
export function rememberLeague(id: string) {
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, id);
  } catch {}
}
export function lastLeague(): string | null {
  try {
    return localStorage.getItem(LAST_LEAGUE_KEY);
  } catch {
    return null;
  }
}
