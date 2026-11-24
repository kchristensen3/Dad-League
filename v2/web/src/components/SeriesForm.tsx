import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, type Category, type PlaceInput, type Series } from "../../../shared/schemas";
import { api } from "../api";
import { useMembers } from "../hooks";
import { LocationInput } from "./LocationInput";
import { RotationPicker } from "./RotationPicker";
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from "./ui";

/** Edit a standing meetup. Changes also apply to the dates already on the calendar. */
export function SeriesForm({ leagueId, series, onClose }: { leagueId: string; series: Series; onClose: () => void }) {
  const qc = useQueryClient();
  const members = useMembers(leagueId);
  const [title, setTitle] = useState(series.title);
  const [category, setCategory] = useState<Category>(series.category);
  const [time, setTime] = useState(series.timeOfDay);
  const [location, setLocation] = useState(series.location ?? "");
  const [place, setPlace] = useState<PlaceInput | null>(series.place);
  const [url, setUrl] = useState(series.url ?? "");
  const [description, setDescription] = useState(series.description);
  const [rotate, setRotate] = useState(series.rotation.length > 0);
  const [rotation, setRotation] = useState(series.rotation.map((u) => u.id));
  const [result, setResult] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.updateSeries(leagueId, series.id, {
        title,
        category,
        timeOfDay: time,
        location: location || null,
        place,
        url: url || null,
        description,
        hostRotation: rotate ? rotation : [],
      }),
    onSuccess: ({ changedDates }) => {
      void qc.invalidateQueries({ queryKey: ["series", leagueId] });
      void qc.invalidateQueries({ queryKey: ["events", leagueId] });
      void qc.invalidateQueries({ queryKey: ["event", leagueId] });
      setResult(changedDates ? `Saved, and updated the next ${changedDates === 1 ? "date" : `${changedDates} dates`}.` : "Saved.");
      setTimeout(onClose, 900);
    },
  });

  return (
    <Sheet open onClose={onClose} title="Edit standing meetup">
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Repeat size={13} className="shrink-0 text-brand-500" />
          <span>
            <span className="font-semibold text-slate-700">{series.label}.</span> Changes also apply to the upcoming dates, except anything
            someone changed on a single date.
          </span>
        </p>
        <Field label="What">
          <Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time">
            <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Where" group>
          <LocationInput
            leagueId={leagueId}
            value={location}
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
          <Textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <RotationPicker
          members={members.data ?? []}
          rotate={rotate}
          onRotateChange={setRotate}
          chosen={rotation}
          onChosenChange={setRotation}
          note="Applies to dates added from now on; hosts already assigned stay put (they can hand off)."
        />
        <p className="text-xs text-slate-400">To change how often it repeats, stop this one and start a new one.</p>
        <ErrorNote error={save.error} />
        {result && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}
        <Button type="submit" className="w-full" loading={save.isPending}>
          Save changes
        </Button>
      </form>
    </Sheet>
  );
}
