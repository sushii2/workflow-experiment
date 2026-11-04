// OpenStreetMap features near a point, via the Overpass API (no key).
// https://wiki.openstreetmap.org/wiki/Overpass_API

import type { BBox } from "../lib/geo";
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

/** An OSM tag filter, "key=value". Keys and values are restricted to safe characters. */
export const OSM_TAG = /^[a-z][a-z0-9_:]*=[A-Za-z0-9_:;.-]+$/;

export interface TaggedFeature extends Point {
  name?: string;
  category: string;
  /** Street address from the feature's addr:* tags, when mapped. */
  address?: string;
  osmUrl: string;
}

const addressFromTags = (tags: Record<string, string>) => {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const parts = [
    street,
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
};

/**
 * Features with an exact OSM tag inside a box. Covers tags Nominatim doesn't
 * index (e.g. power=substation), but the public server is often overloaded.
 */
export const fetchTaggedInBox = async (
  tag: string,
  bbox: BBox,
  limit: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<TaggedFeature[]> => {
  if (!OSM_TAG.test(tag)) {
    throw new Error(`Invalid OSM tag "${tag}"; use key=value`);
  }

  const [key, value] = tag.split("=");
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `[out:json][timeout:9];nwr["${key}"="${value}"](${box});out tags center ${limit};`;

  const body = await fetchJson<{ elements?: OverpassElement[] }>(OVERPASS_URL, {
    label: "OpenStreetMap (Overpass)",
    method: "POST",
    body: new URLSearchParams({ data: query }),
    timeoutMs: 10_000,
    retries: 0,
    signal,
  });

  return (body.elements ?? []).flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const tags = element.tags ?? {};

    if (latitude === undefined || longitude === undefined) {
      return [];
    }

    return [
      {
        name: tags.name,
        category: tag,
        address: addressFromTags(tags),
        latitude,
        longitude,
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      },
    ];
  });
};
