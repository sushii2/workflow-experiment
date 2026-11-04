// OpenStreetMap features near a point, via the Overpass API (no key).
// https://wiki.openstreetmap.org/wiki/Overpass_API

import { distanceMeters, fetchJson } from "../lib/http";
import type { Point } from "../types";

/** Override with a private or less busy Overpass instance if needed. */
const OVERPASS_URL =
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

export const OSM_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";

/** Tag keys that mark something worth reporting as "what's here". */
const FEATURE_KEYS = [
  "amenity",
  "shop",
  "office",
  "tourism",
  "leisure",
  "healthcare",
  "craft",
  "historic",
  "public_transport",
] as const;

const MAX_FEATURES = 25;

export interface OsmFeature {
  name?: string;
  /** The tag that classifies it, e.g. "amenity=cafe". */
  category: string;
  distanceM: number;
  osmUrl: string;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Named or classified features within `radiusM` of a point, nearest first. */
export const fetchNearbyFeatures = async (
  point: Point,
  radiusM: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<OsmFeature[]> => {
  const around = `around:${radiusM},${point.latitude},${point.longitude}`;
  const query = [
    "[out:json][timeout:9];",
    "(",
    ...FEATURE_KEYS.map((key) => `nwr(${around})[${key}];`),
    ");",
    "out tags center 100;",
  ].join("");

  const body = await fetchJson<{ elements?: OverpassElement[] }>(OVERPASS_URL, {
    label: "OpenStreetMap (Overpass)",
    method: "POST",
    body: new URLSearchParams({ data: query }),
    // The public instance is often overloaded; fail fast rather than hold up
    // the whole lookup. Set OVERPASS_URL to a dedicated instance for reliability.
    timeoutMs: 10_000,
    retries: 0,
    signal,
  });

  return (body.elements ?? [])
    .flatMap((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const tags = element.tags ?? {};
      const key = FEATURE_KEYS.find((k) => tags[k]);

      if (lat === undefined || lon === undefined || !key) {
        return [];
      }

      return [
        {
          name: tags.name,
          category: `${key}=${tags[key]}`,
          distanceM: Math.round(
            distanceMeters(point, { latitude: lat, longitude: lon })
          ),
          osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        },
      ];
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_FEATURES);
};
