import { tool } from "ai";
import { z } from "zod";
import { BUILDING_USES } from "../place/sources/fema";
import { OSM_TAG } from "../place/sources/osm";
import type { ServerToolDefinition } from "../types";
import { searchMeta } from "./meta";
import { searchAssets } from "./search";
import type { AreaInput } from "./types";

const inputSchema = z
  .object({
    near: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "Search around this US street address or landmark, within radiusMeters."
      ),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    area: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "Search inside this named US area's boundary: a city, county or neighbourhood, e.g. 'Dallas, TX' or 'Travis County, Texas'. States are too large."
      ),
    radiusMeters: z
      .number()
      .int()
      .min(50)
      .max(25_000)
      .default(1500)
      .describe("Radius for near or latitude/longitude searches."),
    osmTags: z
      .array(z.string().regex(OSM_TAG))
      .min(1)
      .max(3)
      .optional()
      .describe(
        "OpenStreetMap tags to find, as key=value. Examples: coffee shops amenity=cafe; restaurants amenity=restaurant; gas stations amenity=fuel; pharmacies amenity=pharmacy; hospitals amenity=hospital; hotels tourism=hotel; supermarkets shop=supermarket; hardware stores shop=hardware; banks amenity=bank; schools amenity=school; water towers man_made=water_tower; cell towers man_made=mast (large ones man_made=communications_tower); substations power=substation; warehouses building=warehouse."
      ),
    name: z
      .string()
      .min(2)
      .max(80)
      .optional()
      .describe("Business or brand name to match, e.g. 'Starbucks'."),
    buildingUses: z
      .array(z.enum(BUILDING_USES))
      .min(1)
      .max(6)
      .optional()
      .describe(
        "Find buildings by FEMA occupancy class (no names). Warehouses and distribution centers: 'Industrial / Light' and 'Commercial / Wholesale Trade'. Factories: 'Industrial / Heavy'. Offices: 'Commercial / Professional/Technical Services'. Stores: 'Commercial / Retail Trade'."
      ),
    minSqft: z
      .number()
      .positive()
      .optional()
      .describe("Minimum building footprint (ground area) in square feet."),
    maxSqft: z.number().positive().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine(
    (input) =>
      [
        input.near !== undefined,
        input.latitude !== undefined && input.longitude !== undefined,
        input.area !== undefined,
      ].filter(Boolean).length === 1,
    { message: "Pass exactly one of near, latitude+longitude, or area" }
  )
  .refine(
    (input) =>
      Boolean(
        input.osmTags?.length ||
          input.name ||
          input.buildingUses?.length ||
          input.minSqft !== undefined ||
          input.maxSqft !== undefined
      ),
    {
      message: "Say what to find: osmTags, name, buildingUses or a size filter",
    }
  );

type SearchInput = z.infer<typeof inputSchema>;

const toAreaInput = (input: SearchInput): AreaInput => {
  const radiusM = input.radiusMeters;

  if (input.near !== undefined) {
    return { near: input.near, radiusM };
  }

  if (input.area !== undefined) {
    return { area: input.area, radiusM };
  }

  if (input.latitude !== undefined && input.longitude !== undefined) {
    return { latitude: input.latitude, longitude: input.longitude, radiusM };
  }

  throw new Error("Pass exactly one of near, latitude+longitude, or area");
};

export const searchTool: ServerToolDefinition = {
  meta: searchMeta,
  tool: tool({
    description: [
      "Find businesses and physical assets in a US area: 'coffee shops near",
      "<address>', 'warehouses over 50k sqft in Dallas', 'substations in",
      "Travis County'. Use osmTags or name for businesses and mapped assets",
      "(OpenStreetMap), and buildingUses/minSqft/maxSqft for buildings by use",
      "and size (FEMA). Both can be combined. Each result has latitude,",
      "longitude and an address: pass one to the place tool for its owner,",
      "zoning, building and risk details. Sections report a status: say so",
      "when a source failed or results are truncated, rather than implying",
      "the list is complete. Building sizes are ground footprints, not floor area.",
    ].join(" "),
    inputSchema,
    execute: (input, { abortSignal }) =>
      searchAssets(
        toAreaInput(input),
        {
          osmTags: input.osmTags,
          name: input.name,
          buildingUses: input.buildingUses,
          minSqft: input.minSqft,
          maxSqft: input.maxSqft,
          limit: input.limit,
        },
        { signal: abortSignal }
      ),
  }),
};
