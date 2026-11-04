import { pointInRings, shapeBBox } from "../../place/lib/geo";
import { distanceMeters } from "../../place/lib/http";
import { notFound, ok } from "../../place/lib/section";
import { type OsmPlace, searchInBox } from "../../place/sources/nominatim";
import { fetchTaggedInBox, OSM_ATTRIBUTION_URL } from "../../place/sources/osm";
import type { SectionResult } from "../../place/types";
import type { SearchArea, SearchResult } from "../types";

const SOURCE = { name: "OpenStreetMap contributors", url: OSM_ATTRIBUTION_URL };

export interface PlaceSearch {
  results: SearchResult[];
  /** True when a source hit its result cap, so more matches may exist. */
  truncated: boolean;
}

type Candidate = Omit<SearchResult, "distanceM">;

const fromOsmPlace = (place: OsmPlace): Candidate => ({
  name: place.name,
  category: place.category,
  address: place.address,
  latitude: place.latitude,
  longitude: place.longitude,
  url: place.osmUrl,
});

const inArea = (area: SearchArea, candidate: Candidate) =>
  area.shape.kind === "radius"
    ? distanceMeters(area.center, candidate) <= area.shape.radiusM
    : pointInRings(candidate, area.shape.rings);

/** Nominatim first; Overpass for tags Nominatim doesn't index. */
const findTag = async (
  tag: string,
  area: SearchArea,
  limit: number,
  signal: AbortSignal | undefined,
  notes: string[]
): Promise<{ candidates: Candidate[]; capped: boolean }> => {
  const bbox = shapeBBox(area.shape);
  const { places, capped } = await searchInBox(`[${tag}]`, bbox, { signal });

  if (places.length > 0) {
    return {
      candidates: places.map(fromOsmPlace),
      capped,
    };
  }

  try {
    const features = await fetchTaggedInBox(tag, bbox, limit * 2, { signal });
    return {
      candidates: features.map((feature) => ({
        name: feature.name,
        category: feature.category,
        address: feature.address,
        latitude: feature.latitude,
        longitude: feature.longitude,
        url: feature.osmUrl,
      })),
      capped: features.length >= limit * 2,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    notes.push(
      `No ${tag} found via Nominatim, and the Overpass fallback failed (${(error as Error).message}), so some may be missing.`
    );
    return { candidates: [], capped: false };
  }
};

/**
 * Task: find businesses and mapped assets in an area, by OSM tag (e.g.
 * amenity=cafe) and/or name (e.g. "Starbucks"). Nearest to the centre first.
 */
export const searchPlaces = async (
  area: SearchArea,
  {
    osmTags = [],
    name,
    limit,
  }: { osmTags?: string[]; name?: string; limit: number },
  { signal }: { signal?: AbortSignal } = {}
): Promise<SectionResult<PlaceSearch>> => {
  const notes: string[] = [];
  let candidates: Candidate[];
  let truncated: boolean;

  if (name) {
    // Names are selective, so search by name and filter by tag afterwards.
    const { places, capped } = await searchInBox(name, shapeBBox(area.shape), {
      signal,
    });
    candidates = places
      .filter(
        (place) => osmTags.length === 0 || osmTags.includes(place.category)
      )
      .map(fromOsmPlace);
    truncated = capped;
  } else {
    const found = await Promise.all(
      osmTags.map((tag) => findTag(tag, area, limit, signal, notes))
    );
    candidates = found.flatMap((f) => f.candidates);
    truncated = found.some((f) => f.capped);
  }

  const seen = new Set<string>();
  const results = candidates
    .filter((candidate) => {
      const key =
        candidate.url ?? `${candidate.latitude},${candidate.longitude}`;
      if (seen.has(key) || !inArea(area, candidate)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      distanceM: Math.round(distanceMeters(area.center, candidate)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  if (results.length === 0) {
    return notFound(
      notes[0] ?? `Nothing in OpenStreetMap matches in ${area.description}`,
      [SOURCE]
    );
  }

  return ok(
    {
      results: results.slice(0, limit),
      truncated: truncated || results.length > limit,
    },
    [SOURCE],
    notes
  );
};
