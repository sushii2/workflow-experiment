import { fetchRegridParcel, type RegridParcel } from "./sources/regrid";
import { findMappedFeature, type MappedFeature } from "./tasks/location";
import type { PlaceLocation, Point } from "./types";

/**
 * Everything a section needs. Shared lookups are memoized so sections that
 * read the same source (ownership, zoning and building all read the parcel)
 * pay for one request.
 */
export interface PlaceContext {
  location: PlaceLocation;
  point: Point;
  /** Pass to every request: aborts on caller cancel or when the deadline passes. */
  signal: AbortSignal;
  /** The caller's own signal. Only its abort should cancel the whole lookup. */
  callerSignal?: AbortSignal;
  /** The Regrid parcel for the place (null when none). Fetched on first use. */
  parcel: () => Promise<RegridParcel | null>;
  /** The OSM feature for the place (null when none). Fetched on first use. */
  mappedFeature: () => Promise<MappedFeature | null>;
}

/** Memoizes a lazy lookup so concurrent callers share one request. */
const once = <T>(load: () => Promise<T>) => {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= load();
    return promise;
  };
};

export const createPlaceContext = (
  location: PlaceLocation,
  {
    callerSignal,
    deadlineMs,
  }: { callerSignal?: AbortSignal; deadlineMs: number }
): PlaceContext => {
  const point = { latitude: location.latitude, longitude: location.longitude };
  const deadline = AbortSignal.timeout(deadlineMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, deadline])
    : deadline;

  return {
    location,
    point,
    signal,
    callerSignal,
    parcel: once(() =>
      fetchRegridParcel({ point, address: location.matchedAddress }, { signal })
    ),
    mappedFeature: once(() => findMappedFeature(location, { signal })),
  };
};
