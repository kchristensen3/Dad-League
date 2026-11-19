import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Lightbulb, MessageCircle, Newspaper, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { ApiError, api } from "../api";
import { Logo } from "../components/Brand";
import { Avatar, Spinner, cx } from "../components/ui";
import { rememberLeague, useLeague, useLeagueId, useLeagueStream, useMe } from "../hooks";

const TABS = [
  { to: "", label: "Home", icon: CalendarDays, end: true },
  { to: "ideas", label: "Ideas", icon: Lightbulb },
  { to: "board", label: "Board", icon: Newspaper },
  { to: "chat", label: "Chat", icon: MessageCircle },
  { to: "league", label: "League", icon: Users },
];

function LeagueSwitcher({ currentId, name }: { currentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: api.leagues });
  const navigate = useNavigate();
  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-slate-100"
        aria-expanded={open}
      >
        <span className="truncate text-base font-black tracking-tight">{name}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-64 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
            {leagues.data?.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/l/${l.id}`);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="flex-1 truncate font-medium">{l.name}</span>
                {l.id === currentId && <Check size={16} className="text-brand-500" />}
              </button>
            ))}
            <Link
              to="/leagues"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-slate-50"
            >
              <Plus size={16} /> Join or create a league
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function LeagueLayout() {
  const leagueId = useLeagueId();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  useLeagueStream(leagueId);
  useEffect(() => rememberLeague(leagueId), [leagueId]);

  if (league.isLoading) return <Spinner className="pt-32" />;
  if (league.error) {
    const missing = league.error instanceof ApiError && league.error.status === 404;
    return (
      <div className="mx-auto max-w-sm space-y-3 px-4 pt-32 text-center">
        <p className="font-semibold">{missing ? "That league doesn't exist or you're not in it." : league.error.message}</p>
        <Link to="/leagues" className="font-semibold text-brand-600">See your leagues</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
          <Link to="/leagues" aria-label="All leagues"><Logo size={32} /></Link>
          <LeagueSwitcher currentId={leagueId} name={league.data!.name} />
          <Link to="/me" className="ml-auto rounded-full" aria-label="Your profile">
            {me && <Avatar user={me} size={34} />}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-28 pt-4 sm:px-4">
        <Outlet />
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to ? `/l/${leagueId}/${to}` : `/l/${leagueId}`}
              end={end}
              className={({ isActive }) =>
                cx(
                  "flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-semibold transition",
                  isActive ? "text-brand-600" : "text-slate-400 hover:text-slate-600",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx("rounded-full px-4 py-1 transition", isActive && "bg-brand-100")}>
                    <Icon size={20} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
