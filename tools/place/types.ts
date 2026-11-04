import type { CensusGeographies } from "../geocode/census";

/** Sections the place tool can fetch. Each maps to one task function. */
export const PLACE_SECTIONS = [
  "surroundings",
  "building",
  "ownership",
  "zoning",
  "risk",
] as const;

export type PlaceSection = (typeof PLACE_SECTIONS)[number];

export interface Point {
  latitude: number;
  longitude: number;
}

/** Where the place is. Every section is looked up from this. */
export interface PlaceLocation extends Point {
  /** Standardized address when the input was an address. */
  matchedAddress?: string;
  /** Census geographies, or null when the point is outside the US. */
  geographies: CensusGeographies | null;
}

/** Where a fact came from, so the model can cite it. */
export interface SourceRef {
  name: string;
  url?: string;
}

/**
 * The outcome of one section. Sections fail independently, so one bad source
 * never hides the others.
 * - ok: data found.
 * - not_found: the source answered but has nothing for this point.
 * - unavailable: the source can't be used here (e.g. missing or rejected key).
 * - error: the source failed (timeout, outage, bad response).
 */
export type SectionResult<T> =
  | {
      status: "ok";
      data: T;
      sources: SourceRef[];
      /** Sources that failed while others succeeded, so data may be partial. */
      notes?: string[];
    }
  | { status: "not_found"; message: string; sources: SourceRef[] }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };
