import type { PlaceContext } from "../context";
import { addressesMayMatch } from "../lib/address";
import { failureNote, notFound, ok, toNumber, toText } from "../lib/section";
import {
  fetchStructureAt,
  type Structure,
  USA_STRUCTURES_URL,
} from "../sources/fema";
import type { SectionResult, SourceRef } from "../types";

export interface Building {
  /** e.g. "Residential", "Commercial", "Government". */
  occupancyClass?: string;
  primaryUse?: string;
  secondaryUse?: string;
  footprintSqft?: number;
  yearBuilt?: number;
  stories?: number;
  style?: string;
  /** Buildings on the whole parcel, which can be more than this one. */
  buildingsOnParcel?: number;
  /** When the footprint was captured from imagery. */
  footprintImageDate?: string;
  /** FEMA's address for the footprint, to confirm it's the right building. */
  footprintAddress?: string;
  /**
   * How the footprint was found: contains_point (it contains the location
   * point) or mapped_feature (it contains the OSM feature for this address,
   * used when the geocoded point falls on the street).
   */
  footprintMatchedBy?: "contains_point" | "mapped_feature";
}

/** A footprint whose own address contradicts the input belongs to a neighbour. */
const belongsHere = (ctx: PlaceContext, structure: Structure | null) =>
  structure && addressesMayMatch(ctx.location.matchedAddress, structure.address)
    ? structure
    : null;

interface FoundStructure {
  structure: Structure;
  matchedBy: NonNullable<Building["footprintMatchedBy"]>;
}

/**
 * The FEMA footprint for this place: the one containing the location point,
 * else the one containing the OSM feature for the address.
 */
const findStructure = async (
  ctx: PlaceContext
): Promise<FoundStructure | null> => {
  const atPoint = belongsHere(
    ctx,
    await fetchStructureAt(ctx.point, { signal: ctx.signal })
  );

  if (atPoint) {
    return { structure: atPoint, matchedBy: "contains_point" };
  }

  // A failed OSM lookup just means there's no second point to try.
  const feature = await ctx.mappedFeature().catch(() => null);

  if (
    !feature ||
    feature.distanceM === 0 ||
    feature.category.startsWith("highway=")
  ) {
    return null;
  }

  const atFeature = belongsHere(
    ctx,
    await fetchStructureAt(feature, { signal: ctx.signal })
  );

  return atFeature
    ? { structure: atFeature, matchedBy: "mapped_feature" }
    : null;
};

/**
 * Task: what's the building here? Combines FEMA's footprint and occupancy
 * with the assessor's year built, stories and style from Regrid.
 */
export const getBuilding = async (
  ctx: PlaceContext
): Promise<SectionResult<Building>> => {
  const [structureResult, parcelResult] = await Promise.allSettled([
    findStructure(ctx),
    ctx.parcel(),
  ]);

  if (
    structureResult.status === "rejected" &&
    parcelResult.status === "rejected"
  ) {
    throw structureResult.reason;
  }

  const found =
    structureResult.status === "fulfilled" ? structureResult.value : null;
  const structure = found?.structure;
  const parcel =
    parcelResult.status === "fulfilled" ? parcelResult.value : null;
  const fields = parcel?.fields;

  const sources: SourceRef[] = [];

  if (structureResult.status === "fulfilled") {
    sources.push({ name: "FEMA USA Structures", url: USA_STRUCTURES_URL });
  }

  if (parcel) {
    sources.push({ name: "Regrid (county assessor data)", url: parcel.url });
  }

  const building: Building = {
    occupancyClass: structure?.occupancyClass,
    primaryUse: structure?.primaryOccupancy,
    secondaryUse: structure?.secondaryOccupancy,
    footprintSqft:
      structure?.footprintSqft ?? toNumber(fields?.ll_bldg_footprint_sqft),
    yearBuilt: toNumber(fields?.yearbuilt),
    stories: toNumber(fields?.numstories),
    style: toText(fields?.structstyle),
    buildingsOnParcel: toNumber(fields?.ll_bldg_count),
    footprintImageDate: structure?.imageDate,
    footprintAddress: structure?.address,
    footprintMatchedBy: found?.matchedBy,
  };

  if (Object.values(building).every((value) => value === undefined)) {
    return notFound("No building found for this place", sources);
  }

  const notes = [
    failureNote(structureResult),
    failureNote(parcelResult),
  ].filter((note): note is string => Boolean(note));

  return ok(building, sources, notes);
};
