import { describe, expect, it } from "vitest";
import { buildPrompt } from "../lib/ai.js";
import { isPrivateAddress, parseMeta } from "../lib/linkPreview.js";
import { safeReturnTo } from "../routes/auth.js";
import { normalizeCode } from "../routes/leagues.js";

describe("link previews", () => {
  it("blocks private and loopback addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("extracts Open Graph tags in either attribute order", () => {
    const html = `<html><head><title>Fallback</title>
      <meta content="Tigers Win" property="og:title">
      <meta property="og:description" content="A &amp; B">
      <meta property="og:image" content="/img.png"></head>`;
    expect(parseMeta(html, "https://example.com/a")).toEqual({
      url: "https://example.com/a",
      title: "Tigers Win",
      description: "A & B",
      image: "https://example.com/img.png",
    });
  });
});

describe("misc", () => {
  it("only allows relative returnTo paths", () => {
    expect(safeReturnTo("/join/ABC")).toBe("/join/ABC");
    expect(safeReturnTo("//evil.com")).toBe("/");
    expect(safeReturnTo("https://evil.com")).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
  });

  it("normalizes invite codes", () => {
    expect(normalizeCode(" det-dads ")).toBe("DETDADS");
  });

  it("builds an AI prompt from league context", () => {
    const prompt = buildPrompt({
      leagueName: "Detroit Dads",
      leagueDescription: "",
      members: [
        { location: "Ferndale, MI", availability: "Thursday nights", interests: ["golf"] },
        { location: "Ferndale, MI", availability: null, interests: ["golf", "tigers"] },
      ],
      existingIdeas: ["Trivia night"],
    });
    expect(prompt).toContain("Where members live: Ferndale, MI\n");
    expect(prompt).toContain("Member interests: golf, tigers");
    expect(prompt).toContain("Trivia night");
  });
});
