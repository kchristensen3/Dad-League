import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "../db/client.js";
import { TestUser, leagueWith } from "./helpers.js";

afterAll(() => sql.end());
afterEach(() => vi.unstubAllGlobals());

const EMB = { placeId: "ChIJEasternMarketBrew01", address: "2515 Riopelle St, Detroit, MI 48207, USA", lat: 42.3478, lng: -83.0412 };

/** Records Google calls and answers like the Places API (New) and Static Maps API would. */
function fakeGoogle() {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = req.method === "POST" ? await req.text() : "";
    calls.push({ url: req.url, headers: req.headers, body: text ? JSON.parse(text) : null });
    if (req.url.endsWith("/places:autocomplete")) {
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: EMB.placeId,
              text: { text: "Eastern Market Brewing Co., Riopelle Street, Detroit, MI, USA" },
              structuredFormat: { mainText: { text: "Eastern Market Brewing Co." }, secondaryText: { text: "Riopelle Street, Detroit, MI, USA" } },
            },
          },
          { queryPrediction: { text: { text: "eastern market brewing hours" } } },
        ],
      });
    }
    if (req.url.includes("/places/")) {
      return Response.json({
        id: EMB.placeId,
        displayName: { text: "Eastern Market Brewing Co." },
        formattedAddress: EMB.address,
        location: { latitude: EMB.lat, longitude: EMB.lng },
      });
    }
    if (req.url.includes("/staticmap")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    return new Response("not found", { status: 404 });
  });
  return calls;
}

describe("map search", () => {
  it("suggests places, fetches details, and keeps the key server-side", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    const calls = fakeGoogle();
    const base = `/api/leagues/${league.id}/places`;

    expect((await a.json("GET", `${base}/autocomplete?q=E`)).data.suggestions).toEqual([]);
    expect(calls).toHaveLength(0);

    const res = await a.json("GET", `${base}/autocomplete?q=Eastern%20Market%20Brew&session=sess-12345678`);
    expect(res.data.suggestions).toEqual([{ placeId: EMB.placeId, name: "Eastern Market Brewing Co.", address: "Riopelle Street, Detroit, MI, USA" }]);
    expect(calls[0]!.headers.get("x-goog-api-key")).toBe("test-maps-key");
    expect(calls[0]!.body).toMatchObject({ input: "Eastern Market Brew", sessionToken: "sess-12345678" });
    expect(calls[0]!.body.locationBias).toBeUndefined();

    const details = await a.json("GET", `${base}/${EMB.placeId}?session=sess-12345678`);
    expect(details.data.place).toEqual({ ...EMB, name: "Eastern Market Brewing Co." });
    expect(calls[1]!.url).toContain("sessionToken=sess-12345678");
    expect(calls[1]!.headers.get("x-goog-fieldmask")).toBe("id,displayName,formattedAddress,location");
    expect(JSON.stringify(details.data)).not.toContain("test-maps-key");
  });

  it("biases later searches toward where the league already meets", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    const calls = fakeGoogle();
    await a.json("POST", `/api/leagues/${league.id}/events`, {
      title: "Trivia", category: "Games & Trivia", startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      location: "Eastern Market Brewing Co.", place: EMB,
    });
    await a.json("GET", `/api/leagues/${league.id}/places/autocomplete?q=Batch`);
    expect(calls.at(-1)!.body.locationBias.circle.center).toEqual({ latitude: EMB.lat, longitude: EMB.lng });
  });

  it("is members-only and reports Google failures plainly", async () => {
    const a = await TestUser.create();
    const stranger = await TestUser.create();
    const league = await leagueWith(a);
    fakeGoogle();
    expect((await stranger.req("GET", `/api/leagues/${league.id}/places/autocomplete?q=Eastern`)).status).toBe(404);
    vi.stubGlobal("fetch", async () => new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await a.req("GET", `/api/leagues/${league.id}/places/autocomplete?q=Eastern`)).status).toBe(502);
    expect(log.mock.calls.flat().join(" ")).toContain("PERMISSION_DENIED");
    log.mockRestore();
  });
});

describe("events with a picked place", () => {
  it("stores the place, serves a map, and clears it when the location is retyped", async () => {
    const a = await TestUser.create();
    const stranger = await TestUser.create();
    const league = await leagueWith(a);
    const calls = fakeGoogle();
    const created = await a.json("POST", `/api/leagues/${league.id}/events`, {
      title: "Trivia night", category: "Games & Trivia", startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      location: "Eastern Market Brewing Co.", place: EMB,
    });
    expect(created.data.event).toMatchObject({ location: "Eastern Market Brewing Co.", place: { placeId: EMB.placeId, address: EMB.address, lat: EMB.lat, lng: EMB.lng } });
    const id = created.data.event.id;

    const map = await a.req("GET", `/api/leagues/${league.id}/events/${id}/map`);
    expect(map.status).toBe(200);
    expect(map.headers.get("content-type")).toBe("image/png");
    expect(calls.at(-1)!.url).toContain(`center=${EMB.lat}%2C${EMB.lng}`);
    expect((await stranger.req("GET", `/api/leagues/${league.id}/events/${id}/map`)).status).toBe(404);

    const retyped = await a.json("PATCH", `/api/leagues/${league.id}/events/${id}`, { location: "Somebody's basement" });
    expect(retyped.data.event).toMatchObject({ location: "Somebody's basement", place: null });
    expect((await a.req("GET", `/api/leagues/${league.id}/events/${id}/map`)).status).toBe(404);

    const repicked = await a.json("PATCH", `/api/leagues/${league.id}/events/${id}`, { location: "Eastern Market Brewing Co.", place: EMB });
    expect(repicked.data.event.place.placeId).toBe(EMB.placeId);

    const bad = await a.json("POST", `/api/leagues/${league.id}/events`, {
      title: "x", category: "Outdoors", startsAt: new Date().toISOString(), place: { ...EMB, lat: 200 },
    });
    expect(bad.status).toBe(400);
  });

  it("carries the place onto every date of a standing meetup", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    await a.json("POST", `/api/leagues/${league.id}/series`, {
      title: "Trivia", category: "Games & Trivia", location: "Eastern Market Brewing Co.", place: EMB,
      rule: { freq: "weekly", weekday: 3 }, timeOfDay: "19:00", timezone: "America/Detroit",
      startsOn: new Date().toISOString().slice(0, 10), hostRotation: [],
    });
    const events = (await a.json("GET", `/api/leagues/${league.id}/events`)).data.events;
    expect(events).toHaveLength(2);
    expect(events.every((e: any) => e.place?.placeId === EMB.placeId)).toBe(true);
  });
});
