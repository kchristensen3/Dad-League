import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router";
import { CATEGORIES, type Category, type EventItem } from "../../../shared/schemas";
import { api } from "../api";
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from "./ui";

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
  const [url, setUrl] = useState(existing?.url ?? "");
  const [description, setDescription] = useState(existing?.description ?? draft?.description ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        category,
        description,
        location: location || null,
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
          save.mutate();
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
        <Field label="Type">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Where">
          <Input maxLength={200} value={location ?? ""} onChange={(e) => setLocation(e.target.value)} placeholder="Venue or address" />
        </Field>
        <Field label="Link" hint="Tickets, menu, tee time…">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Details">
          <Textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything people should know" />
        </Field>
        <ErrorNote error={save.error} />
        <Button type="submit" className="w-full" loading={save.isPending}>
          {existing ? "Save changes" : "Put it on the calendar"}
        </Button>
      </form>
    </Sheet>
  );
}
