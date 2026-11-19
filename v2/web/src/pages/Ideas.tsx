import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarPlus, Lightbulb, MapPin, Plus, Sparkles, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, type Category, type Idea, type IdeaSuggestion } from "../../../shared/schemas";
import { api } from "../api";
import { type EventDraft, EventForm } from "../components/EventForm";
import { Avatar, Button, Card, Empty, ErrorNote, Field, Input, Pill, Select, Sheet, Spinner, Textarea, cx } from "../components/ui";
import { useDocumentTitle, useLeague, useLeagueId, useMe } from "../hooks";

function AddIdea({ leagueId, open, onClose }: { leagueId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Casual Hangout");
  const [location, setLocation] = useState("");
  const m = useMutation({
    mutationFn: () => api.createIdea(leagueId, { title, description, category, location: location || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ideas", leagueId] });
      setTitle("");
      setDescription("");
      setLocation("");
      setCategory("Casual Hangout");
      onClose();
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="Pitch an idea">
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Idea">
          <Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Axe throwing, poker night…" />
        </Field>
        <Field label="Type">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Where (optional)">
          <Input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Why it's fun (optional)">
          <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <ErrorNote error={m.error} />
        <Button type="submit" className="w-full" loading={m.isPending}>Add to the list</Button>
      </form>
    </Sheet>
  );
}

function SuggestIdeas({ leagueId, open, onClose }: { leagueId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [request, setRequest] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const suggest = useMutation({ mutationFn: () => api.suggestIdeas(leagueId, request || undefined), onSuccess: () => setAdded(new Set()) });
  const add = useMutation({
    mutationFn: (s: IdeaSuggestion) => api.createIdea(leagueId, { ...s, location: null, aiSuggested: true }),
    onSuccess: (_i, s) => {
      setAdded((a) => new Set(a).add(s.title));
      void qc.invalidateQueries({ queryKey: ["ideas", leagueId] });
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="Get ideas from Claude">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Claude looks at where your league lives, when people are free, their interests and what's already on the list.
        </p>
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), suggest.mutate())}>
          <Input value={request} maxLength={300} onChange={(e) => setRequest(e.target.value)} placeholder="Optional: “rainy day”, “with kids”…" />
          <Button type="submit" loading={suggest.isPending}>
            <Sparkles size={16} /> Go
          </Button>
        </form>
        <ErrorNote error={suggest.error ?? add.error} />
        {suggest.isPending && <p className="animate-pulse text-center text-sm text-slate-400">Thinking about what you'd actually enjoy…</p>}
        <div className="space-y-2">
          {suggest.data?.map((s) => (
            <Card key={s.title} className="space-y-1.5 bg-slate-50">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-bold">{s.title}</p>
                <Button
                  size="sm"
                  variant={added.has(s.title) ? "ghost" : "secondary"}
                  disabled={added.has(s.title)}
                  onClick={() => add.mutate(s)}
                >
                  {added.has(s.title) ? "Added" : <><Plus size={14} /> Add</>}
                </Button>
              </div>
              <Pill>{s.category}</Pill>
              <p className="text-sm text-slate-600">{s.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function IdeaCard({ leagueId, idea, onSchedule }: { leagueId: string; idea: Idea; onSchedule: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const canEdit = idea.author.id === me?.id || league.data?.role === "owner";
  const refresh = () => qc.invalidateQueries({ queryKey: ["ideas", leagueId] });
  const vote = useMutation({ mutationFn: () => api.vote(leagueId, idea.id, !idea.votedByMe), onSuccess: refresh });
  const archive = useMutation({ mutationFn: () => api.updateIdea(leagueId, idea.id, { archived: !idea.archived }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deleteIdea(leagueId, idea.id), onSuccess: refresh });
  return (
    <Card className="flex gap-3">
      <button
        onClick={() => vote.mutate()}
        disabled={vote.isPending || idea.archived}
        className={cx(
          "flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-sm font-bold transition",
          idea.votedByMe ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-600",
        )}
        aria-pressed={idea.votedByMe}
        aria-label={idea.votedByMe ? "Remove vote" : "Vote"}
      >
        <ThumbsUp size={16} />
        {idea.voteCount}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-bold">{idea.title}</h3>
          {idea.aiSuggested && <Sparkles size={14} className="text-accent-500" aria-label="Suggested by Claude" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill>{idea.category}</Pill>
          {idea.location && <Pill><MapPin size={11} /> {idea.location}</Pill>}
        </div>
        {idea.description && <p className="text-sm text-slate-600">{idea.description}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Avatar user={idea.author} size={16} /> {idea.author.name.split(" ")[0]}</span>
          {!idea.archived && (
            <button onClick={onSchedule} className="flex items-center gap-1 font-semibold text-brand-600 hover:underline">
              <CalendarPlus size={13} /> Schedule
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={() => archive.mutate()} className="flex items-center gap-1 hover:text-slate-700">
                {idea.archived ? <><ArchiveRestore size={13} /> Restore</> : <><Archive size={13} /> Archive</>}
              </button>
              <button onClick={() => confirm(`Delete “${idea.title}”?`) && remove.mutate()} className="flex items-center gap-1 hover:text-red-600">
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Ideas() {
  const leagueId = useLeagueId();
  useDocumentTitle("Ideas");
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [planning, setPlanning] = useState<EventDraft | null>(null);
  const q = useQuery({ queryKey: ["ideas", leagueId, archived], queryFn: () => api.ideas(leagueId, archived) });
  const ideas = (q.data ?? []).filter((i) => !filter || i.category === filter);
  const usedCategories = [...new Set((q.data ?? []).map((i) => i.category))];

  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Ideas</h1>
          <p className="text-sm text-slate-500">Vote up what you'd actually show up for.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSuggesting(true)} aria-label="Suggest ideas with Claude">
            <Sparkles size={16} className="text-accent-500" /> <span className="hidden sm:inline">Suggest</span>
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> Idea
          </Button>
        </div>
      </section>

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 text-sm">
        <button
          onClick={() => setArchived((a) => !a)}
          className={cx("shrink-0 rounded-full px-3 py-1 font-semibold ring-1", archived ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-600 ring-slate-200")}
        >
          {archived ? "Archived" : "Active"}
        </button>
        {usedCategories.length > 1 &&
          usedCategories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(filter === c ? null : c)}
              className={cx("shrink-0 rounded-full px-3 py-1 font-medium ring-1", filter === c ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-slate-600 ring-slate-200")}
            >
              {c}
            </button>
          ))}
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : ideas.length ? (
        <div className="space-y-2">
          {ideas.map((i) => (
            <IdeaCard
              key={i.id}
              leagueId={leagueId}
              idea={i}
              onSchedule={() => setPlanning({ title: i.title, category: i.category, description: i.description, location: i.location, ideaId: i.id })}
            />
          ))}
        </div>
      ) : (
        <Empty icon={<Lightbulb size={36} />} title={archived ? "Nothing archived" : "No ideas yet"}>
          {!archived && (
            <>
              Add one, or{" "}
              <button className="font-semibold text-brand-600" onClick={() => setSuggesting(true)}>
                let Claude suggest a few
              </button>
              .
            </>
          )}
        </Empty>
      )}

      <AddIdea leagueId={leagueId} open={adding} onClose={() => setAdding(false)} />
      <SuggestIdeas leagueId={leagueId} open={suggesting} onClose={() => setSuggesting(false)} />
      {planning && <EventForm leagueId={leagueId} open draft={planning} onClose={() => setPlanning(null)} />}
    </div>
  );
}
