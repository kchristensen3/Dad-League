import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, LogOut, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Me, NotificationPrefs } from "../../../shared/schemas";
import { api } from "../api";
import { Avatar, Button, Card, ErrorNote, Field, Input, Pill } from "../components/ui";
import { lastLeague, useDocumentTitle, useMe } from "../hooks";
import { enablePush } from "../push";

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  events: "New and cancelled events",
  messages: "Chat messages",
  ideas: "New ideas",
  posts: "Board posts",
};

function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.name);
  const [location, setLocation] = useState(me.location ?? "");
  const [availability, setAvailability] = useState(me.availability ?? "");
  const [interests, setInterests] = useState(me.interests);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.updateMe({ name, location: location || null, availability: availability || null, interests }),
    onSuccess: (user) => {
      qc.setQueryData(["me"], user);
      void qc.invalidateQueries({ queryKey: ["members"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });
  const addInterest = () => {
    const v = draft.trim();
    if (v && !interests.includes(v) && interests.length < 20) setInterests([...interests, v]);
    setDraft("");
  };
  return (
    <Card>
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Name"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Where you live" hint="Helps Claude suggest things nearby.">
          <Input maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ferndale, MI" />
        </Field>
        <Field label="When you're usually free">
          <Input maxLength={200} value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="Weeknights after 8, Sunday mornings" />
        </Field>
        <Field label="Interests">
          <div className="flex gap-2">
            <Input
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInterest())}
              placeholder="Golf, grilling, Lions…"
            />
            <Button type="button" variant="secondary" onClick={addInterest}>Add</Button>
          </div>
        </Field>
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {interests.map((i) => (
              <Pill key={i} className="bg-brand-50 text-brand-700">
                {i}
                <button type="button" onClick={() => setInterests(interests.filter((x) => x !== i))} aria-label={`Remove ${i}`}>
                  <X size={12} />
                </button>
              </Pill>
            ))}
          </div>
        )}
        <ErrorNote error={save.error} />
        <Button type="submit" className="w-full" loading={save.isPending}>{saved ? "Saved ✓" : "Save profile"}</Button>
      </form>
    </Card>
  );
}

function Notifications({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = useMutation({
    mutationFn: (key: keyof NotificationPrefs) =>
      api.updateMe({ notificationPrefs: { ...me.notificationPrefs, [key]: !me.notificationPrefs[key] } }),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 font-bold"><Bell size={18} className="text-brand-500" /> Notifications</h2>
      <Button
        variant="secondary"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setStatus(await enablePush());
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "Couldn't turn on notifications");
          } finally {
            setBusy(false);
          }
        }}
      >
        Turn on for this device
      </Button>
      {status && <p className="text-sm text-slate-600">{status}</p>}
      <ul className="divide-y divide-slate-100">
        {(Object.keys(PREF_LABELS) as (keyof NotificationPrefs)[]).map((k) => (
          <li key={k} className="flex items-center justify-between py-2.5 text-sm">
            {PREF_LABELS[k]}
            <button
              role="switch"
              aria-checked={me.notificationPrefs[k]}
              aria-label={PREF_LABELS[k]}
              onClick={() => toggle.mutate(k)}
              className={`relative h-6 w-11 rounded-full transition ${me.notificationPrefs[k] ? "bg-brand-500" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${me.notificationPrefs[k] ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Profile() {
  useDocumentTitle("Profile");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      navigate("/login", { replace: true });
    },
  });
  const deleteAccount = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => {
      qc.clear();
      navigate("/login", { replace: true });
    },
  });
  if (!me) return null;
  const back = lastLeague();
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <Link to={back ? `/l/${back}` : "/"} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Back
      </Link>
      <div className="flex items-center gap-3">
        <Avatar user={me} size={56} />
        <div>
          <h1 className="text-xl font-black">{me.name}</h1>
          <p className="text-sm text-slate-500">{me.email}</p>
        </div>
      </div>
      <ProfileForm me={me} />
      <Notifications me={me} />
      <Card className="space-y-2">
        <Link to="/about" className="block rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50">
          What is Dad League?
        </Link>
        <Button variant="secondary" className="w-full" onClick={() => signOut.mutate()} loading={signOut.isPending}>
          <LogOut size={16} /> Sign out
        </Button>
        <Button
          variant="ghost"
          className="w-full text-red-600 hover:bg-red-50"
          loading={deleteAccount.isPending}
          onClick={() =>
            confirm("Permanently delete your account and everything you've posted? Leagues you run go to the next member.") &&
            deleteAccount.mutate()
          }
        >
          <Trash2 size={16} /> Delete account
        </Button>
        <ErrorNote error={deleteAccount.error} />
      </Card>
    </div>
  );
}
