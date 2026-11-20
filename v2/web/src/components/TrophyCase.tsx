import { motion } from "motion/react";
import type { Member } from "../../../shared/schemas";
import { Avatar, cx } from "./ui";

interface Trophy {
  id: string;
  title: string;
  emoji: string;
  description: string;
  stat: (s: Member["stats"]) => number;
  unit: (n: number) => string;
  colors: string;
}

/** Same five honors as the original Dad League, awarded live from league activity. */
const TROPHIES: Trophy[] = [
  {
    id: "ironman",
    title: "Ironman",
    emoji: "⚡",
    description: "Never misses a meetup or outing",
    stat: (s) => s.eventsAttended,
    unit: (n) => `${n} ${n === 1 ? "event" : "events"} attended`,
    colors: "from-emerald-100 to-teal-50 ring-emerald-200",
  },
  {
    id: "head-coach",
    title: "Head Coach",
    emoji: "👑",
    description: "Stepping up to rally the crew and host",
    stat: (s) => s.eventsHosted,
    unit: (n) => `${n} ${n === 1 ? "event" : "events"} organized`,
    colors: "from-rose-100 to-pink-50 ring-rose-200",
  },
  {
    id: "idea-machine",
    title: "Idea Machine",
    emoji: "💡",
    description: "Always bringing new activities to the table",
    stat: (s) => s.ideasProposed,
    unit: (n) => `${n} ${n === 1 ? "idea" : "ideas"} contributed`,
    colors: "from-sky-100 to-indigo-50 ring-sky-200",
  },
  {
    id: "gift-of-gab",
    title: "Gift of Gab",
    emoji: "🎙️",
    description: "Most active chatter keeping the guys engaged",
    stat: (s) => s.messagesSent,
    unit: (n) => `${n} chat ${n === 1 ? "message" : "messages"}`,
    colors: "from-amber-100 to-orange-50 ring-amber-200",
  },
  {
    id: "non-committal",
    title: "The Non-Committal",
    emoji: "🤷‍♂️",
    description: 'Champion of "let me check with the boss"',
    stat: (s) => s.eventsDeclined,
    unit: (n) => `${n} ${n === 1 ? "time" : "times"} passed`,
    colors: "from-violet-100 to-purple-50 ring-violet-200",
  },
];

function winnerOf(members: Member[], t: Trophy) {
  let best: Member | null = null;
  for (const m of members) if (t.stat(m.stats) > 0 && (!best || t.stat(m.stats) > t.stat(best.stats))) best = m;
  return best;
}

export function TrophyCase({ members }: { members: Member[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <h2 className="text-lg font-black uppercase tracking-tight">🏆 Trophy Case</h2>
        <p className="text-xs text-slate-400">Live, from league activity</p>
      </div>
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {TROPHIES.map((t, i) => {
          const winner = winnerOf(members, t);
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, rotateY: -30, y: 12 }}
              whileInView={{ opacity: 1, rotateY: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, type: "spring", damping: 18 }}
              whileHover={{ y: -3 }}
              className={cx(
                "relative w-56 shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br p-4 ring-1 sm:w-auto",
                t.colors,
              )}
            >
              <motion.div
                className="text-3xl"
                animate={winner ? { rotate: [0, -10, 10, 0] } : undefined}
                transition={{ delay: 0.6 + i * 0.1, duration: 0.6 }}
              >
                {t.emoji}
              </motion.div>
              <p className="mt-2 font-black uppercase tracking-tight text-slate-800">{t.title}</p>
              <p className="text-xs text-slate-500">{t.description}</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 p-2">
                {winner ? (
                  <>
                    <Avatar user={winner} size={28} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{winner.name}</p>
                      <p className="text-[11px] text-slate-500">{t.unit(t.stat(winner.stats))}</p>
                    </div>
                  </>
                ) : (
                  <p className="px-1 text-sm font-semibold text-slate-400">Up for grabs</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
