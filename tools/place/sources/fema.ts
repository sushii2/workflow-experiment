// FEMA public ArcGIS services (no key): flood zones, the National Risk Index
// and USA Structures building footprints.

import { queryArcgisLayer } from "../lib/http";
import type { Point } from "../types";

export const NFHL_FLOOD_ZONES_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";

export const NRI_TRACTS_URL =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0";

export const USA_STRUCTURES_URL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0";

// ---- Flood zone (National Flood Hazard Layer) ----

export interface FloodZone {
  /** FEMA flood zone code, e.g. "AE", "VE", "X". */
  zone: string;
  subtype?: string;
  /** In the 1%-annual-chance ("100-year") floodplain, where flood insurance is usually required. */
  inSpecialFloodHazardArea: boolean;
  baseFloodElevationFt?: number;
}

interface NfhlAttributes {
  FLD_ZONE: string | null;
  ZONE_SUBTY: string | null;
  SFHA_TF: string | null;
  STATIC_BFE: number | null;
}

/** The FEMA flood zone at a point, or null where FEMA hasn't mapped one. */
export const fetchFloodZone = async (
  point: Point,
  { signal }: { signal?: AbortSignal } = {}
): Promise<FloodZone | null> => {
  const [attributes] = await queryArcgisLayer<NfhlAttributes>(
    NFHL_FLOOD_ZONES_URL,
    {
      label: "FEMA flood map",
      point,
      // hazards.fema.gov drops roughly half of TLS handshakes; attempts are
      // cheap (~0.3 s), so retry harder than other sources.
      retries: 4,
      outFields: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF", "STATIC_BFE"],
      signal,
    }
  );

  if (!attributes?.FLD_ZONE) {
    return null;
  }

  return {
    zone: attributes.FLD_ZONE,
    subtype: attributes.ZONE_SUBTY ?? undefined,
    inSpecialFloodHazardArea: attributes.SFHA_TF === "T",
    // -9999 means "no base flood elevation".
    baseFloodElevationFt:
      attributes.STATIC_BFE !== null && attributes.STATIC_BFE > -9999
        ? attributes.STATIC_BFE
        : undefined,
  };
};

// ---- National Risk Index (per census tract) ----

const NRI_HAZARDS = {
  AVLN: "avalanche",
  CFLD: "coastalFlooding",
  CWAV: "coldWave",
  DRGT: "drought",
  ERQK: "earthquake",
  HAIL: "hail",
  HWAV: "heatWave",
  HRCN: "hurricane",
  ISTM: "iceStorm",
  IFLD: "inlandFlooding",
  LNDS: "landslide",
  LTNG: "lightning",
  SWND: "strongWind",
  TRND: "tornado",
  TSUN: "tsunami",
  VLCN: "volcanicActivity",
  WFIR: "wildfire",
  WNTW: "winterWeather",
} as const;

type NriHazard = (typeof NRI_HAZARDS)[keyof typeof NRI_HAZARDS];

/** An 11-digit census tract GEOID (state + county + tract). */
const TRACT_GEOID = /^\d{11}$/;

/** Ratings that say the hazard doesn't apply or wasn't scored. */
const UNRATED = new Set(["Not Applicable", "No Rating", "Insufficient Data"]);

export interface NationalRiskIndex {
  censusTract: string;
  version?: string;
  /** Composite risk score, 0–100 (percentile among all US tracts). */
  riskScore?: number;
  /** e.g. "Very Low" … "Very High". */
  riskRating?: string;
  expectedAnnualLossRating?: string;
  socialVulnerabilityRating?: string;
  communityResilienceRating?: string;
  /** Per-hazard risk rating. Hazards that don't apply are left out. */
  hazards: Partial<Record<NriHazard, string>>;
}

type NriAttributes = Record<string, string | number | null>;

/**
 * FEMA National Risk Index for the census tract, looked up by tract GEOID when
 * known (exact) or else by point.
 */
export const fetchNationalRiskIndex = async (
  { point, censusTract }: { point: Point; censusTract?: string },
  { signal }: { signal?: AbortSignal } = {}
): Promise<NationalRiskIndex | null> => {
  const byTract = censusTract && TRACT_GEOID.test(censusTract);

  const [attributes] = await queryArcgisLayer<NriAttributes>(NRI_TRACTS_URL, {
    label: "FEMA National Risk Index",
    point: byTract ? undefined : point,
    where: byTract ? `TRACTFIPS='${censusTract}'` : undefined,
    outFields: [
      "TRACTFIPS",
      "NRI_VER",
      "RISK_SCORE",
      "RISK_RATNG",
      "EAL_RATNG",
      "SOVI_RATNG",
      "RESL_RATNG",
      ...Object.keys(NRI_HAZARDS).map((code) => `${code}_RISKR`),
    ],
    signal,
  });

  if (!attributes?.TRACTFIPS) {
    return null;
  }

  const text = (key: string) => {
    const value = attributes[key];
    return typeof value === "string" && !UNRATED.has(value) ? value : undefined;
  };

  const hazards: NationalRiskIndex["hazards"] = {};

  for (const [code, name] of Object.entries(NRI_HAZARDS)) {
    const rating = text(`${code}_RISKR`);
    if (rating) {
      hazards[name] = rating;
    }
  }

  return {
    censusTract: String(attributes.TRACTFIPS),
    version: text("NRI_VER"),
    riskScore:
      typeof attributes.RISK_SCORE === "number"
        ? Math.round(attributes.RISK_SCORE * 10) / 10
        : undefined,
    riskRating: text("RISK_RATNG"),
    expectedAnnualLossRating: text("EAL_RATNG"),
    socialVulnerabilityRating: text("SOVI_RATNG"),
    communityResilienceRating: text("RESL_RATNG"),
    hazards,
  };
};

// ---- USA Structures (building footprints) ----

export interface Structure {
  /** e.g. "Residential", "Commercial", "Government". */
  occupancyClass?: string;
  primaryOccupancy?: string;
  secondaryOccupancy?: string;
  footprintSqft?: number;
  address?: string;
  /** When the footprint was captured from imagery (ISO date). */
  imageDate?: string;
}

interface StructureAttributes {
  OCC_CLS: string | null;
  PRIM_OCC: string | null;
  SEC_OCC: string | null;
  SQFEET: number | null;
  PROP_ADDR: string | null;
  IMAGE_DATE: number | null;
}

/**
 * The building footprint containing a point, or null if there isn't one.
 * Only point-in-polygon queries are fast on this layer (~125M footprints);
 * radius and envelope queries time out, so don't add them.
 */
export const fetchStructureAt = async (
  point: Point,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Structure | null> => {
  const [attributes] = await queryArcgisLayer<StructureAttributes>(
    USA_STRUCTURES_URL,
    {
      label: "FEMA USA Structures",
      point,
      outFields: [
        "OCC_CLS",
        "PRIM_OCC",
        "SEC_OCC",
        "SQFEET",
        "PROP_ADDR",
        "IMAGE_DATE",
      ],
      signal,
    }
  );

  if (!attributes) {
    return null;
  }

  return {
    occupancyClass: attributes.OCC_CLS ?? undefined,
    primaryOccupancy: attributes.PRIM_OCC ?? undefined,
    secondaryOccupancy: attributes.SEC_OCC ?? undefined,
    footprintSqft:
      attributes.SQFEET === null ? undefined : Math.round(attributes.SQFEET),
    address: attributes.PROP_ADDR ?? undefined,
    imageDate: attributes.IMAGE_DATE
      ? new Date(attributes.IMAGE_DATE).toISOString().slice(0, 10)
      : undefined,
  };
};
