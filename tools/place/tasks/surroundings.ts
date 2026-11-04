import type { PlaceContext } from "../context";
import { failureNote, notFound, ok } from "../lib/section";
import {
  fetchNearbyFeatures,
  OSM_ATTRIBUTION_URL,
  type OsmFeature,
} from "../sources/osm";
import type { SectionResult } from "../types";
import type { MappedFeature } from "./location";

export const SURROUNDINGS_RADIUS_M = 150;

export interface Surroundings {
  /** The mapped feature for this place (the building, business or landmark). */
  here?: MappedFeature;
  radiusM: number;
  /** Businesses, amenities, landmarks… nearest first. */
  nearby: OsmFeature[];
}

const SOURCE = { name: "OpenStreetMap contributors", url: OSM_ATTRIBUTION_URL };

/** Task: what's at and around this point? */
export const getSurroundings = async (
  ctx: PlaceContext
): Promise<SectionResult<Surroundings>> => {
  const [hereResult, nearbyResult] = await Promise.allSettled([
    ctx.mappedFeature(),
    fetchNearbyFeatures(ctx.point, SURROUNDINGS_RADIUS_M, {
      signal: ctx.signal,
    }),
  ]);

  if (hereResult.status === "rejected" && nearbyResult.status === "rejected") {
    throw hereResult.reason;
  }

  const here =
    hereResult.status === "fulfilled"
      ? (hereResult.value ?? undefined)
      : undefined;
  const nearby = nearbyResult.status === "fulfilled" ? nearbyResult.value : [];

  if (!here && nearby.length === 0) {
    return notFound(
      `Nothing mapped at this point or within ${SURROUNDINGS_RADIUS_M} m`,
      [SOURCE]
    );
  }

  const notes = [failureNote(hereResult), failureNote(nearbyResult)].filter(
    (note): note is string => Boolean(note)
  );

  return ok({ here, radiusM: SURROUNDINGS_RADIUS_M, nearby }, [SOURCE], notes);
};
