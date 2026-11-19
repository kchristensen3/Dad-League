import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { CalendarPlus, Flame, History } from "lucide-react";
import { useState } from "react";
import type { EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { EventCard } from "../components/EventCard";
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

      {topIdea && scope === "upcoming" && (
        <Card className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-white">
          <Flame className="shrink-0 text-accent-500" />
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
            className={cx("flex-1 rounded-lg py-1.5 capitalize transition", scope === s ? "bg-white shadow-sm" : "text-slate-500")}
          >
            {s}
          </button>
        ))}
      </div>

      {events.isLoading ? (
        <Spinner />
      ) : events.data?.length ? (
        scope === "upcoming" ? (
          group(events.data).map((g) => (
            <section key={g.label} className="space-y-2">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">{g.label}</h2>
              {g.items.map((e) => (
                <EventCard key={e.id} leagueId={leagueId} event={e} />
              ))}
            </section>
          ))
        ) : (
          <div className="space-y-2">
            {events.data.map((e) => (
              <EventCard key={e.id} leagueId={leagueId} event={e} past />
            ))}
          </div>
        )
      ) : scope === "upcoming" ? (
        <Empty icon={<CalendarPlus size={36} />} title="Nothing on the calendar">
          Be the guy who makes it happen.{" "}
          <button className="font-semibold text-brand-600" onClick={() => setPlanning({})}>
            Plan something
          </button>
        </Empty>
      ) : (
        <Empty icon={<History size={36} />} title="No past events yet" />
      )}

      {planning && <EventForm leagueId={leagueId} open onClose={() => setPlanning(null)} draft={planning} />}
    </div>
  );
}
