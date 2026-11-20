import { Navigation } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { EventItem } from "../../../shared/schemas";

const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent);

/** Map preview for an event's picked place, with one-tap directions in Google or Apple Maps. */
export function MapCard({ leagueId, event }: { leagueId: string; event: EventItem & { place: NonNullable<EventItem["place"]> } }) {
  const [failed, setFailed] = useState(false);
  const { place } = event;
  const name = event.location ?? place.address;
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(place.placeId)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&destination_place_id=${encodeURIComponent(place.placeId)}`;
  const apple = `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${place.lat},${place.lng}&address=${encodeURIComponent(place.address)}`;
  const buttons = isApple()
    ? [
        { label: "Apple Maps", href: apple },
        { label: "Google Maps", href: directions },
      ]
    : [
        { label: "Directions", href: directions },
        { label: "Apple Maps", href: apple },
      ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <a href={google} target="_blank" rel="noreferrer" className="relative block bg-slate-100" aria-label={`Open ${name} in Google Maps`}>
        {!failed ? (
          <img
            src={`/api/leagues/${leagueId}/events/${event.id}/map?p=${encodeURIComponent(place.placeId)}`}
            alt={`Map showing ${name}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="aspect-[2/1] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/1] items-center justify-center text-sm text-slate-400">Map preview unavailable. Tap for directions.</div>
        )}
      </a>
      <div className="space-y-2 bg-white p-3">
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-xs text-slate-500">{place.address}</p>
        </div>
        <div className="flex gap-2">
          {buttons.map((b, i) => (
            <a
              key={b.label}
              href={b.href}
              target="_blank"
              rel="noreferrer"
              className={
                i === 0
                  ? "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2 text-sm font-semibold text-white"
                  : "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-700"
              }
            >
              {i === 0 && <Navigation size={14} />} {b.label}
            </a>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
