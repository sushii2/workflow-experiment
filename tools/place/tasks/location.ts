import { geocodeAddress, lookupGeographiesAtPoint } from "../../geocode/census";
import { distanceMeters } from "../lib/http";
import {
  type OsmPlace,
  reverseGeocode,
  searchAddress,
} from "../sources/nominatim";
import type { PlaceLocation } from "../types";

/**
 * Census places address points by interpolating along the street, so they can
 * sit 100+ m from the building. Accept an OSM address match only within this
 * distance; further away it's probably a different place with the same address.
 */
const MAX_SEARCH_OFFSET_M = 250;

export interface MappedFeature extends OsmPlace {
  /** address_search: OSM matched the address. reverse: nearest mapped feature. */
  matchedBy: "address_search" | "reverse";
  /** Distance from the location point, in metres. */
  distanceM: number;
}

export type PlaceInput =
  | { address: string }
  | { latitude: number; longitude: number };

/**
 * Task: where is this place? Geocodes an address (via the geocode tool's
 * Census client) or looks up the Census geographies at a coordinate.
 * Returns null when an address can't be matched.
 */
export const resolveLocation = async (
  input: PlaceInput,
  { signal }: { signal?: AbortSignal } = {}
): Promise<PlaceLocation | null> => {
  if ("address" in input) {
    const { match } = await geocodeAddress(input.address, { signal });

    if (!match) {
      return null;
    }

    const { matchedAddress, latitude, longitude, ...geographies } = match;
    return { matchedAddress, latitude, longitude, geographies };
  }

  const { latitude, longitude } = input;

  return {
    latitude,
    longitude,
    geographies: await lookupGeographiesAtPoint(latitude, longitude, {
      signal,
    }),
  };
};

/**
 * Task: which mapped feature (building, business, landmark) is this place?
 * Searches OSM by address when there is one and the match is near the Census
 * point; otherwise takes the feature nearest the point.
 */
export const findMappedFeature = async (
  location: PlaceLocation,
  { signal }: { signal?: AbortSignal } = {}
): Promise<MappedFeature | null> => {
  const point = { latitude: location.latitude, longitude: location.longitude };
  const withDistance = (
    place: OsmPlace,
    matchedBy: MappedFeature["matchedBy"]
  ): MappedFeature => ({
    ...place,
    matchedBy,
    distanceM: Math.round(distanceMeters(point, place)),
  });

  if (location.matchedAddress) {
    try {
      const found = await searchAddress(location.matchedAddress, { signal });

      if (found) {
        const feature = withDistance(found, "address_search");

        if (feature.distanceM <= MAX_SEARCH_OFFSET_M) {
          return feature;
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      // Fall back to the reverse lookup below.
    }
  }

  const nearest = await reverseGeocode(point, { signal });
  return nearest ? withDistance(nearest, "reverse") : null;
};
