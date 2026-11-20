import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema, sql } from "../db/client.js";
import { buildCommissionerContext, buildCommissionerPrompt, runCommissioner, toProposal } from "../lib/commissioner.js";
import { sendRecapPrompts, sendReminders } from "../lib/scheduler.js";
import { ensureSeriesEvents } from "../lib/series.js";
import { TestUser, leagueWith } from "./helpers.js";

afterAll(() => sql.end());

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const dayString = (d: Date) => d.toISOString().slice(0, 10);

describe("standing meetups", () => {
  it("keeps two upcoming events on the calendar and rotates hosts", async () => {
    const a = await TestUser.create("Ann");
    const b = await TestUser.create("Bob");
    const league = await leagueWith(a, b);
    const [ma, mb] = [await a.me(), await b.me()];
    const res = await a.json("POST", `/api/leagues/${league.id}/series`, {
      title: "Breakfast club",
      category: "Food & Drink",
      rule: { freq: "weekly", weekday: new Date().getUTCDay() },
      timeOfDay: "08:00",
      timezone: "UTC",
      startsOn: dayString(inDays(1)),
      hostRotation: [mb.id, ma.id],
    });
    expect(res.status).toBe(201);
    expect(res.data.series).toMatchObject({ label: expect.stringMatching(/^Every /), paused: false });
    expect(res.data.firstEventId).toBeTruthy();

    const events = (await a.json("GET", `/api/leagues/${league.id}/events`)).data.events;
    expect(events.map((e: any) => [e.host.name, e.series?.label])).toEqual([
      ["Bob", res.data.series.label],
      ["Ann", res.data.series.label],
    ]);
    expect(events[0].myRsvp).toBe(null);
    expect(events[0].going.map((g: any) => g.name)).toEqual(["Bob"]);
    // Next up in rotation is Bob again.
    expect((await a.json("GET", `/api/leagues/${league.id}/series`)).data.series[0].nextHost.name).toBe("Bob");

    // Idempotent: nothing new while two are already upcoming.
    expect(await ensureSeriesEvents(res.data.series.id)).toEqual([]);
  });

  it("skips hosts who left, pauses, and deletes only future events", async () => {
    const a = await TestUser.create("Ann");
    const b = await TestUser.create("Bob");
    const league = await leagueWith(a, b);
    const mb = await b.me();
    await b.req("DELETE", `/api/leagues/${league.id}/members/${mb.id}`);
    const created = await a.json("POST", `/api/leagues/${league.id}/series`, {
      title: "Hoops",
      category: "Sports & Fitness",
      rule: { freq: "monthly", weekday: 2, nth: 1 },
      timeOfDay: "19:30",
      timezone: "America/Detroit",
      startsOn: dayString(new Date()),
      hostRotation: [],
    });
    const id = created.data.series.id;
    let events = (await a.json("GET", `/api/leagues/${league.id}/events`)).data.events;
    expect(events).toHaveLength(2);
    expect(events.every((e: any) => e.host.name === "Ann")).toBe(true);
    expect(new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" }).format(new Date(events[0].startsAt))).toBe("7:30 PM");

    const rejected = await a.json("PATCH", `/api/leagues/${league.id}/series/${id}`, { hostRotation: [mb.id] });
    expect(rejected.status).toBe(400);

    expect((await a.json("PATCH", `/api/leagues/${league.id}/series/${id}`, { paused: true })).data.series.paused).toBe(true);
    await db.delete(schema.events).where(eq(schema.events.seriesId, id));
    expect(await ensureSeriesEvents(id)).toEqual([]);

    expect((await a.req("DELETE", `/api/leagues/${league.id}/series/${id}`)).status).toBe(200);
    expect((await a.json("GET", `/api/leagues/${league.id}/series`)).data.series).toEqual([]);
  });

  it("lets the host hand off to another member", async () => {
    const a = await TestUser.create("Ann");
    const b = await TestUser.create("Bob");
    const c = await TestUser.create("Cal");
    const league = await leagueWith(a, b);
    const ev = await a.json("POST", `/api/leagues/${league.id}/events`, { title: "Poker", category: "Games & Trivia", startsAt: inDays(5).toISOString() });
    const url = `/api/leagues/${league.id}/events/${ev.data.event.id}/host`;
    expect((await b.req("PUT", url, { userId: (await b.me()).id })).status).toBe(403);
    expect((await a.req("PUT", url, { userId: (await c.me()).id })).status).toBe(404); // not a member
    const handed = await a.json("PUT", url, { userId: (await b.me()).id });
    expect(handed.data.event.host.name).toBe("Bob");
    expect(handed.data.event.going.map((g: any) => g.name).sort()).toEqual(["Ann", "Bob"]);
  });
});

describe("the Commissioner", () => {
  it("builds context with who hasn't replied, and posts a note with a usable plan", async () => {
    const a = await TestUser.create("Ann Lee");
    const b = await TestUser.create("Bob Ray");
    const league = await leagueWith(a, b);
    const idea = await a.json("POST", `/api/leagues/${league.id}/ideas`, { title: "Disc golf", category: "Outdoors" });
    await a.json("POST", `/api/leagues/${league.id}/events`, { title: "Trivia", category: "Games & Trivia", startsAt: inDays(3).toISOString() });

    const ctx = (await buildCommissionerContext(league.id))!;
    expect(ctx.upcoming[0]).toMatchObject({ title: "Trivia", going: ["Ann Lee"], noReply: ["Bob Ray"] });
    expect(ctx.topIdeas[0]).toMatchObject({ id: idea.data.idea.id, votes: 1 });
    expect(buildCommissionerPrompt(ctx)).toContain("No reply: Bob Ray");

    const date = dayString(inDays(8));
    await runCommissioner(league.id, {
      write: async () => ({
        message: "Trivia Thursday is on. @Bob Ray, you in?",
        proposal: { ideaId: idea.data.idea.id, title: "Disc golf", category: "Outdoors", date, time: "10:00", location: "Rouge Park" },
      }),
    });
    const chat = (await b.json("GET", `/api/leagues/${league.id}/messages`)).data.messages;
    const note = chat.at(-1);
    expect(note).toMatchObject({ kind: "commissioner", author: null, body: expect.stringContaining("@Bob Ray") });
    expect(note.proposal).toMatchObject({ title: "Disc golf", ideaId: idea.data.idea.id, acceptedEventId: null });

    const accepted = await b.json("POST", `/api/leagues/${league.id}/messages/${note.id}/accept`);
    expect(accepted.status).toBe(201);
    const event = (await b.json("GET", `/api/leagues/${league.id}/events/${accepted.data.eventId}`)).data.event;
    expect(event).toMatchObject({ title: "Disc golf", host: { name: "Bob Ray" }, ideaId: idea.data.idea.id, location: "Rouge Park" });
    const again = await a.json("POST", `/api/leagues/${league.id}/messages/${note.id}/accept`);
    expect(again.data).toMatchObject({ eventId: accepted.data.eventId, alreadyAccepted: true });
  });

  it("drops proposals that are malformed, in the past, or too far out", () => {
    const base = { ideaId: "not-a-real-id", title: "x", category: "Outdoors" as const, location: null };
    expect(toProposal({ ...base, date: dayString(inDays(-2)), time: "10:00" }, "UTC", new Set())).toBeNull();
    expect(toProposal({ ...base, date: dayString(inDays(90)), time: "10:00" }, "UTC", new Set())).toBeNull();
    expect(toProposal({ ...base, date: "next tuesday", time: "10:00" }, "UTC", new Set())).toBeNull();
    expect(toProposal({ ...base, date: dayString(inDays(5)), time: "10:00" }, "UTC", new Set())).toMatchObject({ ideaId: null });
  });

  it("is owner-only on demand and reports when AI isn't configured", async () => {
    const a = await TestUser.create();
    const b = await TestUser.create();
    const league = await leagueWith(a, b);
    expect((await b.req("POST", `/api/leagues/${league.id}/messages/commissioner`)).status).toBe(403);
    expect((await a.req("POST", `/api/leagues/${league.id}/messages/commissioner`)).status).toBe(503);
    const off = await a.json("PATCH", `/api/leagues/${league.id}`, { commissionerEnabled: false, timezone: "America/Chicago" });
    expect(off.data.league).toMatchObject({ commissionerEnabled: false, timezone: "America/Chicago" });
    expect((await a.req("PATCH", `/api/leagues/${league.id}`, { timezone: "Mars/Olympus" })).status).toBe(400);
  });
});

describe("photos and Season Wrapped", () => {
  const png = (color: string) =>
    sharp({ create: { width: 1200, height: 800, channels: 3, background: color } })
      .withMetadata({ exif: { IFD0: { Make: "TestPhone" } } })
      .jpeg()
      .toBuffer();

  it("uploads, strips metadata, serves thumbnails only to members, and feeds Wrapped", async () => {
    const a = await TestUser.create("Ann");
    const b = await TestUser.create("Bob");
    const stranger = await TestUser.create("Zed");
    const league = await leagueWith(a, b);
    const ev = await a.json("POST", `/api/leagues/${league.id}/events`, {
      title: "Cookout",
      category: "Food & Drink",
      startsAt: inDays(-2).toISOString(),
    });
    await b.json("PUT", `/api/leagues/${league.id}/events/${ev.data.event.id}/rsvp`, { status: "going" });

    const form = new FormData();
    form.set("eventId", ev.data.event.id);
    form.append("photos", new File([await png("#ff8800")], "grill.jpg", { type: "image/jpeg" }));
    form.append("photos", new File([await png("#0088ff")], "lake.jpg", { type: "image/jpeg" }));
    const up = await b.upload(`/api/leagues/${league.id}/photos`, form);
    expect(up.status).toBe(201);
    const photos = (await up.json()).photos;
    expect(photos).toHaveLength(2);
    expect(photos[0]).toMatchObject({ eventTitle: "Cookout", uploader: { name: "Bob" }, width: 1200, height: 800 });

    const thumb = await a.req("GET", photos[0].thumbUrl);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 480, height: 480 });
    expect(meta.exif).toBeUndefined();
    expect((await stranger.req("GET", photos[0].fullUrl)).status).toBe(404);

    const bad = new FormData();
    bad.set("eventId", ev.data.event.id);
    bad.append("photos", new File(["not an image"], "notes.txt", { type: "text/plain" }));
    expect((await b.upload(`/api/leagues/${league.id}/photos`, bad)).status).toBe(400);

    expect((await a.json("GET", `/api/leagues/${league.id}/events/${ev.data.event.id}`)).data.event.photoCount).toBe(2);

    const wrapped = (await a.json("GET", `/api/leagues/${league.id}/wrapped`)).data.wrapped;
    expect(wrapped).toMatchObject({
      meetups: 1,
      totalRsvps: 2,
      dadsInvolved: 2,
      photos: 2,
      topCategory: { category: "Food & Drink", meetups: 1 },
      biggestEvent: { title: "Cookout", going: 2 },
      leaders: { headCoach: { user: { name: "Ann" }, count: 1 } },
    });
    expect(wrapped.collage).toHaveLength(2);

    // Members can't delete each other's photos; the uploader can.
    expect((await a.req("DELETE", `/api/leagues/${league.id}/photos/${photos[0].id}`)).status).toBe(200); // Ann is owner
    expect((await b.json("GET", `/api/leagues/${league.id}/photos?eventId=${ev.data.event.id}`)).data.photos).toHaveLength(1);
  });
});

describe("scheduled jobs", () => {
  it("sends one day-before reminder and one morning-after photo prompt per event", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    const soon = await a.json("POST", `/api/leagues/${league.id}/events`, { title: "Soon", category: "Outdoors", startsAt: new Date(Date.now() + 20 * 3600_000).toISOString() });
    const done = await a.json("POST", `/api/leagues/${league.id}/events`, { title: "Done", category: "Outdoors", startsAt: new Date(Date.now() - 20 * 3600_000).toISOString() });

    expect(await sendReminders()).toBeGreaterThanOrEqual(1);
    expect(await sendRecapPrompts()).toBeGreaterThanOrEqual(1);
    const [s] = await db.select().from(schema.events).where(eq(schema.events.id, soon.data.event.id));
    const [d] = await db.select().from(schema.events).where(eq(schema.events.id, done.data.event.id));
    expect(s!.reminderSentAt).not.toBeNull();
    expect(d!.recapPromptedAt).not.toBeNull();
    // Second pass finds nothing new for these.
    const before = s!.reminderSentAt!.getTime();
    await sendReminders();
    const [s2] = await db.select().from(schema.events).where(eq(schema.events.id, soon.data.event.id));
    expect(s2!.reminderSentAt!.getTime()).toBe(before);
  });
});

describe("test notification", () => {
  it("explains when no device is signed up (push is off in tests)", async () => {
    const a = await TestUser.create();
    const res = await a.json("POST", "/api/me/push/test");
    expect(res.status).toBe(503);
  });
});

describe("editing standing meetups", () => {
  it("updates upcoming dates but keeps one-off changes", async () => {
    const a = await TestUser.create("Ann");
    const b = await TestUser.create("Bob");
    const league = await leagueWith(a, b);
    const base = `/api/leagues/${league.id}`;
    const created = await a.json("POST", `${base}/series`, {
      title: "Trivia", category: "Games & Trivia", location: "Old bar",
      rule: { freq: "weekly", weekday: new Date().getUTCDay() }, timeOfDay: "19:00", timezone: "America/Detroit",
      startsOn: dayString(inDays(1)), hostRotation: [],
    });
    const seriesId = created.data.series.id;
    const [first, second] = (await a.json("GET", `${base}/events`)).data.events;
    // Someone moves just the second date somewhere else.
    await a.json("PATCH", `${base}/events/${second.id}`, { location: "Jeff's garage" });

    expect((await b.req("PATCH", `${base}/series/${seriesId}`, { location: "x" })).status).toBe(403);

    const place = { placeId: "ChIJEasternMarketBrew01", address: "2515 Riopelle St, Detroit, MI", lat: 42.3478, lng: -83.0412 };
    const res = await a.json("PATCH", `${base}/series/${seriesId}`, {
      location: "Eastern Market Brewing Co.", place, timeOfDay: "20:00", description: "Bring a pencil",
    });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ changedDates: 2, series: { location: "Eastern Market Brewing Co.", timeOfDay: "20:00", place: { placeId: place.placeId } } });

    const local = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const e1 = (await a.json("GET", `${base}/events/${first.id}`)).data.event;
    const e2 = (await a.json("GET", `${base}/events/${second.id}`)).data.event;
    expect(e1).toMatchObject({ location: "Eastern Market Brewing Co.", description: "Bring a pencil", place: { placeId: place.placeId } });
    expect(local(e1.startsAt)).toBe("8:00 PM");
    expect(e2).toMatchObject({ location: "Jeff's garage", place: null, description: "Bring a pencil" });
    expect(local(e2.startsAt)).toBe("8:00 PM");
  });
});

describe("partial edits keep untouched fields", () => {
  it("doesn't blank descriptions when cancelling, archiving or toggling settings", async () => {
    const a = await TestUser.create();
    const created = await a.json("POST", "/api/leagues", { name: "Keepers", description: "Weekend hangs" });
    const id = created.data.league.id;
    const off = await a.json("PATCH", `/api/leagues/${id}`, { commissionerEnabled: false });
    expect(off.data.league.description).toBe("Weekend hangs");

    const idea = await a.json("POST", `/api/leagues/${id}/ideas`, { title: "Golf", category: "Outdoors", description: "Nine holes", aiSuggested: true });
    const archived = await a.json("PATCH", `/api/leagues/${id}/ideas/${idea.data.idea.id}`, { archived: true });
    expect(archived.data.idea).toMatchObject({ description: "Nine holes", aiSuggested: true, archived: true });

    const ev = await a.json("POST", `/api/leagues/${id}/events`, {
      title: "Poker", category: "Games & Trivia", description: "Bring chips", location: "Garage", url: "https://example.com/x",
      startsAt: inDays(3).toISOString(),
    });
    const cancelled = await a.json("PATCH", `/api/leagues/${id}/events/${ev.data.event.id}`, { cancelled: true });
    expect(cancelled.data.event).toMatchObject({ cancelled: true, description: "Bring chips", location: "Garage", url: "https://example.com/x" });
  });
});
