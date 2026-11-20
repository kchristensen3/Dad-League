import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Ticket } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, browserTimezone } from "../api";
import { Logo } from "../components/Brand";
import { Button, Card, ErrorNote, Field, Input, Spinner, Textarea } from "../components/ui";
import { lastLeague, useDocumentTitle, useMe } from "../hooks";
import { hasSeenAbout } from "./About";

export function RootRedirect() {
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: api.leagues });
  if (!hasSeenAbout()) return <Navigate to="/about?welcome=1" replace />;
  if (leagues.isLoading) return <Spinner className="pt-32" />;
  const list = leagues.data ?? [];
  if (list.length === 0) return <Navigate to="/leagues" replace />;
  const remembered = list.find((l) => l.id === lastLeague());
  return <Navigate to={`/l/${(remembered ?? list[0]!).id}`} replace />;
}

export function CreateOrJoin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const done = (id: string) => {
    void qc.invalidateQueries({ queryKey: ["leagues"] });
    navigate(`/l/${id}`);
  };
  const join = useMutation({ mutationFn: () => api.joinLeague(code), onSuccess: (r) => done(r.league.id) });
  const create = useMutation({
    mutationFn: () => api.createLeague({ name, description, timezone: browserTimezone() }),
    onSuccess: (l) => done(l.id),
  });

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Ticket size={18} className="text-brand-500" /> Got an invite code?</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate();
          }}
        >
          <Input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            className="font-mono tracking-widest"
            aria-label="Invite code"
          />
          <Button type="submit" loading={join.isPending}>Join</Button>
        </form>
        <ErrorNote error={join.error} />
      </Card>
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 font-bold"><Plus size={18} className="text-brand-500" /> Start a new league</h2>
          <Field label="Name">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Detroit Dads" />
          </Field>
          <Field label="What's it about?">
            <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Weekend hangs, ballgames, and the occasional trivia night." />
          </Field>
          <ErrorNote error={create.error} />
          <Button type="submit" className="w-full" loading={create.isPending}>Create league</Button>
        </form>
      </Card>
    </div>
  );
}

export default function Leagues() {
  useDocumentTitle("Your leagues");
  const { data: me } = useMe();
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: api.leagues });
  const list = leagues.data ?? [];
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-xl font-black">{list.length ? "Your leagues" : `Welcome, ${me?.name.split(" ")[0]}!`}</h1>
          {!list.length && <p className="text-sm text-slate-500">Join your crew or start one.</p>}
        </div>
        <Link to="/me" className="ml-auto text-sm font-semibold text-brand-600">Profile</Link>
      </header>
      {leagues.isLoading ? (
        <Spinner />
      ) : (
        list.length > 0 && (
          <div className="space-y-2">
            {list.map((l) => (
              <Link key={l.id} to={`/l/${l.id}`} className="block">
                <Card className="flex items-center gap-3 transition hover:ring-brand-300">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.memberCount} {l.memberCount === 1 ? "member" : "members"} · {l.role === "owner" ? "You run this one" : "Member"}
                    </p>
                  </div>
                  <ChevronRight className="text-slate-300" />
                </Card>
              </Link>
            ))}
          </div>
        )
      )}
      <CreateOrJoin />
    </div>
  );
}
