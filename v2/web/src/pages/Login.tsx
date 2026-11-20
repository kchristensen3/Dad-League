import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CalendarDays, CheckCircle2, Lightbulb, MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { api } from "../api";
import { Logo } from "../components/Brand";
import { Button, ErrorNote, Input, Spinner } from "../components/ui";
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
  {
    icon: CalendarDays,
    title: "Shared calendar",
    badge: "Simple scheduling",
    desc: "Put meetups on the calendar, see who's in at a glance, and sort out rides and tickets in each event's own thread.",
  },
  {
    icon: Lightbulb,
    title: "Ideas, voted on",
    badge: "Community-driven",
    desc: "Pitch Saturday coffee, nine holes or a backyard cookout. The best ideas rise to the top, and Claude can suggest a few based on where you live.",
  },
  {
    icon: MessagesSquare,
    title: "Group chat & board",
    badge: "Real-time",
    desc: "One chat for the crew, plus a board for recommendations, borrow-a-tool asks and links worth keeping.",
  },
  {
    icon: Award,
    title: "Trophy case",
    badge: "Shared leadership",
    desc: "Celebrate the guys who host, show up and bring the ideas, so no one dad ends up organizing everything.",
  },
];

const STEPS = ["Start a league and text the invite link to your crew", "Pitch and vote on ideas", "Put the winner on the calendar and show up"];

export default function Login() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();

  if (isLoading) return <Spinner className="pt-32" />;
  if (me) return <Navigate to={returnTo.startsWith("/") ? returnTo : "/"} replace />;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-white">
      {/* Drifting color blobs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-brand-500/40 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-accent-500/25 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center gap-2 px-5 pt-6">
        <Logo size={36} />
        <span className="text-lg font-black uppercase tracking-tight">Dad League</span>
        <Link to="/about" className="ml-auto text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white">
          What is it?
        </Link>
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
          <span className="bg-gradient-to-r from-brand-300 via-sky-200 to-accent-400 bg-clip-text text-transparent">
            friendships that matter.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 max-w-xl text-lg font-medium leading-relaxed text-slate-300"
        >
          Dad League gives your crew one simple place to pick what to do, put it on the calendar, and actually show up.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", damping: 20 }}
          className="mt-9 w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-left shadow-2xl shadow-brand-950/60 backdrop-blur-xl"
        >
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Join or sign in</h2>
            <p className="text-xs text-slate-400">Got an invite link? Sign in and you'll land right in your league.</p>
          </div>
          {params.get("error") && <ErrorNote error={ERRORS[params.get("error")!] ?? "Sign-in failed."} />}
          <SignInOptions returnTo={returnTo} onDevLogin={() => qc.invalidateQueries({ queryKey: ["me"] })} />
          <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-400" /> Private to your league</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-brand-300" /> Free</span>
          </div>
        </motion.div>

        <section className="mt-20 w-full">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-brand-300">How it works</p>
          <ol className="mx-auto mt-5 grid max-w-3xl gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.li
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-black italic text-slate-900">{i + 1}</span>
                <span className="pt-1 text-sm font-semibold text-slate-200">{step}</span>
              </motion.li>
            ))}
          </ol>
        </section>

        <section className="mt-16 w-full text-left">
          <div className="mx-auto mb-8 max-w-xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-brand-300">Everything your crew needs</p>
            <p className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">Built for real life & fatherhood</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: (i % 2) * 0.1 }}
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
        </section>

        <footer className="mt-16 flex gap-3 text-xs text-slate-500">
          <Link to="/about" className="hover:text-slate-300">About</Link>·
          <a href="/privacy.html" className="hover:text-slate-300">Privacy</a>·
          <a href="/terms.html" className="hover:text-slate-300">Terms</a>
        </footer>
      </main>
    </div>
  );
}
