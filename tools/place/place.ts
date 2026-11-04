// Everything about one point or address: what's there, the building, who owns
// it, the zoning and risk factors. Each section is a task function in
// ./tasks; this file only decides which to run and collects the results.

import { createPlaceContext } from "./context";
import { runSection } from "./lib/section";
import { type Building, getBuilding } from "./tasks/building";
import { type PlaceInput, resolveLocation } from "./tasks/location";
import { getOwnership, type Ownership } from "./tasks/ownership";
import { getRisk, type Risk } from "./tasks/risk";
import { getSurroundings, type Surroundings } from "./tasks/surroundings";
import { getZoning, type Zoning } from "./tasks/zoning";
import {
  PLACE_SECTIONS,
  type PlaceLocation,
  type PlaceSection,
  type SectionResult,
} from "./types";

export type { PlaceInput } from "./tasks/location";

export interface PlaceReport {
  location: PlaceLocation;
  surroundings?: SectionResult<Surroundings>;
  building?: SectionResult<Building>;
  ownership?: SectionResult<Ownership>;
  zoning?: SectionResult<Zoning>;
  risk?: Risk;
}

export type PlaceLookupResult =
  | ({ found: true } & PlaceReport)
  | { found: false; message: string };

/**
 * Shared time budget for all sections after geocoding. Keeps the tool well
 * inside the chat route's 60 s limit even if a source hangs; sections still
 * running are reported as errors.
 */
export const SECTIONS_DEADLINE_MS = 25_000;

export const lookupPlace = async (
  input: PlaceInput,
  {
    include = PLACE_SECTIONS,
    signal,
  }: { include?: readonly PlaceSection[]; signal?: AbortSignal } = {}
): Promise<PlaceLookupResult> => {
  const location = await resolveLocation(input, { signal });

  if (!location) {
    return {
      found: false,
      message:
        "The Census Geocoder couldn't match this address. Try a full street address with city and state, or pass coordinates.",
    };
  }

  const ctx = createPlaceContext(location, {
    callerSignal: signal,
    deadlineMs: SECTIONS_DEADLINE_MS,
  });
  const wants = new Set(include);
  const run = <T>(
    section: PlaceSection,
    task: (c: typeof ctx) => Promise<SectionResult<T>>
  ) => (wants.has(section) ? runSection(() => task(ctx), signal) : undefined);

  const [surroundings, building, ownership, zoning, risk] = await Promise.all([
    run("surroundings", getSurroundings),
    run("building", getBuilding),
    run("ownership", getOwnership),
    run("zoning", getZoning),
    wants.has("risk") ? getRisk(ctx) : undefined,
  ]);

  return {
    found: true,
    location,
    surroundings,
    building,
    ownership,
    zoning,
    risk,
  };
};
