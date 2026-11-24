import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Camera, CheckCircle2, ChevronDown, Lightbulb, MessagesSquare, Repeat, ShieldCheck, Smartphone, Sparkles, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { api } from "../api";
import { Logo } from "../components/Brand";
import { Button, ErrorNote, Input, Spinner } from "../components/ui";
import { FOUNDER, FOUNDER_NOTE } from "../content/story";
import { useMe } from "../hooks";

const ERRORS: Record<string, string> = {
  state: "Sign-in timed out. Please try again.",
  email: "Your Google account needs a verified email.",
  google: "Google approved the sign-in, but the app couldn't finish it. The server's deploy log says why.",
  google_rejected: "Google rejected this app's sign-in settings (client ID, secret or redirect URI). The server's deploy log says which.",
  apple: "Apple approved the sign-in, but the app couldn't finish it. The server's deploy log says why.",
  apple_rejected: "Apple rejected this app's sign-in settings. The server's deploy log says which.",
};

export function GoogleButton({ returnTo }: { returnTo: string }) {
  return (
    <a
      href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.98] hover:bg-slate-50"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function AppleButton({ returnTo }: { returnTo: string }) {
  return (
    <a
      href={`/auth/apple?returnTo=${encodeURIComponent(returnTo)}`}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition active:scale-[0.98] hover:bg-slate-800"
    >
      <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden fill="currentColor">
        <path d="M788 341c-6 4-108 62-108 190 0 149 131 202 135 203-1 3-21 72-69 142-43 62-88 124-157 124s-87-40-166-40c-77 0-105 41-168 41s-107-57-158-128C38 790 0 662 0 541c0-196 127-299 253-299 66 0 122 44 164 44 40 0 102-46 178-46 29 0 132 2 193 101zM554 158c31-37 53-88 53-139 0-7-1-14-2-19-51 2-111 34-147 76-28 32-55 83-55 135 0 8 1 16 2 18 3 1 9 2 14 2 46 0 103-31 135-73z" />
      </svg>
      Continue with Apple
    </a>
  );
}

/** Every sign-in option the server has configured. */
export function SignInOptions({ returnTo, onDevLogin }: { returnTo: string; onDevLogin: () => void }) {
  const config = useQuery({ queryKey: ["authConfig"], queryFn: api.authConfig });
  if (!config.data) return <Spinner className="py-4" />;
  const { apple, google, devLogin } = config.data;
  return (
    <div className="space-y-3">
      {apple && <AppleButton returnTo={returnTo} />}
      {google && <GoogleButton returnTo={returnTo} />}
      {devLogin && <DevLogin onDone={onDevLogin} />}
      {!apple && !google && !devLogin && (
        <ErrorNote error="No sign-in method is configured. Set the Google and/or Apple variables on the server." />
      )}
    </div>
  );
}

export function DevLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const m = useMutation({ mutationFn: () => api.devLogin(email, name || undefined), onSuccess: onDone });
  return (
    <form
      className="space-y-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <p className="text-xs font-semibold text-amber-800">Dev sign-in (DEV_LOGIN=true)</p>
      <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Display name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <ErrorNote error={m.error} />
      <Button type="submit" variant="secondary" className="w-full" loading={m.isPending}>
        Sign in
      </Button>
    </form>
  );
}

const FEATURES = [
  { icon: Repeat, title: "Standing meetups", badge: "Set it once", desc: "First Thursday poker, every-other-Saturday hoops. It stays on the calendar, hosts take turns, and everyone gets a reminder the day before." },
  { icon: Lightbulb, title: "Ideas, voted on", badge: "Community-driven", desc: "Pitch Saturday coffee, nine holes or a backyard cookout. The best ideas rise to the top, and Claude can suggest a few that fit where you live." },
  { icon: Trophy, title: "The Commissioner", badge: "Weekly nudge", desc: "Every Monday a short note in chat: what's coming up, who hasn't replied, and a ready-to-go plan when the calendar's empty. One tap puts it on." },
  { icon: MessagesSquare, title: "Chat & board", badge: "Real-time", desc: "One group chat, a thread for every event, and a board for recommendations, borrow-a-tool asks and links worth keeping." },
  { icon: Camera, title: "Photos & Season Wrapped", badge: "Memories", desc: "An album for every meetup and a year-end recap of how often you actually got together, who showed up, and the best moments." },
  { icon: Award, title: "Trophy case", badge: "Shared leadership", desc: "Ironman, Head Coach, Idea Machine. Celebrate the guys who host and show up, so no one dad ends up organizing everything." },
];

const STEPS = [
  { title: "Start a league", text: "Name your crew and text the invite link. Friends join in one tap." },
  { title: "Pick what to do", text: "Pitch ideas, vote, or let the Commissioner suggest something." },
  { title: "Put it on the calendar", text: "RSVP, sort out rides in the event chat, and show up." },
];

const FAQ = [
  { q: "Is it free?", a: "Yes. Everything you see here is free. If we ever add paid extras, the core of running a league will stay free." },
  { q: "Do I need to download an app?", a: "No. Dad League runs in your phone's browser. Add it to your Home Screen and it opens like an app, with notifications, no App Store needed." },
  { q: "Who can see what I post?", a: "Only the members of the league you post in. We don't sell your data or show ads. See the Privacy Policy for details." },
  { q: "What's the Commissioner?", a: "An AI helper (Claude, by Anthropic) that posts a short weekly note in your league's chat. League owners can turn it off any time." },
  { q: "Is it only for dads?", a: "It was built for dads who keep saying \"we should hang out,\" but any group of friends trying to get together regularly is welcome." },
  { q: "How do I leave or delete my account?", a: "Leave a league from its League tab. Delete your account and everything you've posted from Profile → Delete account." },
];

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-20 w-full scroll-mt-6">
      <div className="mx-auto mb-8 max-w-xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-brand-300">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {q}
        <ChevronDown size={18} className={`shrink-0 text-brand-300 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-4 text-sm leading-relaxed text-slate-300"
          >
            <span className="block pb-4">{a}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sections slide up slightly as they scroll in, but are never invisible at rest
// (so link previews, screenshots and search engines see the whole page).
const reveal = (delay = 0) => ({
  initial: { y: 18 },
  whileInView: { y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { delay },
});

export default function Login() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const toSignIn = () => document.getElementById("sign-in")?.scrollIntoView({ behavior: "smooth", block: "center" });

  if (isLoading) return <Spinner className="pt-32" />;
  if (me) return <Navigate to={returnTo.startsWith("/") ? returnTo : "/"} replace />;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-white">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-brand-500/40 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-[28rem] -right-40 h-[26rem] w-[26rem] rounded-full bg-accent-500/25 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center gap-2 px-5 pt-6">
        <Logo size={36} />
        <span className="text-lg font-black uppercase tracking-tight">Dad League</span>
        <nav className="ml-auto flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-300">
          <a href="#how" className="hidden hover:text-white sm:inline">How it works</a>
          <a href="#story" className="hidden hover:text-white sm:inline">Our story</a>
          <a href="#faq" className="hidden hover:text-white sm:inline">FAQ</a>
          <button onClick={toSignIn} className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20">Sign in</button>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 pb-16 pt-12 text-center sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-900/60 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider text-brand-200"
        >
          <Sparkles size={14} className="text-accent-400" /> For dads who keep saying "we should hang out"
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl text-4xl font-black uppercase leading-[1.02] tracking-tight sm:text-6xl"
        >
          Make time for
          <br />
          <span className="bg-gradient-to-r from-brand-300 via-sky-200 to-accent-400 bg-clip-text text-transparent">friendships that matter.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 max-w-xl text-lg font-medium leading-relaxed text-slate-300"
        >
          Dad League is a free app that gives your crew one simple place to pick what to do, put it on the calendar, and actually show up.
          A standing invitation to just hang out.
        </motion.p>

        <motion.div
          id="sign-in"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", damping: 20 }}
          className="mt-9 w-full max-w-sm scroll-mt-24 space-y-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-left shadow-2xl shadow-brand-950/60 backdrop-blur-xl"
        >
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Join or sign in</h2>
            <p className="text-xs text-slate-400">Got an invite link? Sign in and you'll land right in your league.</p>
          </div>
          {params.get("error") && <ErrorNote error={ERRORS[params.get("error")!] ?? "Sign-in failed."} />}
          <SignInOptions returnTo={returnTo} onDevLogin={() => qc.invalidateQueries({ queryKey: ["me"] })} />
          <p className="text-center text-[11px] leading-relaxed text-slate-500">
            By continuing you agree to the <a href="/terms" className="underline hover:text-slate-300">Terms of Service</a> and{" "}
            <a href="/privacy" className="underline hover:text-slate-300">Privacy Policy</a>.
          </p>
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-400" /> Private to your league</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-brand-300" /> Free · no ads</span>
          </div>
        </motion.div>

        <Section id="how" eyebrow="Three steps" title="How it works">
          <ol className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.li key={step.title} {...reveal(i * 0.1)} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-black italic text-slate-900">{i + 1}</span>
                <h3 className="mt-3 font-black uppercase tracking-tight">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{step.text}</p>
              </motion.li>
            ))}
          </ol>
        </Section>

        <Section eyebrow="Everything your crew needs" title="Built for real life & fatherhood">
          <div className="mx-auto grid max-w-4xl gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                {...reveal((i % 3) * 0.08)}
                className="group rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition hover:border-brand-400/40"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-900/70 text-brand-200 transition group-hover:scale-105">
                    <f.icon size={22} />
                  </div>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300">{f.badge}</span>
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="story" eyebrow="Our story" title="Why I started Dad League">
          <motion.figure {...reveal()} className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6 text-left sm:p-8">
            <blockquote className="space-y-4 border-l-4 border-accent-500/70 pl-5 text-[15px] italic leading-relaxed text-slate-200">
              {FOUNDER_NOTE.map((p) => (
                <p key={p.slice(0, 20)}>{p}</p>
              ))}
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 font-black">{FOUNDER.initials}</span>
              <span>
                <span className="block font-black">{FOUNDER.name}</span>
                <span className="block text-xs font-bold uppercase tracking-widest text-slate-400">{FOUNDER.title}</span>
              </span>
            </figcaption>
          </motion.figure>
        </Section>

        <Section eyebrow="No App Store needed" title="Put it on your phone">
          <div className="mx-auto grid max-w-3xl gap-4 text-left sm:grid-cols-2">
            {[
              { device: "iPhone", icon: Smartphone, steps: ["Open Dad League in Safari", "Tap the Share button", "Choose Add to Home Screen", "Open it from the new icon and turn on notifications in Profile"] },
              { device: "Android", icon: Smartphone, steps: ["Open Dad League in Chrome", "Tap the ⋮ menu", "Choose Install app (or Add to Home screen)", "Open it and turn on notifications in Profile"] },
            ].map((d, i) => (
              <motion.div key={d.device} {...reveal(i * 0.1)} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="flex items-center gap-2 font-black uppercase tracking-tight">
                  <d.icon size={18} className="text-accent-400" /> {d.device}
                </h3>
                <ol className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {d.steps.map((s, n) => (
                    <li key={s} className="flex gap-2">
                      <span className="font-black text-brand-300">{n + 1}.</span> {s}
                    </li>
                  ))}
                </ol>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="faq" eyebrow="Good to know" title="Questions">
          <div className="mx-auto max-w-2xl space-y-2 text-left">
            {FAQ.map((f) => (
              <FaqItem key={f.q} {...f} />
            ))}
          </div>
        </Section>

        <motion.section {...reveal()} className="mt-20 w-full max-w-2xl rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center shadow-2xl">
          <h2 className="text-3xl font-black uppercase leading-tight tracking-tight">Put it on the calendar.</h2>
          <p className="mx-auto mt-2 max-w-md text-brand-100">Start your league in a minute, text the link, and get the guys together this month.</p>
          <button onClick={toSignIn} className="mt-6 rounded-xl bg-white px-6 py-3 text-sm font-black uppercase tracking-wider text-brand-700 shadow-lg hover:bg-brand-50">
            Start your league
          </button>
        </motion.section>

        <footer className="mt-16 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <Link to="/about" className="hover:text-slate-300">About</Link>·
          <a href="/privacy" className="hover:text-slate-300">Privacy Policy</a>·
          <a href="/terms" className="hover:text-slate-300">Terms of Service</a>·
          <span>© 2026 Dad League</span>
        </footer>
      </main>
    </div>
  );
}
