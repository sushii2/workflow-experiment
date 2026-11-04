// OpenStreetMap geocoding via Nominatim (no key, User-Agent required).
// Public instance policy: at most 1 request/second, no bulk use.
// https://operations.osmfoundation.org/policies/nominatim/

import { fetchJson, sleep } from "../lib/http";
import type { Point } from "../types";

/** Override with a self-hosted instance for production volumes. */
const NOMINATIM_URL =
  process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";

/** Spacing between requests from this process, per the usage policy. */
const MIN_INTERVAL_MS = 1100;

export interface OsmPlace extends Point {
  name?: string;
  /** OSM category and type, e.g. "office=government", "building=house". */
  category: string;
  address: string;
  osmUrl?: string;
}

interface NominatimPlace {
  name?: string;
  category?: string;
  type?: string;
  display_name?: string;
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  lat?: string;
  lon?: string;
  error?: string;
}

let nextSlot = 0;

/** Waits for this process's next free request slot. */
const waitTurn = async (signal?: AbortSignal) => {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL_MS;

  if (at > now) {
    await sleep(at - now, signal);
  }
};

const toPlace = (place: NominatimPlace | undefined): OsmPlace | null => {
  const latitude = Number(place?.lat);
  const longitude = Number(place?.lon);

  if (
    !place ||
    place.error ||
    !place.category ||
    !place.display_name ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    name: place.name || undefined,
    category: `${place.category}=${place.type ?? "yes"}`,
    address: place.display_name,
    latitude,
    longitude,
    osmUrl:
      place.osm_type && place.osm_id
        ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`
        : undefined,
  };
};

const request = async <T>(
  path: "/search" | "/reverse",
  params: Record<string, string>,
  signal?: AbortSignal
) => {
  await waitTurn(signal);

  const url = new URL(path, NOMINATIM_URL);
  url.search = new URLSearchParams({ format: "jsonv2", ...params }).toString();

  return fetchJson<T>(url, {
    label: "OpenStreetMap (Nominatim)",
    timeoutMs: 8000,
    retries: 0,
    signal,
  });
};

/** The OSM feature for a US address (often the building itself). */
export const searchAddress = async (
  address: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<OsmPlace | null> => {
  const results = await request<NominatimPlace[]>(
    "/search",
    { q: address, limit: "1", countrycodes: "us" },
    signal
  );

  return toPlace(results[0]);
};

/** The mapped feature (building, business, road…) at or nearest a point. */
export const reverseGeocode = async (
  point: Point,
  { signal }: { signal?: AbortSignal } = {}
): Promise<OsmPlace | null> =>
  toPlace(
    await request<NominatimPlace>(
      "/reverse",
      {
        // 18 = building level.
        zoom: "18",
        lat: String(point.latitude),
        lon: String(point.longitude),
      },
      signal
    )
  );
