import { describe, expect, it } from "vitest";
import { describeRule, formatWhen, localWeekdayHour, nextOccurrences, toInstant, todayIn } from "../lib/recurrence.js";

describe("recurrence", () => {
  it("finds the first Thursday of each month", () => {
    expect(nextOccurrences({ freq: "monthly", weekday: 4, nth: 1 }, "2026-11-20", null, 3, "2027-12-31")).toEqual([
      "2026-12-03",
      "2027-01-07",
      "2027-02-04",
    ]);
  });

  it("handles 'last Friday' including months with five Fridays", () => {
    expect(nextOccurrences({ freq: "monthly", weekday: 5, nth: 5 }, "2027-01-01", null, 3, "2027-12-31")).toEqual([
      "2027-01-29",
      "2027-02-26",
      "2027-03-26",
    ]);
  });

  it("continues after the last generated date without repeating it", () => {
    expect(nextOccurrences({ freq: "weekly", weekday: 2 }, "2026-11-01", "2026-11-24", 2, "2027-12-31")).toEqual([
      "2026-12-01",
      "2026-12-08",
    ]);
  });

  it("keeps every-other-week parity anchored to the start date", () => {
    const rule = { freq: "biweekly" as const, weekday: 6 };
    expect(nextOccurrences(rule, "2026-11-21", null, 2, "2027-12-31")).toEqual(["2026-11-21", "2026-12-05"]);
    expect(nextOccurrences(rule, "2026-11-21", "2026-12-05", 1, "2027-12-31")).toEqual(["2026-12-19"]);
    expect(nextOccurrences(rule, "2026-11-21", "2026-12-06", 1, "2027-12-31")).toEqual(["2026-12-19"]);
  });

  it("stops at the horizon", () => {
    expect(nextOccurrences({ freq: "weekly", weekday: 1 }, "2026-11-20", null, 10, "2026-12-01")).toEqual(["2026-11-23", "2026-11-30"]);
  });

  it("keeps the wall-clock time across daylight saving changes", () => {
    expect(toInstant("2026-10-29", "19:00", "America/Detroit").toISOString()).toBe("2026-10-29T23:00:00.000Z");
    expect(toInstant("2026-11-05", "19:00", "America/Detroit").toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });

  it("describes rules and formats local times", () => {
    expect(describeRule({ freq: "monthly", weekday: 4, nth: 1 })).toBe("First Thursday of the month");
    expect(describeRule({ freq: "biweekly", weekday: 0 })).toBe("Every other Sunday");
    expect(formatWhen(new Date("2026-12-04T00:00:00Z"), "America/Detroit")).toBe("Thu, Dec 3, 7:00 PM");
    expect(todayIn("America/Los_Angeles", new Date("2026-11-20T06:00:00Z"))).toBe("2026-11-19");
    expect(localWeekdayHour("America/Detroit", new Date("2026-11-23T14:30:00Z"))).toEqual({ weekday: 1, hour: 9 });
  });
});
