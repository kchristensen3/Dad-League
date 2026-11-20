/**
 * Location search and maps via Google Maps Platform, called only from the server so the key
 * never reaches browsers. Autocomplete + details share a session token, which Google bills as
 * one search session.
 */
import type { PlaceDetails, PlaceSuggestion } from "../../shared/schemas.js";
import { env } from "../env.js";

const PLACES = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 5000;

export class MapsUnavailableError extends Error {}

function key() {
  if (!env.GOOGLE_MAPS_API_KEY) throw new MapsUnavailableError("Map search isn't set up on this server yet");
  return env.GOOGLE_MAPS_API_KEY;
}

async function google(url: string, init: RequestInit & { fieldMask?: string }): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key(),
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Log Google's reason (e.g. API not enabled, key restricted) so it's fixable from the deploy logs.
    console.error(`Google Maps request failed (${res.status}): ${body.slice(0, 300)}`);
    throw new Error(`maps request failed: ${res.status}`);
  }
  return res.json();
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}

/** Suggestions for what someone has typed so far, optionally biased toward where the league meets. */
export async function autocomplete(
  input: string,
  sessionToken: string,
  near?: { lat: number; lng: number } | null,
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = { input, sessionToken };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  const data = (await google(`${PLACES}/places:autocomplete`, { method: "POST", body: JSON.stringify(body) })) as AutocompleteResponse;
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 5)
    .map((p) => ({
      placeId: p.placeId!,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      address: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

interface DetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

export async function placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
  const q = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const data = (await google(`${PLACES}/places/${encodeURIComponent(placeId)}${q}`, {
    method: "GET",
    fieldMask: "id,displayName,formattedAddress,location",
  })) as DetailsResponse;
  if (data.location?.latitude === undefined || data.location.longitude === undefined) throw new Error("place has no location");
  return {
    placeId: data.id ?? placeId,
    name: data.displayName?.text ?? data.formattedAddress ?? "",
    address: data.formattedAddress ?? "",
    lat: data.location.latitude,
    lng: data.location.longitude,
  };
}

/** A map image with a pin, fetched server-side. */
export async function staticMap(lat: number, lng: number): Promise<{ body: ArrayBuffer; contentType: string }> {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "15",
    size: "640x320",
    scale: "2",
    markers: `color:0x326273|${lat},${lng}`,
    key: key(),
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.startsWith("image/")) {
    console.error(`Google static map failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    throw new Error(`static map failed: ${res.status}`);
  }
  return { body: await res.arrayBuffer(), contentType };
}
