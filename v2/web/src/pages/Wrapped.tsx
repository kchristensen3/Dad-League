import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Share2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import type { Wrapped as WrappedData } from "../../../shared/schemas";
import { api } from "../api";
import { Spinner, cx } from "../components/ui";
import { CATEGORY_STYLE, celebrate } from "../fx";
import { useDocumentTitle, useLeagueId } from "../hooks";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SLIDE_MS = 6500;

function Big({ children, delay = 0.15 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.p
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: "spring", damping: 12, stiffness: 140 }}
      className="text-[5.5rem] font-black leading-none tracking-tighter sm:text-9xl"
    >
      {children}
    </motion.p>
  );
}

function Line({ children, delay = 0.4, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className={cx("text-xl font-bold leading-snug", className)}>
      {children}
    </motion.p>
  );
}

/** Animated count-up for the big numbers. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setN(to);
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <>{n}</>;
}

interface Slide {
  key: string;
  bg: string;
  body: ReactNode;
}

function buildSlides(w: WrappedData): Slide[] {
  const slides: Slide[] = [
    {
      key: "intro",
      bg: "from-slate-950 via-brand-900 to-brand-600",
      body: (
        <>
          <Line delay={0.1} className="text-sm font-black uppercase tracking-[0.3em] text-white/70">
            {w.leagueName}
          </Line>
          <Big>{w.year}</Big>
          <Line delay={0.5} className="text-3xl font-black uppercase">
            Season Wrapped
          </Line>
          <Line delay={0.9} className="text-base font-medium text-white/70">
            Tap to keep going →
          </Line>
        </>
      ),
    },
    {
      key: "meetups",
      bg: "from-brand-700 via-brand-500 to-sky-400",
      body:
        w.meetups > 0 ? (
          <>
            <Line delay={0.05}>You actually got together</Line>
            <Big>
              <CountUp to={w.meetups} />
            </Big>
            <Line>{w.meetups === 1 ? "time" : "times"} this season.</Line>
            <Line delay={0.8} className="text-base font-medium text-white/80">
              {w.dadsInvolved} {w.dadsInvolved === 1 ? "dad" : "dads"} showed up, for {w.totalRsvps} total "I'm in"s.
            </Line>
          </>
        ) : (
          <>
            <Big>0</Big>
            <Line>meetups so far. The season's young.</Line>
            <Line delay={0.8} className="text-base font-medium text-white/80">
              Put something on the calendar and this page fills itself in.
            </Line>
          </>
        ),
    },
  ];
  if (w.busiestMonth) {
    slides.push({
      key: "month",
      bg: "from-amber-500 via-orange-500 to-rose-500",
      body: (
        <>
          <Line delay={0.05}>Your busiest stretch was</Line>
          <motion.p
            initial={{ opacity: 0, rotate: -6, scale: 0.8 }}
            animate={{ opacity: 1, rotate: -3, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 10 }}
            className="inline-block rounded-2xl bg-white px-5 py-2 text-5xl font-black uppercase tracking-tight text-orange-600 sm:text-6xl"
          >
            {MONTHS[w.busiestMonth.month - 1]}
          </motion.p>
          <Line>
            with {w.busiestMonth.meetups} {w.busiestMonth.meetups === 1 ? "meetup" : "meetups"}.
          </Line>
        </>
      ),
    });
  }
  if (w.biggestEvent && w.biggestEvent.going > 1) {
    slides.push({
      key: "biggest",
      bg: "from-emerald-600 via-teal-500 to-cyan-500",
      body: (
        <>
          <Line delay={0.05}>The big one:</Line>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl font-black leading-tight tracking-tight"
          >
            {w.biggestEvent.title}
          </motion.p>
          <Line>{format(new Date(w.biggestEvent.startsAt), "MMMM d")}</Line>
          <Line delay={0.7} className="text-3xl font-black">
            {w.biggestEvent.going} dads in 🙌
          </Line>
        </>
      ),
    });
  }
  if (w.topCategory) {
    const style = CATEGORY_STYLE[w.topCategory.category];
    slides.push({
      key: "category",
      bg: "from-violet-700 via-indigo-600 to-brand-500",
      body: (
        <>
          <Line delay={0.05}>Your league's thing:</Line>
          <motion.p
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", damping: 8 }}
            className="text-8xl"
            aria-hidden
          >
            {style.emoji}
          </motion.p>
          <Line className="text-4xl font-black">{w.topCategory.category}</Line>
          <Line delay={0.7} className="text-base font-medium text-white/80">
            {w.topCategory.meetups === w.meetups ? "Every single one." : `${w.topCategory.meetups} of your ${w.meetups} meetups.`}
          </Line>
        </>
      ),
    });
  }
  const awards = [
    { title: "Ironman", emoji: "⚡", leader: w.leaders.ironman, unit: "showed up" },
    { title: "Head Coach", emoji: "👑", leader: w.leaders.headCoach, unit: "hosted" },
    { title: "Idea Machine", emoji: "💡", leader: w.leaders.ideaMachine, unit: "ideas" },
    { title: "Gift of Gab", emoji: "🎙️", leader: w.leaders.giftOfGab, unit: "messages" },
  ].filter((a) => a.leader);
  if (awards.length) {
    slides.push({
      key: "awards",
      bg: "from-slate-900 via-slate-800 to-amber-600",
      body: (
        <>
          <Line delay={0.05} className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">
            Season awards
          </Line>
          <div className="mt-2 w-full max-w-sm space-y-2.5">
            {awards.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.25, type: "spring", damping: 16 }}
                className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 text-left backdrop-blur"
              >
                <span className="text-3xl" aria-hidden>
                  {a.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-200">{a.title}</p>
                  <p className="truncate text-lg font-bold">{a.leader!.user.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black">{a.leader!.count}</p>
                  <p className="text-[10px] uppercase text-white/60">{a.unit}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      ),
    });
  }
  if (w.collage.length) {
    slides.push({
      key: "photos",
      bg: "from-rose-600 via-pink-600 to-orange-400",
      body: (
        <>
          <Line delay={0.05}>
            {w.photos} {w.photos === 1 ? "photo" : "photos"} worth keeping
          </Line>
          <div className="mt-3 grid w-full max-w-sm grid-cols-3 gap-1.5">
            {w.collage.map((p, i) => (
              <motion.img
                key={p.id}
                src={p.thumbUrl}
                alt=""
                initial={{ opacity: 0, scale: 0.5, rotate: (i % 2 ? 1 : -1) * 12 }}
                animate={{ opacity: 1, scale: 1, rotate: (i % 3) - 1 }}
                transition={{ delay: 0.2 + i * 0.08, type: "spring", damping: 12 }}
                className="aspect-square w-full rounded-xl object-cover shadow-lg ring-2 ring-white"
              />
            ))}
          </div>
        </>
      ),
    });
  }
  slides.push({
    key: "outro",
    bg: "from-brand-900 via-brand-700 to-accent-500",
    body: (
      <>
        <Line delay={0.05} className="text-3xl font-black uppercase leading-tight">
          Here's to next season.
        </Line>
        <div className="mt-4 grid w-full max-w-xs grid-cols-3 gap-2 text-center">
          {[
            [w.meetups, "meetups"],
            [w.ideasPitched, "ideas"],
            [w.messages, "messages"],
          ].map(([n, label], i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.12 }}
              className="rounded-2xl bg-white/10 py-3"
            >
              <p className="text-3xl font-black">{n}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/70">{label}</p>
            </motion.div>
          ))}
        </div>
      </>
    ),
  });
  return slides;
}

export default function Wrapped() {
  const leagueId = useLeagueId();
  const navigate = useNavigate();
  useDocumentTitle("Season Wrapped");
  const q = useQuery({ queryKey: ["wrapped", leagueId], queryFn: () => api.wrapped(leagueId) });
  const slides = useMemo(() => (q.data ? buildSlides(q.data) : []), [q.data]);
  const [i, setI] = useState(0);
  const close = () => navigate(`/l/${leagueId}/league`);
  const last = i === slides.length - 1;

  useEffect(() => {
    if (!slides.length || last) return;
    const t = setTimeout(() => setI((x) => Math.min(x + 1, slides.length - 1)), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, slides.length, last]);
  useEffect(() => {
    if (last && slides.length > 1) celebrate(null, "big");
  }, [last, slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  const share = async () => {
    const w = q.data!;
    const text = `${w.leagueName} ${w.year}: ${w.meetups} meetups, ${w.dadsInvolved} dads, ${w.ideasPitched} ideas. Here's to next season. 🏆`;
    if (navigator.share) await navigator.share({ title: "Season Wrapped", text }).catch(() => {});
    else await navigator.clipboard.writeText(text);
  };

  const slide = slides[i];
  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-hidden bg-slate-950 text-white">
      {!slide ? (
        <Spinner className="pt-40 text-white" />
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.key}
              className={cx("absolute inset-0 bg-gradient-to-br", slide.bg)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">{slide.body}</div>
            </motion.div>
          </AnimatePresence>

          {/* Tap zones: left third goes back, the rest goes forward. */}
          <div className="absolute inset-0 grid grid-cols-[1fr_2fr]">
            <button aria-label="Previous" onClick={() => setI((x) => Math.max(x - 1, 0))} />
            <button aria-label="Next" onClick={() => setI((x) => Math.min(x + 1, slides.length - 1))} />
          </div>

          <div className="pt-safe absolute inset-x-0 top-0 z-10 px-3 pt-3">
            <div className="flex gap-1">
              {slides.map((s, idx) => (
                <div key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                  {idx < i || (idx === i && last) ? (
                    <div className="h-full w-full bg-white" />
                  ) : idx === i ? (
                    <motion.div
                      key={`bar-${i}`}
                      className="h-full bg-white"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: SLIDE_MS / 1000, ease: "linear" }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/80">Dad League</p>
              <button onClick={close} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Close">
                <X size={22} />
              </button>
            </div>
          </div>

          {last && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="pb-safe absolute inset-x-0 bottom-8 z-10 flex justify-center gap-3"
            >
              <button onClick={share} className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg">
                <Share2 size={16} /> Share
              </button>
              <button onClick={() => setI(0)} className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold backdrop-blur">
                Replay
              </button>
            </motion.div>
          )}
          {q.data && (
            <p className="sr-only" aria-live="polite">
              Slide {i + 1} of {slides.length}
            </p>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
