// USGS Elevation Point Query Service (no key).
// https://apps.nationalmap.gov/epqs/

import { fetchJson } from "../lib/http";
import type { Point } from "../types";

export const USGS_ELEVATION_URL = "https://epqs.nationalmap.gov/v1/json";

interface EpqsResponse {
  value?: number | string;
}

/** Ground elevation in feet, or null where USGS has no data (e.g. offshore). */
export const fetchElevationFt = async (
  point: Point,
  { signal }: { signal?: AbortSignal } = {}
): Promise<number | null> => {
  const url = new URL(USGS_ELEVATION_URL);
  url.search = new URLSearchParams({
    x: String(point.longitude),
    y: String(point.latitude),
    units: "Feet",
    wkid: "4326",
  }).toString();

  const body = await fetchJson<EpqsResponse>(url, {
    label: "USGS elevation",
    signal,
  });
  const value = Number(body.value);

  // EPQS returns -1000000 for "no data".
  if (!Number.isFinite(value) || value <= -100_000) {
    return null;
  }

  return Math.round(value * 10) / 10;
};
