// FEMA public ArcGIS services (no key): flood zones, the National Risk Index
// and USA Structures building footprints.

import { interiorPoint } from "../lib/geo";
import {
  type ArcgisGeometry,
  countArcgisLayer,
  queryArcgisFeatures,
  queryArcgisLayer,
} from "../lib/http";
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
      geometry: { kind: "point", point },
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
    geometry: byTract ? undefined : { kind: "point", point },
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
      geometry: { kind: "point", point },
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

// ---- USA Structures search (by use and size, within an area) ----

/**
 * FEMA occupancy classes and subtypes, as "Class" or "Class / Subtype".
 * Values are the layer's own (seen in Dallas County). There's no "warehouse"
 * class: warehouses are usually Industrial / Light or Commercial / Wholesale Trade.
 */
const BUILDING_USE_VALUES = {
  Agriculture: ["Agriculture", null],
  Assembly: ["Assembly", null],
  "Assembly / Community Center": ["Assembly", "Community Center"],
  "Assembly / Convention Center": ["Assembly", "Convention Center"],
  "Assembly / Indoor Arena": ["Assembly", "Indoor Arena"],
  "Assembly / Religious": ["Assembly", "Religious"],
  Commercial: ["Commercial", null],
  "Commercial / Entertainment and Recreation": [
    "Commercial",
    "Entertainment and Recreation",
  ],
  "Commercial / Hospital": ["Commercial", "Hospital"],
  "Commercial / Medical Office/Clinic": ["Commercial", "Medical Office/Clinic"],
  "Commercial / Parking": ["Commercial", "Parking"],
  "Commercial / Personal and Repair Services": [
    "Commercial",
    "Personal and Repair Services",
  ],
  "Commercial / Professional/Technical Services": [
    "Commercial",
    "Professional/Technical Services",
  ],
  "Commercial / Retail Trade": ["Commercial", "Retail Trade"],
  "Commercial / Theaters": ["Commercial", "Theaters"],
  "Commercial / Veterinary/Pet": ["Commercial", "Veterinary/Pet "],
  "Commercial / Wholesale Trade": ["Commercial", "Wholesale Trade"],
  Education: ["Education", null],
  "Education / Colleges/Universities": ["Education", "Colleges/Universities"],
  "Education / Pre-K - 12 Schools": ["Education", "Pre-K - 12 Schools"],
  "Education / Other Educational Buildings": [
    "Education",
    "Other Educational Buildings",
  ],
  Government: ["Government", null],
  "Government / Emergency Response": ["Government", "Emergency Response"],
  "Government / General Services": ["Government", "General Services"],
  "Government / Non-Civilian Structures": [
    "Government",
    "Non-Civilian Structures",
  ],
  Industrial: ["Industrial", null],
  "Industrial / Food/Drugs/Chemicals": ["Industrial", "Food/Drugs/Chemicals"],
  "Industrial / Heavy": ["Industrial", "Heavy"],
  "Industrial / Light": ["Industrial", "Light"],
  "Industrial / Metals/Minerals Processing": [
    "Industrial",
    "Metals/Minerals Processing",
  ],
  Residential: ["Residential", null],
  "Residential / Institutional Dormitory": [
    "Residential",
    "Institutional Dormitory",
  ],
  "Residential / Manufactured Home": ["Residential", "Manufactured Home"],
  "Residential / Multi - Family Dwelling": [
    "Residential",
    "Multi - Family Dwelling",
  ],
  "Residential / Nursing Home": ["Residential", "Nursing Home"],
  "Residential / Single Family Dwelling": [
    "Residential",
    "Single Family Dwelling",
  ],
  "Residential / Temporary Lodging": ["Residential", "Temporary Lodging"],
  "Utility and Misc": ["Utility and Misc", null],
  "Utility and Misc / Aviation": ["Utility and Misc", "Aviation"],
  "Utility and Misc / Energy Control Monitoring": [
    "Utility and Misc",
    "Energy Control Monitoring",
  ],
  "Utility and Misc / Ground": ["Utility and Misc", "Ground"],
} as const satisfies Record<string, readonly [string, string | null]>;

export type BuildingUse = keyof typeof BUILDING_USE_VALUES;

export const BUILDING_USES = Object.keys(BUILDING_USE_VALUES) as [
  BuildingUse,
  ...BuildingUse[],
];

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

const useClause = (use: BuildingUse) => {
  const [occupancyClass, subtype] = BUILDING_USE_VALUES[use];
  const classClause = `OCC_CLS=${sqlString(occupancyClass)}`;
  return subtype
    ? `(${classClause} AND PRIM_OCC=${sqlString(subtype)})`
    : classClause;
};

export interface StructureMatch extends Point {
  use: string;
  footprintSqft?: number;
  address?: string;
}

interface StructureSearchAttributes {
  OCC_CLS: string | null;
  PRIM_OCC: string | null;
  SQFEET: number | null;
  PROP_ADDR: string | null;
  PROP_CITY: string | null;
  PROP_ST: string | null;
  PROP_ZIP: string | null;
  LATITUDE: number | null;
  LONGITUDE: number | null;
}

/**
 * Buildings of the given uses and footprint size inside an area, largest
 * first, plus the total match count. Needs at least one filter: this layer
 * only answers area queries quickly when they're filtered.
 */
export const searchStructures = async (
  {
    geometry,
    uses,
    minSqft,
    maxSqft,
    limit,
  }: {
    geometry: ArcgisGeometry;
    uses: readonly BuildingUse[];
    minSqft?: number;
    maxSqft?: number;
    limit: number;
  },
  { signal }: { signal?: AbortSignal } = {}
): Promise<{ matches: StructureMatch[]; total: number }> => {
  const clauses = [
    uses.length ? `(${uses.map(useClause).join(" OR ")})` : undefined,
    minSqft === undefined ? undefined : `SQFEET>=${Math.floor(minSqft)}`,
    maxSqft === undefined ? undefined : `SQFEET<=${Math.ceil(maxSqft)}`,
  ].filter(Boolean);

  if (clauses.length === 0) {
    throw new Error("Building search needs a use or size filter");
  }

  const query = {
    label: "FEMA USA Structures",
    geometry,
    where: clauses.join(" AND "),
    signal,
  };

  const [rows, total] = await Promise.all([
    queryArcgisFeatures<StructureSearchAttributes>(USA_STRUCTURES_URL, {
      ...query,
      outFields: [
        "OCC_CLS",
        "PRIM_OCC",
        "SQFEET",
        "PROP_ADDR",
        "PROP_CITY",
        "PROP_ST",
        "PROP_ZIP",
        "LATITUDE",
        "LONGITUDE",
      ],
      orderBy: "SQFEET DESC",
      limit,
    }),
    countArcgisLayer(USA_STRUCTURES_URL, query),
  ]);

  const matches = rows.flatMap(({ attributes: row, rings }) => {
    if (row.LATITUDE === null || row.LONGITUDE === null) {
      return [];
    }

    // FEMA's LATITUDE/LONGITUDE is the centroid, which can sit outside
    // courtyard or L-shaped buildings; report a point that's inside.
    const centroid = { latitude: row.LATITUDE, longitude: row.LONGITUDE };
    const point = rings?.length ? interiorPoint(rings, centroid) : centroid;

    return [
      {
        use: [row.OCC_CLS, row.PRIM_OCC?.trim()].filter(Boolean).join(" / "),
        footprintSqft: row.SQFEET === null ? undefined : Math.round(row.SQFEET),
        address:
          [row.PROP_ADDR, row.PROP_CITY, row.PROP_ST, row.PROP_ZIP]
            .filter(Boolean)
            .join(", ") || undefined,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    ];
  });

  return { matches, total };
};
