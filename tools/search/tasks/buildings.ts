import { distanceMeters } from "../../place/lib/http";
import { notFound, ok } from "../../place/lib/section";
import {
  type BuildingUse,
  searchStructures,
  USA_STRUCTURES_URL,
} from "../../place/sources/fema";
import type { SectionResult } from "../../place/types";
import type { SearchArea, SearchResult } from "../types";

const SOURCE = { name: "FEMA USA Structures", url: USA_STRUCTURES_URL };

export interface BuildingSearch {
  results: SearchResult[];
  /** Every building in the area that matches, not just those returned. */
  totalMatches: number;
}

/**
 * Task: find buildings in an area by use (FEMA occupancy class) and footprint
 * size, largest first.
 */
export const searchBuildings = async (
  area: SearchArea,
  {
    uses = [],
    minSqft,
    maxSqft,
    limit,
  }: {
    uses?: BuildingUse[];
    minSqft?: number;
    maxSqft?: number;
    limit: number;
  },
  { signal }: { signal?: AbortSignal } = {}
): Promise<SectionResult<BuildingSearch>> => {
  const { shape } = area;
  const { matches, total } = await searchStructures(
    {
      geometry:
        shape.kind === "radius"
          ? { kind: "point", point: shape.center, distanceM: shape.radiusM }
          : { kind: "polygon", rings: shape.rings },
      uses,
      minSqft,
      maxSqft,
      limit,
    },
    { signal }
  );

  if (matches.length === 0) {
    return notFound(`No matching buildings in ${area.description}`, [SOURCE]);
  }

  return ok(
    {
      totalMatches: total,
      results: matches.map((match) => ({
        category: match.use,
        address: match.address,
        latitude: match.latitude,
        longitude: match.longitude,
        footprintSqft: match.footprintSqft,
        distanceM: Math.round(distanceMeters(area.center, match)),
      })),
    },
    [SOURCE]
  );
};
