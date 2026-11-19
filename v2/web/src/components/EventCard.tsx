import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";
import { Check, MapPin, MessageCircle, X } from "lucide-react";
import { Link } from "react-router";
import type { EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { AvatarStack, Card, Pill, cx } from "./ui";

export function whenLabel(iso: string) {
  const d = new Date(iso);
  const day = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE, MMM d");
  return `${day} · ${format(d, "h:mm a")}`;
}

export function RsvpButtons({ leagueId, event, compact }: { leagueId: string; event: EventItem; compact?: boolean }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (status: "going" | "not_going" | null) => api.rsvp(leagueId, event.id, status),
    onSuccess: (updated) => {
      qc.setQueryData(["event", leagueId, event.id], updated);
      void qc.invalidateQueries({ queryKey: ["events", leagueId] });
    },
  });
  const pick = (s: "going" | "not_going") => m.mutate(event.myRsvp === s ? null : s);
  const base = cx("inline-flex items-center gap-1 rounded-xl font-semibold transition disabled:opacity-60", compact ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm");
  return (
    <div className="flex gap-2">
      <button
        disabled={m.isPending}
        onClick={() => pick("going")}
        className={cx(base, event.myRsvp === "going" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
      >
        <Check size={compact ? 14 : 16} /> {event.myRsvp === "going" ? "Going" : "I'm in"}
      </button>
      <button
        disabled={m.isPending}
        onClick={() => pick("not_going")}
        className={cx(base, event.myRsvp === "not_going" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
      >
        <X size={compact ? 14 : 16} /> {event.myRsvp === "not_going" ? "Out" : "Can't"}
      </button>
    </div>
  );
}

export function EventCard({ leagueId, event, past }: { leagueId: string; event: EventItem; past?: boolean }) {
  const d = new Date(event.startsAt);
  return (
    <Card className={cx("relative flex gap-3 transition hover:ring-brand-300", event.cancelled && "opacity-60")}>
        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-brand-50 py-1.5 text-brand-700">
          <span className="text-[10px] font-bold uppercase">{format(d, "MMM")}</span>
          <span className="text-xl font-black leading-none">{format(d, "d")}</span>
          <span className="text-[10px] font-semibold">{format(d, "EEE")}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <h3 className={cx("flex-1 font-bold leading-snug", event.cancelled && "line-through")}>
              {/* Stretched link: the whole card is clickable, while the RSVP buttons stay separate controls. */}
              <Link to={`/l/${leagueId}/events/${event.id}`} className="after:absolute after:inset-0 after:content-['']">
                {event.title}
              </Link>
            </h3>
            {event.cancelled && <Pill className="bg-red-50 text-red-600">Cancelled</Pill>}
          </div>
          <p className="text-xs text-slate-500">
            {format(d, "h:mm a")} · hosted by {event.host.name.split(" ")[0]}
          </p>
          {event.location && (
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin size={12} className="shrink-0" /> {event.location}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {event.going.length > 0 && <AvatarStack users={event.going} max={4} />}
              <span className="text-xs text-slate-500">{event.going.length} in</span>
              {event.messageCount > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-slate-400">
                  <MessageCircle size={12} /> {event.messageCount}
                </span>
              )}
            </div>
            {!past && !event.cancelled && (
              <div className="relative z-10">
                <RsvpButtons leagueId={leagueId} event={event} compact />
              </div>
            )}
          </div>
        </div>
      </Card>
  );
}
