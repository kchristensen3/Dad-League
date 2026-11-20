import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CATEGORIES, type Category, type EventItem, type PlaceInput, type RepeatRule } from "../../../shared/schemas";
import { api, browserTimezone } from "../api";
import { useLeague, useMe, useMembers } from "../hooks";
import { LocationInput } from "./LocationInput";
import { Avatar, Button, ErrorNote, Field, Input, Select, Sheet, Textarea, cx } from "./ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL = ["", "first", "second", "third", "fourth"];

/** Repeat choices that make sense for the picked date ("monthly on the first Thursday", etc.). */
function repeatOptions(date: string): { key: string; label: string; rule: RepeatRule | null }[] {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(y, m - 1, d);
  const weekday = day.getDay();
  const nth = Math.ceil(d / 7);
  const isLast = new Date(y, m - 1, d + 7).getMonth() !== m - 1;
  const name = WEEKDAYS[weekday]!;
  const opts: { key: string; label: string; rule: RepeatRule | null }[] = [
    { key: "none", label: "Just this once", rule: null },
    { key: "weekly", label: `Every ${name}`, rule: { freq: "weekly", weekday } },
    { key: "biweekly", label: `Every other ${name}`, rule: { freq: "biweekly", weekday } },
  ];
  if (nth <= 4) opts.push({ key: "monthly", label: `Monthly on the ${ORDINAL[nth]} ${name}`, rule: { freq: "monthly", weekday, nth } });
  if (isLast) opts.push({ key: "monthly-last", label: `Monthly on the last ${name}`, rule: { freq: "monthly", weekday, nth: 5 } });
  return opts;
}

export interface EventDraft {
  title?: string;
  category?: Category;
  description?: string;
  location?: string | null;
  ideaId?: string;
}

function defaultStart() {
  // Next Thursday-ish evening is a decent default for a dad hang: 7pm, 3 days out.
  const d = new Date(Date.now() + 3 * 86_400_000);
  d.setHours(19, 0, 0, 0);
  return d;
}

/** Create a new event (optionally prefilled from an idea) or edit an existing one. */
export function EventForm({
  leagueId,
  open,
  onClose,
  draft,
  existing,
}: {
  leagueId: string;
  open: boolean;
  onClose: () => void;
  draft?: EventDraft;
  existing?: EventItem;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const start = existing ? new Date(existing.startsAt) : defaultStart();
  const [title, setTitle] = useState(existing?.title ?? draft?.title ?? "");
  const [category, setCategory] = useState<Category>(existing?.category ?? draft?.category ?? "Casual Hangout");
  const [date, setDate] = useState(format(start, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(start, "HH:mm"));
  const [location, setLocation] = useState(existing?.location ?? draft?.location ?? "");
  const [place, setPlace] = useState<PlaceInput | null>(existing?.place ?? null);
  const [url, setUrl] = useState(existing?.url ?? "");
  const [description, setDescription] = useState(existing?.description ?? draft?.description ?? "");
  const [repeatKey, setRepeatKey] = useState("none");
  const [rotate, setRotate] = useState(true);
  const [rotation, setRotation] = useState<string[] | null>(null);
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const members = useMembers(leagueId);
  const options = useMemo(() => repeatOptions(date), [date]);
  const repeat = options.find((o) => o.key === repeatKey) ?? options[0]!;
  // Default rotation: everyone, starting with whoever is setting it up.
  const defaultRotation = useMemo(
    () => [...(members.data ?? [])].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0)).map((m) => m.id),
    [members.data, me?.id],
  );
  const chosen = rotation ?? defaultRotation;
  const toggleHost = (id: string) => setRotation(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  const saveSeries = useMutation({
    mutationFn: () =>
      api.createSeries(leagueId, {
        title,
        category,
        description,
        location: location || null,
        place,
        url: url || null,
        rule: repeat.rule!,
        timeOfDay: time,
        timezone: browserTimezone() ?? league.data?.timezone ?? "America/New_York",
        startsOn: date,
        hostRotation: rotate ? chosen : [],
      }),
    onSuccess: ({ firstEventId }) => {
      void qc.invalidateQueries({ queryKey: ["events", leagueId] });
      void qc.invalidateQueries({ queryKey: ["series", leagueId] });
      onClose();
      navigate(firstEventId ? `/l/${leagueId}/events/${firstEventId}` : `/l/${leagueId}/league`);
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        category,
        description,
        location: location || null,
        place,
        url: url || null,
        startsAt: new Date(`${date}T${time}`).toISOString(),
      };
      return existing
        ? api.updateEvent(leagueId, existing.id, body)
        : api.createEvent(leagueId, { ...body, ideaId: draft?.ideaId ?? null });
    },
    onSuccess: (event) => {
      void qc.invalidateQueries({ queryKey: ["events", leagueId] });
      qc.setQueryData(["event", leagueId, event.id], event);
      onClose();
      if (!existing) navigate(`/l/${leagueId}/events/${event.id}`);
    },
  });

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "Edit event" : "Plan something"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!existing && repeat.rule) saveSeries.mutate();
          else save.mutate();
        }}
      >
        <Field label="What">
          <Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tigers game, 9 holes, trivia…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {!existing && (
          <Field label="Repeats" hint={repeat.rule ? "A standing meetup: the next two dates stay on the calendar automatically." : undefined}>
            <Select value={repeat.key} onChange={(e) => setRepeatKey(e.target.value)}>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <AnimatePresence initial={false}>
          {!existing && repeat.rule && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 rounded-2xl bg-brand-50 p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-brand-800">
                  <span className="flex items-center gap-1.5">
                    <Repeat size={15} /> Rotate who hosts
                  </span>
                  <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="h-4 w-4 accent-brand-500" />
                </label>
                {rotate ? (
                  <>
                    <p className="text-xs text-brand-700">Hosts take turns in this order. Tap to include or skip someone.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(members.data ?? []).map((m) => {
                        const pos = chosen.indexOf(m.id);
                        return (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => toggleHost(m.id)}
                            aria-pressed={pos >= 0}
                            className={cx(
                              "flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 transition",
                              pos >= 0 ? "bg-white text-slate-800 ring-brand-300" : "bg-transparent text-slate-400 ring-slate-200 line-through",
                            )}
                          >
                            <Avatar user={m} size={20} />
                            {pos >= 0 && <span className="text-brand-500">{pos + 1}.</span>}
                            {m.name.split(" ")[0]}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-brand-700">You'll host every time.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Type">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Where" group>
          <LocationInput
            leagueId={leagueId}
            value={location ?? ""}
            place={place}
            onChange={(text, picked) => {
              setLocation(text);
              setPlace(picked);
            }}
          />
        </Field>
        <Field label="Link" hint="Tickets, menu, tee time…">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Details">
          <Textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything people should know" />
        </Field>
        <ErrorNote error={save.error ?? saveSeries.error} />
        <Button type="submit" className="w-full" loading={save.isPending || saveSeries.isPending}>
          {existing ? "Save changes" : repeat.rule ? "Start the standing meetup" : "Put it on the calendar"}
        </Button>
      </form>
    </Sheet>
  );
}
