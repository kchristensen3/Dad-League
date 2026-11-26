/**
 * iCalendar (.ics) output (RFC 5545). Times are written in UTC, so calendar apps show them in the
 * viewer's own zone. Lines are CRLF-terminated and folded at 75 octets, as the spec requires.
 */
export interface IcsEvent {
  uid: string;
  title: string;
  startsAt: Date;
  durationMinutes?: number;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  cancelled?: boolean;
  updatedAt?: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line to 75 octets, never splitting a multi-byte character. */
export function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], calendarName = "Dad League"): string {
  const now = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dad League//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(calendarName)}`];
  for (const e of events) {
    const end = new Date(e.startsAt.getTime() + (e.durationMinutes ?? 120) * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@dadleague`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(e.cancelled ? `Cancelled: ${e.title}` : e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    const description = [e.description, e.url ? `Link: ${e.url}` : null].filter(Boolean).join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.cancelled) lines.push("STATUS:CANCELLED");
    if (e.updatedAt) lines.push(`LAST-MODIFIED:${stamp(e.updatedAt)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
