import { geocodeAddress } from "../../geocode/census";
import { lookupArea } from "../../place/sources/nominatim";
import type { Point } from "../../place/types";
import type { AreaInput, SearchArea } from "../types";

/**
 * Larger areas are refused: results would be an arbitrary sample, and the
 * building layer gets slow (a state-sized box took ~37 s).
 */
const MAX_AREA_SPAN_DEGREES = 1.5;

/** The area can't be searched; the message says why. */
export class AreaError extends Error {
  override name = "AreaError";
}

/**
 * Task: turn "near <address>", a coordinate or "in <area>" into a search
 * shape. Named areas use their real boundary, so "in Dallas" means the city,
 * not its bounding box.
 */
export const resolveSearchArea = async (
  input: AreaInput,
  { signal }: { signal?: AbortSignal } = {}
): Promise<SearchArea> => {
  const { radiusM } = input;

  const around = (point: Point, label: string): SearchArea => ({
    description: `${radiusM} m around ${label}`,
    center: point,
    shape: { kind: "radius", center: point, radiusM },
  });

  if ("latitude" in input) {
    return around(
      { latitude: input.latitude, longitude: input.longitude },
      `${input.latitude}, ${input.longitude}`
    );
  }

  if ("near" in input) {
    // A street address goes to the Census geocoder; landmarks and
    // neighbourhoods ("Union Square, San Francisco") fall back to OSM.
    const { match } = await geocodeAddress(input.near, { signal }).catch(
      () => ({ match: null })
    );

    if (match) {
      return around(
        { latitude: match.latitude, longitude: match.longitude },
        match.matchedAddress
      );
    }

    const place = await lookupArea(input.near, { signal });

    if (!place) {
      throw new AreaError(`Couldn't find "${input.near}"`);
    }

    return around(
      { latitude: place.latitude, longitude: place.longitude },
      place.address
    );
  }

  const area = await lookupArea(input.area, { signal });

  if (!area) {
    throw new AreaError(`Couldn't find an area called "${input.area}"`);
  }

  const center = { latitude: area.latitude, longitude: area.longitude };

  // A point-like result (a landmark, an address) has no boundary.
  if (!area.rings) {
    return around(center, area.address);
  }

  const { bbox } = area;

  if (
    bbox.east - bbox.west > MAX_AREA_SPAN_DEGREES ||
    bbox.north - bbox.south > MAX_AREA_SPAN_DEGREES
  ) {
    throw new AreaError(
      `"${input.area}" is too large to search. Narrow it to a city, county or neighbourhood.`
    );
  }

  return {
    description: area.address,
    center,
    shape: { kind: "boundary", center, bbox, rings: area.rings },
  };
};
