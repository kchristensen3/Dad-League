import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Logo } from "../components/Brand";
import { FOUNDER_NOTE } from "../content/story";
import { useDocumentTitle, useMe } from "../hooks";

export const SEEN_ABOUT_KEY = "dl:seenAbout";
export function hasSeenAbout() {
  try {
    return localStorage.getItem(SEEN_ABOUT_KEY) === "1";
  } catch {
    return true; // storage blocked: don't trap people on the welcome page
  }
}

const GOALS = [
  "Make intentional time to connect and engage with your community",
  "Try new activities and break out of the daily routine",
  "Support each other through family, career, and life transitions",
  "A welcoming, low-pressure space for fathers",
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { delay, duration: 0.4 },
});

/** "What is Dad League?" Shown once after first sign-in (?welcome=1), and linked from the app. */
export default function About() {
  useDocumentTitle("What is Dad League?");
  const [params] = useSearchParams();
  const welcome = params.get("welcome") === "1";
  const navigate = useNavigate();
  const { data: me } = useMe();

  const enter = () => {
    try {
      localStorage.setItem(SEEN_ABOUT_KEY, "1");
    } catch {}
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-100">
      <div className="mx-auto max-w-2xl space-y-10 px-5 pb-16 pt-6">
        {!welcome && (
          <Link to={me ? "/" : "/login"} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} /> Back
          </Link>
        )}

        <section className="space-y-4 pt-6 text-center">
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 12 }} className="flex justify-center">
            <Logo size={64} />
          </motion.div>
          <motion.h1 {...fadeUp(0.1)} className="text-5xl font-black uppercase leading-[0.95] tracking-tight text-slate-800">
            What is
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">Dad League?</span>
          </motion.h1>
          <motion.p {...fadeUp(0.2)} className="text-lg leading-relaxed text-slate-500">
            Dad League is a simple commitment to getting together on a regular rhythm. No complicated logistics—just dads making
            intentional time for friendship and community.
          </motion.p>
          {welcome && (
            <motion.button
              {...fadeUp(0.3)}
              whileTap={{ scale: 0.96 }}
              onClick={enter}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-brand-500/30 hover:bg-brand-600"
            >
              Enter the League <ArrowRight size={16} />
            </motion.button>
          )}
        </section>

        <motion.section {...fadeUp()} className="relative overflow-hidden rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200/70 sm:p-9">
          <div aria-hidden className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-50 blur-3xl" />
          <h2 className="relative mb-7 flex items-center gap-2 text-xl font-black uppercase tracking-tight text-slate-800">
            <span className="h-6 w-1.5 rounded-full bg-brand-500" /> How it works
          </h2>
          <ul className="relative space-y-5">
            {GOALS.map((goal, i) => (
              <motion.li key={goal} {...fadeUp(i * 0.08)} className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black italic text-white shadow-md">
                  {i + 1}
                </span>
                <span className="pt-1 text-lg font-medium leading-tight text-slate-600">{goal}</span>
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <motion.section {...fadeUp()} className="relative rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 sm:p-9">
          <span className="absolute -top-3.5 left-7 rounded-full bg-white px-4 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 ring-1 ring-slate-200">
            A message from the founder
          </span>
          <h3 className="text-xl font-black text-slate-800">Why I started Dad League</h3>
          <div className="mt-4 space-y-4 border-l-4 border-brand-200 py-1 pl-5 italic leading-relaxed text-slate-600">
            {FOUNDER_NOTE.map((p) => (
              <p key={p.slice(0, 20)}>{p}</p>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 font-black text-brand-600">KC</div>
            <div>
              <p className="font-black leading-none text-slate-800">Kyle Christensen</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Founder, Dad League</p>
            </div>
          </div>
        </motion.section>

        {welcome && (
          <div className="text-center">
            <button onClick={enter} className="text-sm font-bold text-brand-600 hover:underline">
              Let's go →
            </button>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 pt-6 text-xs text-slate-400">
          <span>Dad League v2 · Built with pride for dads everywhere</span>
          <a href="/privacy" className="font-bold text-slate-500 underline hover:text-brand-600">Privacy Policy</a>
          <a href="/terms" className="font-bold text-slate-500 underline hover:text-brand-600">Terms of Service</a>
        </footer>
      </div>
    </div>
  );
}
