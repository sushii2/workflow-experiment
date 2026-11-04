import type { PlaceContext } from "../context";
import { notFound, ok, runSection } from "../lib/section";
import {
  type FloodZone,
  fetchFloodZone,
  fetchNationalRiskIndex,
  type NationalRiskIndex,
  NFHL_FLOOD_ZONES_URL,
  NRI_TRACTS_URL,
} from "../sources/fema";
import { fetchActiveAlerts, type WeatherAlert } from "../sources/nws";
import { fetchElevationFt, USGS_ELEVATION_URL } from "../sources/usgs";
import type { SectionResult } from "../types";

const FLOOD_SOURCE = {
  name: "FEMA National Flood Hazard Layer",
  url: NFHL_FLOOD_ZONES_URL,
};
const NRI_SOURCE = { name: "FEMA National Risk Index", url: NRI_TRACTS_URL };
const ELEVATION_SOURCE = {
  name: "USGS 3DEP elevation",
  url: USGS_ELEVATION_URL,
};
const NWS_SOURCE = {
  name: "National Weather Service",
  url: "https://www.weather.gov/alerts",
};

/** Task: is this point in a FEMA flood zone? */
export const getFloodZone = async (
  ctx: PlaceContext
): Promise<SectionResult<FloodZone>> => {
  const zone = await fetchFloodZone(ctx.point, { signal: ctx.signal });

  return zone
    ? ok(zone, [FLOOD_SOURCE])
    : notFound("FEMA has no flood map for this point", [FLOOD_SOURCE]);
};

/** Task: how exposed is this area to natural hazards (by census tract)? */
export const getHazardIndex = async (
  ctx: PlaceContext
): Promise<SectionResult<NationalRiskIndex>> => {
  const index = await fetchNationalRiskIndex(
    {
      point: ctx.point,
      censusTract: ctx.location.geographies?.censusTract,
    },
    { signal: ctx.signal }
  );

  return index
    ? ok(index, [NRI_SOURCE])
    : notFound("No National Risk Index rating for this tract", [NRI_SOURCE]);
};

/** Task: how high is the ground here? */
export const getElevation = async (
  ctx: PlaceContext
): Promise<SectionResult<{ elevationFt: number }>> => {
  const elevationFt = await fetchElevationFt(ctx.point, { signal: ctx.signal });

  return elevationFt === null
    ? notFound("USGS has no elevation for this point", [ELEVATION_SOURCE])
    : ok({ elevationFt }, [ELEVATION_SOURCE]);
};

/** Task: are any weather watches or warnings in effect right now? */
export const getWeatherAlerts = async (
  ctx: PlaceContext
): Promise<SectionResult<{ alerts: WeatherAlert[] }>> =>
  ok({ alerts: await fetchActiveAlerts(ctx.point, { signal: ctx.signal }) }, [
    NWS_SOURCE,
  ]);

export interface Risk {
  flood: SectionResult<FloodZone>;
  hazards: SectionResult<NationalRiskIndex>;
  elevation: SectionResult<{ elevationFt: number }>;
  weatherAlerts: SectionResult<{ alerts: WeatherAlert[] }>;
}

/** Task: every risk factor, each failing independently. */
export const getRisk = async (ctx: PlaceContext): Promise<Risk> => {
  const run = <T>(task: (c: PlaceContext) => Promise<SectionResult<T>>) =>
    runSection(() => task(ctx), ctx.callerSignal);

  const [flood, hazards, elevation, weatherAlerts] = await Promise.all([
    run(getFloodZone),
    run(getHazardIndex),
    run(getElevation),
    run(getWeatherAlerts),
  ]);

  return { flood, hazards, elevation, weatherAlerts };
};
