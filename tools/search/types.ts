import type { SearchShape } from "../place/lib/geo";
import type { Point } from "../place/types";

/** Where to search, as the user described it. */
export type AreaInput =
  | { near: string; radiusM: number }
  | { latitude: number; longitude: number; radiusM: number }
  | { area: string; radiusM: number };

export interface SearchArea {
  /** What the area resolved to, e.g. "Dallas, Dallas County, Texas, United States". */
  description: string;
  center: Point;
  shape: SearchShape;
}

/** One match. latitude/longitude (or address) can be passed to the place tool. */
export interface SearchResult extends Point {
  name?: string;
  /** OSM tag ("amenity=cafe") or FEMA building use ("Industrial / Light"). */
  category: string;
  address?: string;
  /** Distance from the area's centre, in metres. */
  distanceM: number;
  /** Building footprint (ground area), for building results. */
  footprintSqft?: number;
  url?: string;
}
