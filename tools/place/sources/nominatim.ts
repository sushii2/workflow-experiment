// OpenStreetMap geocoding via Nominatim (no key, User-Agent required).
// Public instance policy: at most 1 request/second, no bulk use.
// https://operations.osmfoundation.org/policies/nominatim/

import type { BBox, Rings } from "../lib/geo";
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

/** Nominatim returns at most this many results per search. */
export const NOMINATIM_MAX_RESULTS = 50;

/**
 * Features matching `query` inside a box. Use "[key=value]" to search an OSM
 * tag (e.g. "[amenity=cafe]") or plain text to match names. Returns at most
 * 50; `capped` says whether there may be more.
 */
export const searchInBox = async (
  query: string,
  bbox: BBox,
  { signal }: { signal?: AbortSignal } = {}
): Promise<{ places: OsmPlace[]; capped: boolean }> => {
  const results = await request<NominatimPlace[]>(
    "/search",
    {
      q: query,
      limit: String(NOMINATIM_MAX_RESULTS),
      bounded: "1",
      viewbox: `${bbox.west},${bbox.north},${bbox.east},${bbox.south}`,
    },
    signal
  );

  return {
    places: results.flatMap((result) => toPlace(result) ?? []),
    capped: results.length >= NOMINATIM_MAX_RESULTS,
  };
};

export interface OsmArea extends OsmPlace {
  bbox: BBox;
  /** Boundary rings, simplified (~500 m tolerance). Absent for point features. */
  rings?: Rings;
}

interface NominatimAreaResult extends NominatimPlace {
  boundingbox?: [string, string, string, string];
  geojson?:
    | { type: "Polygon"; coordinates: Rings }
    | { type: "MultiPolygon"; coordinates: Rings[] }
    | { type: string; coordinates: unknown };
}

/** A named US area (city, county, neighbourhood…) and its boundary. */
export const lookupArea = async (
  name: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<OsmArea | null> => {
  const [result] = await request<NominatimAreaResult[]>(
    "/search",
    {
      q: name,
      limit: "1",
      countrycodes: "us",
      polygon_geojson: "1",
      // Simplify the outline to keep it small enough to send to ArcGIS.
      polygon_threshold: "0.005",
    },
    signal
  );

  const place = toPlace(result);
  const box = result?.boundingbox?.map(Number);

  if (!(place && box?.every(Number.isFinite))) {
    return null;
  }

  const [south, north, west, east] = box;
  const { geojson } = result;
  let rings: Rings | undefined;

  if (geojson?.type === "Polygon") {
    rings = geojson.coordinates as Rings;
  } else if (geojson?.type === "MultiPolygon") {
    rings = (geojson.coordinates as Rings[]).flat();
  }

  return { ...place, bbox: { west, south, east, north }, rings };
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
