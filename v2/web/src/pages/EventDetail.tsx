import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CalendarPlus, ExternalLink, MapPin, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { ChatThread } from "../components/ChatThread";
import { RsvpButtons, whenLabel } from "../components/EventCard";
import { EventForm } from "../components/EventForm";
import { Avatar, Card, ErrorNote, Pill, Spinner } from "../components/ui";
import { useDocumentTitle, useLeague, useLeagueId, useMe } from "../hooks";

/** Builds a one-event .ics file so people can add it to their own calendar. */
function icsHref(e: EventItem) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + 2 * 3600_000);
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dad League//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@dadleague`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    `DESCRIPTION:${esc([e.description, e.url].filter(Boolean).join("\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export default function EventDetail() {
  const leagueId = useLeagueId();
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const q = useQuery({ queryKey: ["event", leagueId, eventId], queryFn: () => api.event(leagueId, eventId) });
  useDocumentTitle(q.data?.title ?? "Event");

  const cancel = useMutation({
    mutationFn: (cancelled: boolean) => api.updateEvent(leagueId, eventId, { cancelled }),
    onSuccess: (e) => qc.setQueryData(["event", leagueId, eventId], e),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteEvent(leagueId, eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["events", leagueId] });
      navigate(`/l/${leagueId}`, { replace: true });
    },
  });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorNote error={q.error ?? "Event not found"} />;
  const e = q.data;
  const canEdit = e.host.id === me?.id || league.data?.role === "owner";
  const past = new Date(e.startsAt).getTime() < Date.now() - 6 * 3600_000;
  const mapsHref = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to={`/l/${leagueId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Calendar
        </Link>
        {canEdit && (
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="rounded-full p-2 text-slate-500 hover:bg-slate-200" aria-label="Event options">
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-40 w-48 rounded-2xl bg-white p-1 text-sm shadow-lg ring-1 ring-slate-200">
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => (setMenu(false), setEditing(true))}>
                    <Pencil size={16} /> Edit details
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => (setMenu(false), cancel.mutate(!e.cancelled))}>
                    <XCircle size={16} /> {e.cancelled ? "Un-cancel" : "Cancel event"}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setMenu(false);
                      if (confirm("Delete this event and its chat for everyone?")) remove.mutate();
                    }}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Card className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill>{e.category}</Pill>
            {e.cancelled && <Pill className="bg-red-50 text-red-600">Cancelled</Pill>}
          </div>
          <h1 className={`text-2xl font-black leading-tight ${e.cancelled ? "line-through opacity-60" : ""}`}>{e.title}</h1>
          <p className="font-semibold text-brand-600">{whenLabel(e.startsAt)}</p>
          <p className="text-xs text-slate-500">{format(new Date(e.startsAt), "EEEE, MMMM d, yyyy")}</p>
        </div>

        {(e.location || e.url) && (
          <div className="space-y-2 text-sm">
            {e.location && (
              <a href={mapsHref!} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-slate-700 hover:text-brand-600">
                <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" /> {e.location}
              </a>
            )}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-brand-600 hover:underline">
                <ExternalLink size={16} className="shrink-0" /> {new URL(e.url).hostname}
              </a>
            )}
          </div>
        )}

        {e.description && <p className="whitespace-pre-wrap text-sm text-slate-700">{e.description}</p>}

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Avatar user={e.host} size={24} /> Hosted by <span className="font-semibold text-slate-700">{e.host.name}</span>
        </div>

        {!e.cancelled && !past && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <RsvpButtons leagueId={leagueId} event={e} />
            <a href={icsHref(e)} download={`${e.title}.ics`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-600">
              <CalendarPlus size={16} /> Add to calendar
            </a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
          {([
            ["In", e.going],
            ["Out", e.notGoing],
          ] as const).map(([label, people]) => (
            <div key={label}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                {label} · {people.length}
              </p>
              <ul className="space-y-1.5">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <Avatar user={p} size={22} /> <span className="truncate">{p.name}</span>
                  </li>
                ))}
                {people.length === 0 && <li className="text-sm text-slate-400">Nobody yet</li>}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Event chat</h2>
        <ChatThread leagueId={leagueId} eventId={e.id} className="max-h-[60vh] min-h-64" />
      </section>

      {editing && <EventForm leagueId={leagueId} open existing={e} onClose={() => setEditing(false)} />}
    </div>
  );
}
