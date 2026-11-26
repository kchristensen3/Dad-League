import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import type { EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { Sheet } from "./ui";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Google Calendar's "add event" page, prefilled. */
export function googleCalendarUrl(e: EventItem, detailsUrl: string) {
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + 2 * 3600_000);
  const where = e.place?.address ? `${e.location ?? ""}, ${e.place.address}`.replace(/^, /, "") : (e.location ?? "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [e.description, e.url, `Details and RSVPs: ${detailsUrl}`].filter(Boolean).join("\n\n"),
    location: where,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * "Add to calendar". The .ics file comes from the server (with the member's private calendar token)
 * because phones open it outside the app: iOS Safari and home-screen apps ignore downloads of
 * in-page data: links, which is why the old button did nothing on iPhones.
 */
export function AddToCalendar({ leagueId, event }: { leagueId: string; event: EventItem }) {
  const [open, setOpen] = useState(false);
  const token = useQuery({ queryKey: ["calendar-token"], queryFn: api.calendarToken, staleTime: Infinity, enabled: open });
  const origin = window.location.origin;
  const icsUrl = token.data ? `${origin}/cal/${token.data}/events/${event.id}.ics` : undefined;
  const detailsUrl = `${origin}/l/${leagueId}/events/${event.id}`;
  const option = "flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 font-semibold hover:border-brand-300 hover:bg-brand-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-600"
      >
        <CalendarPlus size={16} /> Add to calendar
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add to your calendar">
        <div className="space-y-2">
          <a
            href={icsUrl}
            aria-disabled={!icsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => (icsUrl ? setOpen(false) : ev.preventDefault())}
            className={`${option} ${icsUrl ? "" : "pointer-events-none opacity-60"}`}
          >
            <span className="text-xl">🍎</span>
            <span className="flex-1">
              Apple, Outlook or other
              <span className="block text-xs font-normal text-slate-500">Opens a calendar file your phone or computer can add</span>
            </span>
          </a>
          <a href={googleCalendarUrl(event, detailsUrl)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={option}>
            <span className="text-xl">📆</span>
            <span className="flex-1">
              Google Calendar
              <span className="block text-xs font-normal text-slate-500">Opens Google Calendar with the details filled in</span>
            </span>
          </a>
          {token.error && <p className="text-sm text-rose-600">Couldn't make the calendar file. Try again in a moment.</p>}
        </div>
      </Sheet>
    </>
  );
}
