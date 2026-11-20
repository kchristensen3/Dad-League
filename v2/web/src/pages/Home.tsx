import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";
import { CalendarPlus, Flame, History, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { useState } from "react";
import type { EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { DateTile, EventCard, RsvpButtons } from "../components/EventCard";
import { AvatarStack } from "../components/ui";
import { listItem } from "../fx";
import { type EventDraft, EventForm } from "../components/EventForm";
import { Button, Card, Empty, Spinner, cx } from "../components/ui";
import { useDocumentTitle, useLeague, useLeagueId, useMe } from "../hooks";

function group(events: EventItem[]) {
  const groups: { label: string; items: EventItem[] }[] = [];
  for (const e of events) {
    const days = differenceInCalendarDays(new Date(e.startsAt), new Date());
    const label = days <= 0 ? "Today" : days < 7 ? "This week" : days < 31 ? "Coming up" : "Later";
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

function NextUp({ leagueId, event }: { leagueId: string; event: EventItem }) {
  const start = new Date(event.startsAt);
  const days = differenceInCalendarDays(start, new Date());
  const when = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${formatDistanceToNowStrict(start, { unit: "day" })}`;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 22 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-500/20"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent-400/30 blur-2xl"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex items-start gap-4">
        <DateTile event={event} size="lg" onColor />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-100">Next up · {when}</p>
          <Link to={`/l/${leagueId}/events/${event.id}`} className="block text-xl font-black leading-tight hover:underline">
            {event.title}
          </Link>
          {event.location && (
            <p className="flex items-center gap-1 truncate text-sm text-brand-100">
              <MapPin size={13} className="shrink-0" /> {event.location}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            {event.going.length > 0 && <AvatarStack users={event.going} max={5} />}
            <span className="text-sm font-semibold text-brand-50">
              {event.going.length === 0 ? "Be the first one in" : `${event.going.length} in`}
            </span>
          </div>
        </div>
      </div>
      <div className="relative mt-4 rounded-2xl bg-white/95 p-2">
        <RsvpButtons leagueId={leagueId} event={event} />
      </div>
    </motion.div>
  );
}

export default function Home() {
  const leagueId = useLeagueId();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  useDocumentTitle(league.data?.name ?? "");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [planning, setPlanning] = useState<EventDraft | null>(null);
  const events = useQuery({ queryKey: ["events", leagueId, scope], queryFn: () => api.events(leagueId, scope) });
  const ideas = useQuery({ queryKey: ["ideas", leagueId, false], queryFn: () => api.ideas(leagueId) });
  const topIdea = ideas.data?.[0];
  const needsReply = (events.data ?? []).filter((e) => scope === "upcoming" && !e.cancelled && !e.myRsvp).length;
  const next = scope === "upcoming" ? events.data?.find((e) => !e.cancelled) : undefined;
  const rest = (events.data ?? []).filter((e) => e !== next);

  return (
    <div className="space-y-5">
      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Hey {me?.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-slate-500">
            {needsReply > 0 ? `${needsReply} ${needsReply === 1 ? "plan needs" : "plans need"} your RSVP` : "What's the plan?"}
          </p>
        </div>
        <Button onClick={() => setPlanning({})}>
          <CalendarPlus size={16} /> Plan
        </Button>
      </section>

      {next && <NextUp leagueId={leagueId} event={next} />}

      {topIdea && scope === "upcoming" && (
        <Card className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-white">
          <motion.span
            animate={{ rotate: [-6, 6, -6], scale: [1, 1.1, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="shrink-0 text-accent-500"
          >
            <Flame />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Top idea · {topIdea.voteCount} votes</p>
            <p className="truncate font-bold">{topIdea.title}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setPlanning({
                title: topIdea.title,
                category: topIdea.category,
                description: topIdea.description,
                location: topIdea.location,
                ideaId: topIdea.id,
              })
            }
          >
            Schedule it
          </Button>
        </Card>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 text-sm font-semibold">
        {(["upcoming", "past"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cx("relative flex-1 rounded-lg py-1.5 capitalize transition", scope !== s && "text-slate-500")}
          >
            {scope === s && (
              <motion.span layoutId="home-scope" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: "spring", damping: 28, stiffness: 400 }} />
            )}
            <span className="relative">{s}</span>
          </button>
        ))}
      </div>

      {events.isLoading ? (
        <Spinner />
      ) : events.data?.length ? (
        scope === "upcoming" ? (
          rest.length > 0 &&
          group(rest).map((g) => (
            <section key={g.label} className="space-y-2">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                {next ? (g.label === "Today" || g.label === "This week" ? `Also ${g.label.toLowerCase()}` : g.label) : g.label}
              </h2>
              {g.items.map((e, i) => (
                <motion.div key={e.id} {...listItem(i)}>
                  <EventCard leagueId={leagueId} event={e} />
                </motion.div>
              ))}
            </section>
          ))
        ) : (
          <div className="space-y-2">
            {events.data.map((e, i) => (
              <motion.div key={e.id} {...listItem(i)}>
                <EventCard leagueId={leagueId} event={e} past />
              </motion.div>
            ))}
          </div>
        )
      ) : scope === "upcoming" ? (
        <Empty icon={<CalendarPlus size={30} />} title="Nothing on the calendar">
          Be the guy who makes it happen.{" "}
          <button className="font-semibold text-brand-600" onClick={() => setPlanning({})}>
            Plan something
          </button>
        </Empty>
      ) : (
        <Empty icon={<History size={30} />} title="No past events yet" />
      )}

      {planning && <EventForm leagueId={leagueId} open onClose={() => setPlanning(null)} draft={planning} />}
    </div>
  );
}
