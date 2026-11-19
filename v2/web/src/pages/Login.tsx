import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Lightbulb, MessagesSquare } from "lucide-react";
import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { api } from "../api";
import { Logo } from "../components/Brand";
import { Button, Card, ErrorNote, Input, Spinner } from "../components/ui";
import { useMe } from "../hooks";

const ERRORS: Record<string, string> = {
  state: "Sign-in timed out. Please try again.",
  email: "Your Google account needs a verified email.",
  google: "Google sign-in failed. Please try again.",
  apple: "Sign in with Apple failed. Please try again.",
};

export function GoogleButton({ returnTo }: { returnTo: string }) {
  return (
    <a
      href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
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
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
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

export default function Login() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();

  if (isLoading) return <Spinner className="pt-32" />;
  if (me) return <Navigate to={returnTo.startsWith("/") ? returnTo : "/"} replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Dad League</h1>
          <p className="text-slate-600">Get the guys together. Actually.</p>
        </div>
        <Card className="space-y-4 p-5">
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3"><CalendarDays className="shrink-0 text-brand-500" size={20} /> Plan meetups and see who's in</li>
            <li className="flex gap-3"><Lightbulb className="shrink-0 text-accent-500" size={20} /> Vote on ideas (or let Claude suggest some)</li>
            <li className="flex gap-3"><MessagesSquare className="shrink-0 text-emerald-600" size={20} /> One group chat, plus a thread per event</li>
          </ul>
          {params.get("error") && <ErrorNote error={ERRORS[params.get("error")!] ?? "Sign-in failed."} />}
          <SignInOptions returnTo={returnTo} onDevLogin={() => qc.invalidateQueries({ queryKey: ["me"] })} />
        </Card>
        <p className="text-center text-xs text-slate-400">
          By continuing you agree to the <a className="underline" href="/terms.html">Terms</a> and{" "}
          <a className="underline" href="/privacy.html">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
