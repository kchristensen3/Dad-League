import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Crown, Info, LogOut, MapPin, RefreshCw, Settings, Share2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Member } from "../../../shared/schemas";
import { api } from "../api";
import { TrophyCase } from "../components/TrophyCase";
import { Avatar, Button, Card, ErrorNote, Field, Input, Pill, Sheet, Spinner, Textarea } from "../components/ui";
import { useDocumentTitle, useLeague, useLeagueId, useMe, useMembers } from "../hooks";

function InviteCard({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient();
  const league = useLeague(leagueId).data!;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/join/${league.inviteCode}`;
  const rotate = useMutation({
    mutationFn: () => api.rotateInvite(leagueId),
    onSuccess: (l) => qc.setQueryData(["league", leagueId], l),
  });
  const share = async () => {
    const text = `Join ${league.name} on Dad League`;
    if (navigator.share) {
      await navigator.share({ title: "Dad League", text, url: link }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Card className="relative space-y-3 overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-0">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-white/15 blur-md"
        animate={{ left: ["-50%", "150%"] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
      />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-100">Invite the crew</p>
        <p className="font-mono text-3xl font-black tracking-[0.2em]">{league.inviteCode}</p>
      </div>
      <div className="relative flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={share}>
          <Share2 size={14} /> {copied ? "Link copied!" : "Share link"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10"
          onClick={async () => {
            await navigator.clipboard.writeText(league.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Copy size={14} /> Code
        </Button>
        {league.role === "owner" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            loading={rotate.isPending}
            onClick={() => confirm("Make a new code? The old link will stop working.") && rotate.mutate()}
          >
            <RefreshCw size={14} /> New code
          </Button>
        )}
      </div>
    </Card>
  );
}

function MemberRow({ leagueId, m, isOwnerView, meId }: { leagueId: string; m: Member; isOwnerView: boolean; meId?: string }) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["members", leagueId] });
    void qc.invalidateQueries({ queryKey: ["league", leagueId] });
  };
  const remove = useMutation({ mutationFn: () => api.removeMember(leagueId, m.id), onSuccess: refresh });
  const promote = useMutation({ mutationFn: () => api.transferOwnership(leagueId, m.id), onSuccess: refresh });
  return (
    <li className="flex gap-3 py-3">
      <Avatar user={m} size={40} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1.5 font-semibold">
          {m.name} {m.role === "owner" && <Crown size={14} className="text-accent-500" aria-label="Owner" />}
        </p>
        <p className="text-xs text-slate-500">
          {m.stats.eventsAttended} attended · {m.stats.eventsHosted} hosted · {m.stats.ideasProposed} ideas · {m.stats.messagesSent} messages
        </p>
        {(m.location || m.availability) && (
          <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
            {m.location && <span className="flex items-center gap-1"><MapPin size={11} /> {m.location}</span>}
            {m.availability && <span>🕒 {m.availability}</span>}
          </p>
        )}
        {m.interests.length > 0 && (
          <div className="flex flex-wrap gap-1">{m.interests.map((i) => <Pill key={i}>{i}</Pill>)}</div>
        )}
        {isOwnerView && m.id !== meId && (
          <div className="flex gap-3 pt-1 text-xs font-semibold">
            <button className="text-slate-500 hover:text-brand-600" onClick={() => confirm(`Make ${m.name} the owner? You'll become a regular member.`) && promote.mutate()}>
              Make owner
            </button>
            <button className="text-slate-500 hover:text-red-600" onClick={() => confirm(`Remove ${m.name} from the league?`) && remove.mutate()}>
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function LeagueSettings({ leagueId, open, onClose }: { leagueId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const league = useLeague(leagueId).data!;
  const [name, setName] = useState(league.name);
  const [description, setDescription] = useState(league.description);
  const save = useMutation({
    mutationFn: () => api.updateLeague(leagueId, { name, description }),
    onSuccess: (l) => {
      qc.setQueryData(["league", leagueId], l);
      void qc.invalidateQueries({ queryKey: ["leagues"] });
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteLeague(leagueId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leagues"] });
      navigate("/", { replace: true });
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="League settings">
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Name"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Description"><Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <ErrorNote error={save.error ?? del.error} />
        <Button type="submit" className="w-full" loading={save.isPending}>Save</Button>
      </form>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <Button
          variant="ghost"
          className="w-full text-red-600 hover:bg-red-50"
          loading={del.isPending}
          onClick={() => prompt(`Type the league name to delete it for everyone:`) === league.name && del.mutate()}
        >
          <Trash2 size={16} /> Delete league
        </Button>
      </div>
    </Sheet>
  );
}

export default function LeaguePage() {
  const leagueId = useLeagueId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId).data!;
  const members = useMembers(leagueId);
  const [settings, setSettings] = useState(false);
  useDocumentTitle(league.name);
  const leave = useMutation({
    mutationFn: () => api.removeMember(leagueId, me!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leagues"] });
      navigate("/", { replace: true });
    },
  });
  const isOwner = league.role === "owner";

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">{league.name}</h1>
          {league.description && <p className="text-sm text-slate-500">{league.description}</p>}
        </div>
        {isOwner && (
          <Button variant="secondary" size="sm" onClick={() => setSettings(true)} aria-label="League settings">
            <Settings size={16} />
          </Button>
        )}
      </section>

      <InviteCard leagueId={leagueId} />

      {members.data && <TrophyCase members={members.data} />}

      <Card>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Members · {members.data?.length ?? "…"}</h2>
        {members.isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.data?.map((m) => <MemberRow key={m.id} leagueId={leagueId} m={m} isOwnerView={isOwner} meId={me?.id} />)}
          </ul>
        )}
      </Card>

      <Link to="/about" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        <Info size={15} /> What is Dad League?
      </Link>

      {!isOwner && (
        <Button variant="ghost" className="w-full text-slate-500" loading={leave.isPending} onClick={() => confirm(`Leave ${league.name}?`) && leave.mutate()}>
          <LogOut size={16} /> Leave league
        </Button>
      )}
      <ErrorNote error={leave.error} />
      <p className="text-center text-xs text-slate-400">Created {format(new Date(members.data?.[0]?.joinedAt ?? Date.now()), "MMMM yyyy")}</p>
      {settings && <LeagueSettings leagueId={leagueId} open onClose={() => setSettings(false)} />}
    </div>
  );
}
