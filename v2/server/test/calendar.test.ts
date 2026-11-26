import { describe, expect, it } from "vitest";
import { buildIcs, fold } from "../lib/ics.js";
import { TestUser, anonymous, leagueWith } from "./helpers.js";

async function eventIn(owner: TestUser, leagueId: string, startsAt: string, title = "Tigers game") {
  const { data } = await owner.json("POST", `/api/leagues/${leagueId}/events`, {
    title,
    category: "Watch a Game",
    startsAt,
    location: "Comerica Park, Detroit; Gate A",
    description: "Meet at the statue",
  });
  return data.event as { id: string };
}

describe("add to calendar (.ics)", () => {
  it("builds valid, escaped, folded iCalendar text", () => {
    const ics = buildIcs([
      { uid: "abc", title: "Trivia, round 2; finals", startsAt: new Date("2026-12-03T00:30:00Z"), location: "Pub", description: "a".repeat(200) },
    ]);
    expect(ics).toContain("\r\nDTSTART:20261203T003000Z\r\n");
    expect(ics).toContain("DTEND:20261203T023000Z");
    expect(ics).toContain("SUMMARY:Trivia\\, round 2\; finals");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(fold("é".repeat(60)).split("\r\n ").join("")).toBe("é".repeat(60));
  });

  it("serves a member's event by private token, and nothing to anyone else", async () => {
    const owner = await TestUser.create("Owner");
    const outsider = await TestUser.create("Outsider");
    const league = await leagueWith(owner);
    const event = await eventIn(owner, league.id, "2026-12-10T23:00:00.000Z");

    const { data } = await owner.json("GET", "/api/me/calendar-token");
    const again = await owner.json("GET", "/api/me/calendar-token");
    expect(again.data.token).toBe(data.token);

    const res = await anonymous("GET", `/cal/${data.token}/events/${event.id}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = (await res.text()).replace(/\r\n /g, ""); // unfold long lines
    expect(body).toContain("SUMMARY:Tigers game");
    expect(body).toContain("LOCATION:Comerica Park\\, Detroit\; Gate A");
    expect(body).toContain(`/l/${league.id}/events/${event.id}`);

    const other = await outsider.json("GET", "/api/me/calendar-token");
    expect((await anonymous("GET", `/cal/${other.data.token}/events/${event.id}.ics`)).status).toBe(404);
    expect((await anonymous("GET", `/cal/${"x".repeat(32)}/events/${event.id}.ics`)).status).toBe(404);
    expect((await anonymous("GET", "/api/me/calendar-token")).status).toBe(401);
  });
});

describe("calendar range", () => {
  it("returns events between two dates, oldest first, and rejects bad ranges", async () => {
    const owner = await TestUser.create("Owner");
    const league = await leagueWith(owner);
    await eventIn(owner, league.id, "2026-12-20T23:00:00.000Z", "Later");
    await eventIn(owner, league.id, "2026-12-05T23:00:00.000Z", "Earlier");
    await eventIn(owner, league.id, "2027-02-01T23:00:00.000Z", "Out of range");

    const base = `/api/leagues/${league.id}/events`;
    const { status, data } = await owner.json("GET", `${base}?from=2026-11-29T00:00:00.000Z&to=2027-01-03T00:00:00.000Z`);
    expect(status).toBe(200);
    expect(data.events.map((e: { title: string }) => e.title)).toEqual(["Earlier", "Later"]);

    expect((await owner.req("GET", `${base}?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z`)).status).toBe(400);
    expect((await owner.req("GET", `${base}?from=nope&to=2026-12-31T00:00:00Z`)).status).toBe(400);
  });
});
