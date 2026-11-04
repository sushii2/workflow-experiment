import { tool } from "ai";
import { z } from "zod";
import { MAX_ADDRESS_LENGTH } from "../geocode/census";
import type { ServerToolDefinition } from "../types";
import { placeMeta } from "./meta";
import { lookupPlace } from "./place";
import { PLACE_SECTIONS } from "./types";

const inputSchema = z
  .object({
    address: z
      .string()
      .min(1)
      .max(MAX_ADDRESS_LENGTH)
      .optional()
      .describe(
        "A full one-line US address, e.g. '1600 Pennsylvania Ave NW, Washington, DC 20500'. Use this or latitude/longitude."
      ),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    include: z
      .array(z.enum(PLACE_SECTIONS))
      .min(1)
      .optional()
      .describe(
        "Sections to fetch. Omit for all. surroundings: businesses and landmarks within 150 m. building: use, footprint, year built, stories. ownership: owner, mailing address, parcel number, assessed and sale values. zoning: zoning code and link to the code. risk: FEMA flood zone, FEMA National Risk Index hazard ratings, elevation, active weather alerts."
      ),
  })
  .refine(
    (input) =>
      (input.address !== undefined) !==
      (input.latitude !== undefined && input.longitude !== undefined),
    { message: "Pass either address, or both latitude and longitude" }
  );

export const placeTool: ServerToolDefinition = {
  meta: placeMeta,
  tool: tool({
    description: [
      "Look up everything about one US address or coordinate in a single call:",
      "what's there, the building, who owns the parcel, its zoning, and risk factors.",
      "Geocodes addresses itself, so don't call the geocode tool first.",
      "Each section has a status: ok (with data and sources to cite), not_found,",
      "unavailable (source not configured) or error. Report sections that aren't",
      "ok as unknown; never fill them in. Use include to fetch only what's needed.",
    ].join(" "),
    inputSchema,
    execute: ({ address, latitude, longitude, include }, { abortSignal }) => {
      const options = { include, signal: abortSignal };

      if (address !== undefined) {
        return lookupPlace({ address }, options);
      }

      if (latitude !== undefined && longitude !== undefined) {
        return lookupPlace({ latitude, longitude }, options);
      }

      throw new Error("Pass either address, or both latitude and longitude");
    },
  }),
};
