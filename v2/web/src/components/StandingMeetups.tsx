import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pause, Play, Repeat, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import type { Series } from "../../../shared/schemas";
import { api } from "../api";
import { CATEGORY_STYLE } from "../fx";
import { useLeague, useMe } from "../hooks";
import { Avatar, AvatarStack, Card, cx } from "./ui";

function SeriesRow({ leagueId, s }: { leagueId: string; s: Series }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const canEdit = s.createdBy === me?.id || league.data?.role === "owner";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["series", leagueId] });
    void qc.invalidateQueries({ queryKey: ["events", leagueId] });
  };
  const toggle = useMutation({ mutationFn: () => api.updateSeries(leagueId, s.id, { paused: !s.paused }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deleteSeries(leagueId, s.id), onSuccess: refresh });
  return (
    <li className={cx("flex gap-3 py-3", s.paused && "opacity-60")}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl" aria-hidden>
        {CATEGORY_STYLE[s.category].emoji}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold leading-tight">{s.title}</p>
        <p className="flex items-center gap-1 text-xs font-semibold text-brand-600">
          <Repeat size={11} /> {s.label} · {format(new Date(`2000-01-01T${s.timeOfDay}`), "h:mm a")}
          {s.paused && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-slate-500">Paused</span>}
        </p>
        {s.nextEvent && !s.paused && (
          <Link to={`/l/${leagueId}/events/${s.nextEvent.id}`} className="block text-xs text-slate-500 hover:text-brand-600">
            Next: {format(new Date(s.nextEvent.startsAt), "EEE, MMM d")}
          </Link>
        )}
        <div className="flex items-center gap-2 pt-0.5 text-xs text-slate-500">
          {s.rotation.length > 1 ? (
            <>
              <AvatarStack users={s.rotation} max={6} />
              <span>
                take turns{s.nextHost && <> · up next: <span className="font-semibold text-slate-700">{s.nextHost.name.split(" ")[0]}</span></>}
              </span>
            </>
          ) : (
            s.nextHost && (
              <>
                <Avatar user={s.nextHost} size={20} /> {s.nextHost.name.split(" ")[0]} hosts
              </>
            )
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => toggle.mutate()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={s.paused ? "Resume" : "Pause"}
            title={s.paused ? "Resume" : "Pause"}
          >
            {s.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            onClick={() => confirm(`Stop "${s.title}"? Its upcoming dates come off the calendar; past ones stay.`) && remove.mutate()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Stop this standing meetup"
            title="Stop"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </li>
  );
}

export function StandingMeetups({ leagueId }: { leagueId: string }) {
  const q = useQuery({ queryKey: ["series", leagueId], queryFn: () => api.series(leagueId) });
  if (!q.data?.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Repeat size={13} /> Standing meetups
        </h2>
        <ul className="divide-y divide-slate-100">
          {q.data.map((s) => (
            <SeriesRow key={s.id} leagueId={leagueId} s={s} />
          ))}
        </ul>
      </Card>
    </motion.div>
  );
}
