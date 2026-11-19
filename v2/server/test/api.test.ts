import { afterAll, describe, expect, it } from "vitest";
import { sql } from "../db/client.js";
import { TestUser, anonymous, leagueWith } from "./helpers.js";

afterAll(() => sql.end());

describe("auth", () => {
  it("reports signed-out state without erroring", async () => {
    const res = await anonymous("GET", "/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("signs in, reads profile, signs out", async () => {
    const u = await TestUser.create("Jeff");
    const me = await u.json("GET", "/api/me");
    expect(me.data.user.name).toBe("Jeff");
    await u.req("POST", "/auth/logout");
    expect((await u.json("GET", "/api/me")).data.user).toBeNull();
  });

  it("rejects protected routes without a session", async () => {
    expect((await anonymous("GET", "/api/leagues")).status).toBe(401);
  });

  it("blocks cross-origin writes", async () => {
    const u = await TestUser.create();
    const res = await u.req("POST", "/api/leagues", { name: "x" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("leagues", () => {
  it("creates, previews invite, joins, and lists members", async () => {
    const owner = await TestUser.create("Owner");
    const friend = await TestUser.create("Friend");
    const created = await owner.json("POST", "/api/leagues", { name: "Detroit Dads" });
    expect(created.status).toBe(201);
    expect(created.data.league.role).toBe("owner");
    const code: string = created.data.league.inviteCode;

    const preview = await anonymous("GET", `/api/invites/${code.toLowerCase()}`);
    expect((await preview.json()).invite).toMatchObject({ name: "Detroit Dads", memberCount: 1 });

    const joined = await friend.json("POST", "/api/leagues/join", { code: ` ${code.toLowerCase()} ` });
    expect(joined.data).toMatchObject({ alreadyMember: false, league: { role: "member", memberCount: 2 } });
    const again = await friend.json("POST", "/api/leagues/join", { code });
    expect(again.data.alreadyMember).toBe(true);

    const members = await friend.json("GET", `/api/leagues/${created.data.league.id}/members`);
    expect(members.data.members.map((m: any) => m.name)).toEqual(["Owner", "Friend"]);
  });

  it("hides leagues from non-members", async () => {
    const owner = await TestUser.create();
    const stranger = await TestUser.create();
    const league = await leagueWith(owner);
    expect((await stranger.req("GET", `/api/leagues/${league.id}`)).status).toBe(404);
    expect((await stranger.req("GET", `/api/leagues/${league.id}/ideas`)).status).toBe(404);
    expect((await stranger.req("GET", `/api/leagues/not-a-uuid/ideas`)).status).toBe(404);
  });

  it("only lets the owner rotate codes, and owners can't just leave", async () => {
    const owner = await TestUser.create();
    const member = await TestUser.create();
    const league = await leagueWith(owner, member);
    expect((await member.req("POST", `/api/leagues/${league.id}/invite-code`)).status).toBe(403);
    const rotated = await owner.json("POST", `/api/leagues/${league.id}/invite-code`);
    expect(rotated.data.league.inviteCode).not.toBe(league.inviteCode);

    const ownerMe = await owner.json("GET", "/api/me");
    expect((await owner.req("DELETE", `/api/leagues/${league.id}/members/${ownerMe.data.user.id}`)).status).toBe(409);

    const memberMe = await member.json("GET", "/api/me");
    await owner.json("POST", `/api/leagues/${league.id}/owner`, { userId: memberMe.data.user.id });
    expect((await owner.req("DELETE", `/api/leagues/${league.id}/members/${ownerMe.data.user.id}`)).status).toBe(200);
    expect((await member.json("GET", `/api/leagues/${league.id}`)).data.league.role).toBe("owner");
  });
});

describe("ideas", () => {
  it("auto-votes for the author, sorts by votes, archives", async () => {
    const a = await TestUser.create("A");
    const b = await TestUser.create("B");
    const league = await leagueWith(a, b);
    const base = `/api/leagues/${league.id}/ideas`;
    const golf = await a.json("POST", base, { title: "Golf", category: "Sports & Fitness" });
    expect(golf.data.idea).toMatchObject({ voteCount: 1, votedByMe: true });
    const trivia = await a.json("POST", base, { title: "Trivia", category: "Games & Trivia" });
    await b.req("PUT", `${base}/${trivia.data.idea.id}/vote`);
    await b.req("PUT", `${base}/${trivia.data.idea.id}/vote`); // idempotent

    const list = await b.json("GET", base);
    expect(list.data.ideas.map((i: any) => [i.title, i.voteCount, i.votedByMe])).toEqual([
      ["Trivia", 2, true],
      ["Golf", 1, false],
    ]);

    expect((await b.req("PATCH", `${base}/${golf.data.idea.id}`, { archived: true })).status).toBe(403);
    await a.req("PATCH", `${base}/${golf.data.idea.id}`, { archived: true });
    expect((await a.json("GET", base)).data.ideas).toHaveLength(1);
    expect((await a.json("GET", `${base}?archived=true`)).data.ideas[0].title).toBe("Golf");
  });

  it("validates input", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    const res = await a.json("POST", `/api/leagues/${league.id}/ideas`, { title: "", category: "Nope" });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/title|category/);
  });

  it("returns 503 for suggestions when no API key is configured", async () => {
    const a = await TestUser.create();
    const league = await leagueWith(a);
    const res = await a.json("POST", `/api/leagues/${league.id}/ideas/suggest`, {});
    expect(res.status).toBe(503);
  });
});

describe("events", () => {
  it("plans from an idea, RSVPs, cancels, and splits upcoming/past", async () => {
    const host = await TestUser.create("Host");
    const guest = await TestUser.create("Guest");
    const league = await leagueWith(host, guest);
    const base = `/api/leagues/${league.id}/events`;
    const idea = await host.json("POST", `/api/leagues/${league.id}/ideas`, { title: "Tigers game", category: "Watch a Game" });
    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const created = await host.json("POST", base, {
      title: "Tigers game",
      category: "Watch a Game",
      startsAt,
      ideaId: idea.data.idea.id,
      location: "Comerica Park",
    });
    expect(created.status).toBe(201);
    expect(created.data.event).toMatchObject({ myRsvp: "going", going: [{ name: "Host" }] });
    const id = created.data.event.id;

    const rsvp = await guest.json("PUT", `${base}/${id}/rsvp`, { status: "not_going" });
    expect(rsvp.data.event).toMatchObject({ myRsvp: "not_going", notGoing: [{ name: "Guest" }] });
    await guest.json("PUT", `${base}/${id}/rsvp`, { status: "going" });
    expect((await guest.json("GET", `${base}/${id}`)).data.event.going).toHaveLength(2);

    expect((await guest.req("PATCH", `${base}/${id}`, { cancelled: true })).status).toBe(403);
    expect((await host.json("PATCH", `${base}/${id}`, { cancelled: true })).data.event.cancelled).toBe(true);

    await host.json("POST", base, {
      title: "Last week",
      category: "Casual Hangout",
      startsAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    });
    expect((await host.json("GET", base)).data.events.map((e: any) => e.title)).toEqual(["Tigers game"]);
    expect((await host.json("GET", `${base}?scope=past`)).data.events.map((e: any) => e.title)).toEqual(["Last week"]);
  });

  it("rejects an idea from another league", async () => {
    const a = await TestUser.create();
    const l1 = await leagueWith(a);
    const l2 = await leagueWith(a);
    const idea = await a.json("POST", `/api/leagues/${l1.id}/ideas`, { title: "x", category: "Outdoors" });
    const res = await a.req("POST", `/api/leagues/${l2.id}/events`, {
      title: "x",
      category: "Outdoors",
      startsAt: new Date().toISOString(),
      ideaId: idea.data.idea.id,
    });
    expect(res.status).toBe(400);
  });
});

describe("board and chat", () => {
  it("posts, likes, comments", async () => {
    const a = await TestUser.create("A");
    const b = await TestUser.create("B");
    const league = await leagueWith(a, b);
    const base = `/api/leagues/${league.id}/posts`;
    const post = await a.json("POST", base, { title: "Anyone have a tile saw?", body: "Need it Saturday" });
    const id = post.data.post.id;
    await b.req("PUT", `${base}/${id}/like`);
    await b.json("POST", `${base}/${id}/comments`, { body: "Yep, come grab it" });
    const list = await a.json("GET", base);
    expect(list.data.posts[0]).toMatchObject({ likeCount: 1, likedByMe: false, commentCount: 1 });
    const comments = await a.json("GET", `${base}/${id}/comments`);
    expect(comments.data.comments[0]).toMatchObject({ body: "Yep, come grab it", author: { name: "B" } });
    expect((await b.req("DELETE", `${base}/${id}`)).status).toBe(403);
  });

  it("keeps general chat and event threads separate", async () => {
    const a = await TestUser.create("A");
    const league = await leagueWith(a);
    const ev = await a.json("POST", `/api/leagues/${league.id}/events`, {
      title: "Bowling",
      category: "Games & Trivia",
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const base = `/api/leagues/${league.id}/messages`;
    await a.json("POST", base, { body: "hey all" });
    await a.json("POST", base, { body: "I'll bring shoes", eventId: ev.data.event.id });
    expect((await a.json("GET", base)).data.messages.map((m: any) => m.body)).toEqual(["hey all"]);
    expect((await a.json("GET", `${base}?eventId=${ev.data.event.id}`)).data.messages.map((m: any) => m.body)).toEqual([
      "I'll bring shoes",
    ]);
    expect((await a.json("GET", `/api/leagues/${league.id}/events/${ev.data.event.id}`)).data.event.messageCount).toBe(1);
  });
});

describe("account deletion", () => {
  it("hands owned leagues to the next member", async () => {
    const owner = await TestUser.create();
    const member = await TestUser.create();
    const league = await leagueWith(owner, member);
    expect((await owner.req("DELETE", "/api/me")).status).toBe(200);
    const after = await member.json("GET", `/api/leagues/${league.id}`);
    expect(after.data.league).toMatchObject({ role: "owner", memberCount: 1 });
  });
});
