/**
 * Calendar math for standing meetups. Dates are plain "YYYY-MM-DD" strings (calendar days,
 * no time zone); `toInstant` turns a day plus a wall-clock time into a real moment in the
 * series' time zone, so "7pm every Thursday" stays 7pm across daylight-saving changes.
 */
import { TZDate } from "@date-fns/tz";
import type { RepeatRule } from "../../shared/schemas.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["", "First", "Second", "Third", "Fourth", "Last"];

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** The nth (1-4) or last (5) given weekday of a month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  if (nth === 5) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = new Date(Date.UTC(year, month, 1));
  return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
}

/**
 * Up to `count` occurrence dates on or after `startsOn` and strictly after `after`,
 * never beyond `until`.
 */
export function nextOccurrences(rule: RepeatRule, startsOn: string, after: string | null, count: number, until: string): string[] {
  const start = parse(startsOn);
  const floor = after ? addDays(parse(after), 1) : start;
  const lowest = floor > start ? floor : start;
  const limit = parse(until);
  const out: string[] = [];

  if (rule.freq === "monthly") {
    let y = lowest.getUTCFullYear();
    let m = lowest.getUTCMonth();
    for (let i = 0; i < 240 && out.length < count; i++) {
      const d = nthWeekdayOfMonth(y, m, rule.weekday, rule.nth);
      if (d > limit) break;
      if (d >= lowest) out.push(fmt(d));
      if (++m === 12) (m = 0), y++;
    }
    return out;
  }

  // Weekly series are anchored on the first matching weekday on/after startsOn, so
  // "every other Thursday" keeps the same parity no matter when we generate.
  const step = rule.freq === "weekly" ? 7 : 14;
  const anchor = addDays(start, (rule.weekday - start.getUTCDay() + 7) % 7);
  const skip = lowest > anchor ? Math.ceil((lowest.getTime() - anchor.getTime()) / (step * 86_400_000)) : 0;
  for (let d = addDays(anchor, skip * step); d <= limit && out.length < count; d = addDays(d, step)) out.push(fmt(d));
  return out;
}

/** A calendar day + "HH:MM" in an IANA zone → the actual instant. */
export function toInstant(day: string, timeOfDay: string, timezone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const [hh, mm] = timeOfDay.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, timezone).getTime());
}

/** Today's calendar date in a zone. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function describeRule(rule: RepeatRule): string {
  const day = WEEKDAYS[rule.weekday]!;
  if (rule.freq === "weekly") return `Every ${day}`;
  if (rule.freq === "biweekly") return `Every other ${day}`;
  return `${ORDINALS[rule.nth]} ${day} of the month`;
}

/** "Thu, Dec 4 at 7:00 PM" in the given zone, for notifications written on the server. */
export function formatWhen(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/** Wall-clock weekday (0-6) and hour in a zone. */
export function localWeekdayHour(timezone: string, now = new Date()): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")!.value;
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour: Number(parts.find((p) => p.type === "hour")!.value) };
}
