// Find businesses and physical assets in an area: "coffee shops near X",
// "warehouses over 50k sqft in Dallas". Results carry coordinates and an
// address, so each can be handed to the place tool for details.

import { runSection } from "../place/lib/section";
import type { BuildingUse } from "../place/sources/fema";
import type { SectionResult } from "../place/types";
import { AreaError, resolveSearchArea } from "./tasks/area";
import { type BuildingSearch, searchBuildings } from "./tasks/buildings";
import { type PlaceSearch, searchPlaces } from "./tasks/places";
import type { AreaInput, SearchArea } from "./types";

/** Shared time budget for the searches, inside the chat route's 60 s limit. */
export const SEARCH_DEADLINE_MS = 25_000;

export interface SearchCriteria {
  /** OSM tags, e.g. ["amenity=cafe"]. */
  osmTags?: string[];
  /** Business or brand name, e.g. "Starbucks". */
  name?: string;
  buildingUses?: BuildingUse[];
  minSqft?: number;
  maxSqft?: number;
  limit: number;
}

export type SearchOutcome =
  | {
      found: true;
      area: Pick<SearchArea, "description" | "center"> & {
        /** "radius" or "boundary" (the area's real outline). */
        kind: SearchArea["shape"]["kind"];
      };
      /** Businesses and mapped assets (OpenStreetMap). */
      places?: SectionResult<PlaceSearch>;
      /** Buildings by use and size (FEMA USA Structures). */
      buildings?: SectionResult<BuildingSearch>;
    }
  | { found: false; message: string };

export const searchAssets = async (
  areaInput: AreaInput,
  criteria: SearchCriteria,
  { signal }: { signal?: AbortSignal } = {}
): Promise<SearchOutcome> => {
  let area: SearchArea;

  try {
    area = await resolveSearchArea(areaInput, { signal });
  } catch (error) {
    if (error instanceof AreaError) {
      return { found: false, message: error.message };
    }
    throw error;
  }

  const deadline = AbortSignal.timeout(SEARCH_DEADLINE_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;

  const wantsPlaces = Boolean(criteria.osmTags?.length || criteria.name);
  const wantsBuildings = Boolean(
    criteria.buildingUses?.length ||
      criteria.minSqft !== undefined ||
      criteria.maxSqft !== undefined
  );

  const [places, buildings] = await Promise.all([
    wantsPlaces
      ? runSection(
          () =>
            searchPlaces(
              area,
              {
                osmTags: criteria.osmTags,
                name: criteria.name,
                limit: criteria.limit,
              },
              { signal: requestSignal }
            ),
          signal
        )
      : undefined,
    wantsBuildings
      ? runSection(
          () =>
            searchBuildings(
              area,
              {
                uses: criteria.buildingUses,
                minSqft: criteria.minSqft,
                maxSqft: criteria.maxSqft,
                limit: criteria.limit,
              },
              { signal: requestSignal }
            ),
          signal
        )
      : undefined,
  ]);

  return {
    found: true,
    area: {
      description: area.description,
      center: area.center,
      kind: area.shape.kind,
    },
    places,
    buildings,
  };
};
