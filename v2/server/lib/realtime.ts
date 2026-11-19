/**
 * Live updates. Every write calls `publish()`, which goes through Postgres
 * NOTIFY so that all app replicas (not just the one handling the write) hear
 * about it and forward it to their connected SSE clients.
 */
import type { LeagueChange } from "../../shared/schemas.js";
import { sql } from "../db/client.js";

const CHANNEL = "league_changes";
type Listener = (change: LeagueChange) => void;
const listeners = new Map<string, Set<Listener>>();
let listening: Promise<unknown> | null = null;

function dispatch(change: LeagueChange) {
  for (const fn of listeners.get(change.leagueId) ?? []) fn(change);
}

export function startRealtime() {
  listening ??= sql
    .listen(CHANNEL, (payload) => {
      try {
        dispatch(JSON.parse(payload) as LeagueChange);
      } catch (err) {
        console.error("bad realtime payload", err);
      }
    })
    .catch((err) => {
      console.error("LISTEN failed", err);
      listening = null;
    });
  return listening;
}

export function subscribe(leagueId: string, fn: Listener) {
  let set = listeners.get(leagueId);
  if (!set) listeners.set(leagueId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(leagueId);
  };
}

export async function publish(change: LeagueChange) {
  try {
    await sql.notify(CHANNEL, JSON.stringify(change));
  } catch (err) {
    console.error("NOTIFY failed", err);
  }
}
