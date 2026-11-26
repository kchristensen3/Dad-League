import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CATEGORIES, type Category, type EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { CATEGORY_STYLE, listItem } from "../fx";
import { EventCard } from "./EventCard";
import { Spinner, cx } from "./ui";

/** Heat: the more dads in, the stronger the color. */
function heat(going: number) {
  if (going >= 5) return "opacity-100";
  if (going >= 3) return "opacity-80";
  if (going >= 1) return "opacity-60";
  return "opacity-35";
}

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * A month calendar where each day is tinted with the color of its event's category (the same colors
 * as the date tiles), stronger the more people are in. Tap a day to see its events below.
 */
export function CalendarView({ leagueId }: { leagueId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => new Date());
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 7);
  const events = useQuery({
    queryKey: ["events", leagueId, "calendar", dayKey(month)],
    queryFn: () => api.eventsBetween(leagueId, gridStart, gridEnd),
    placeholderData: (prev) => prev,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events.data ?? []) {
      const key = dayKey(new Date(e.startsAt));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events.data]);

  const days: Date[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push(d);
  const today = new Date();
  const selectedEvents = byDay.get(dayKey(selected)) ?? [];
  const usedCategories = CATEGORIES.filter((c) => (events.data ?? []).some((e) => e.category === c));
  const monthCount = (events.data ?? []).filter((e) => !e.cancelled && isSameMonth(new Date(e.startsAt), month)).length;

  const go = (n: number) => {
    const next = addMonths(month, n);
    setMonth(next);
    setSelected(isSameMonth(today, next) ? today : next);
  };

  return (
    <div className="space-y-4">
      <section aria-label="Calendar" className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
        <div className="mb-2 flex items-center justify-between px-1">
          <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <h2 className="font-black tracking-tight">{format(month, "MMMM yyyy")}</h2>
            <p className="text-xs text-slate-500">
              {events.isLoading ? " " : monthCount === 0 ? "Nothing planned" : `${monthCount} ${monthCount === 1 ? "meetup" : "meetups"}`}
            </p>
          </div>
          <button type="button" aria-label="Next month" onClick={() => go(1)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const list = (byDay.get(dayKey(d)) ?? []).filter((e) => !e.cancelled);
            const cancelledOnly = !list.length && (byDay.get(dayKey(d))?.length ?? 0) > 0;
            // The day takes the color of its biggest meetup; other meetups show as dots.
            const top = [...list].sort((a, b) => b.going.length - a.going.length)[0];
            const style = top ? CATEGORY_STYLE[top.category] : undefined;
            const isSelected = isSameDay(d, selected);
            const inMonth = isSameMonth(d, month);
            const label = `${format(d, "EEEE, MMMM d")}: ${
              list.length ? list.map((e) => `${e.title} (${e.going.length} in)`).join(", ") : "nothing planned"
            }`;
            return (
              <button
                key={d.toISOString()}
                type="button"
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => setSelected(d)}
                className={cx(
                  "relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl text-sm font-bold transition",
                  !inMonth && "opacity-40",
                  top ? "text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100",
                  isSelected && "ring-2 ring-slate-900 ring-offset-1",
                )}
              >
                {style && top && (
                  <motion.span
                    aria-hidden
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    className={cx("absolute inset-0 bg-gradient-to-br", style.tile, heat(top.going.length))}
                  />
                )}
                <span className={cx("relative", isSameDay(d, today) && "rounded-full px-1.5 underline decoration-2 underline-offset-2")}>
                  {format(d, "d")}
                </span>
                {top && <span className="relative text-[11px] leading-none">{style!.emoji}</span>}
                {list.length > 1 && (
                  <span className="absolute right-1 top-1 flex gap-0.5">
                    {list
                      .filter((e) => e !== top)
                      .slice(0, 2)
                      .map((e) => (
                        <span key={e.id} className={cx("h-1.5 w-1.5 rounded-full bg-gradient-to-br ring-1 ring-white", CATEGORY_STYLE[e.category].tile)} />
                      ))}
                  </span>
                )}
                {cancelledOnly && <span className="relative text-[10px] font-semibold text-slate-400 line-through">off</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-2 border-t border-slate-100 px-1 pt-3">
          {usedCategories.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {usedCategories.map((c: Category) => (
                <li key={c} className="flex items-center gap-1">
                  <span className={cx("h-2.5 w-2.5 rounded-full bg-gradient-to-br", CATEGORY_STYLE[c].tile)} /> {c}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Fewer in</span>
            {[0, 1, 3, 5].map((n) => (
              <span key={n} className={cx("h-3 w-5 rounded bg-gradient-to-br from-brand-400 to-brand-600", heat(n))} />
            ))}
            <span>More in</span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
          {isSameDay(selected, today) ? "Today" : format(selected, "EEEE, MMMM d")}
        </h2>
        {events.isLoading ? (
          <Spinner />
        ) : selectedEvents.length ? (
          <AnimatePresence mode="popLayout">
            {selectedEvents.map((e, i) => (
              <motion.div key={e.id} {...listItem(i)}>
                <EventCard leagueId={leagueId} event={e} past={new Date(e.startsAt) < today} />
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-5 text-center text-sm text-slate-500 ring-1 ring-slate-200/70">
            Nothing that day. Tap a colored day to see what's planned.
          </p>
        )}
      </section>
    </div>
  );
}
