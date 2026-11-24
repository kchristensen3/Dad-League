import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { PlaceInput, PlaceSuggestion } from "../../../shared/schemas";
import { api } from "../api";
import { Input, cx } from "./ui";

const newSession = () => crypto.randomUUID();

/**
 * A location field with map search. Typing shows place suggestions; picking one fills in the
 * name and attaches the address and coordinates. Typing over a picked place goes back to plain
 * text. When the server has no maps key it's just a text input.
 */
export function LocationInput({
  leagueId,
  value,
  place,
  onChange,
}: {
  leagueId: string;
  value: string;
  place: PlaceInput | null;
  onChange: (value: string, place: PlaceInput | null) => void;
}) {
  const config = useQuery({ queryKey: ["authConfig"], queryFn: api.authConfig, staleTime: Infinity });
  const enabled = config.data?.maps ?? false;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newSession());
  const listId = useId();

  // Debounced search; each keystroke cancels the previous request.
  useEffect(() => {
    if (!enabled || place || value.trim().length < 2) return setSuggestions([]);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setSuggestions(await api.placeSuggestions(leagueId, value.trim(), session.current, ctrl.signal));
        setError(null);
        setActive(0);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, enabled, place, leagueId]);

  const pick = async (s: PlaceSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    onChange(s.name, null);
    try {
      const d = await api.placeDetails(leagueId, s.placeId, session.current);
      onChange(d.name || s.name, { placeId: d.placeId, address: d.address, lat: d.lat, lng: d.lng });
    } catch {
      setError("Couldn't load that place. It's saved as plain text.");
    } finally {
      session.current = newSession(); // one billing session per completed search
    }
  };

  const showList = enabled && open && !place && (suggestions.length > 0 || loading);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin size={16} className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", place ? "text-brand-500" : "text-slate-400")} />
        <Input
          className="pl-9 pr-9"
          maxLength={200}
          value={value}
          placeholder={enabled ? "Search for a place or type an address" : "Venue or address"}
          onChange={(e) => {
            onChange(e.target.value, null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList || suggestions.length === 0) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => (i + 1) % suggestions.length));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => (i - 1 + suggestions.length) % suggestions.length));
            if (e.key === "Enter") (e.preventDefault(), void pick(suggestions[active]!));
            if (e.key === "Escape") setOpen(false);
          }}
          role={enabled ? "combobox" : undefined}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Location"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => onChange("", null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Clear location"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>
      {place && <p className="mt-1 truncate pl-1 text-xs text-brand-700">📍 {place.address}</p>}
      {error && <p className="mt-1 pl-1 text-xs text-amber-700">{error}</p>}
      <AnimatePresence>
        {showList && suggestions.length > 0 && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200"
          >
            {suggestions.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(s)}
                  className={cx("flex w-full items-start gap-2.5 px-3 py-2.5 text-left", i === active ? "bg-brand-50" : "hover:bg-slate-50")}
                >
                  <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">{s.address}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="px-3 py-1.5 text-right text-[10px] text-slate-400">Powered by Google</li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
