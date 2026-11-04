import { tool } from "ai";
import { z } from "zod";
import type { ServerToolDefinition } from "../types";
import { geocodeAddress, MAX_ADDRESS_LENGTH } from "./census";
import { geocodeMeta } from "./meta";

export const geocodeTool: ServerToolDefinition = {
  meta: geocodeMeta,
  tool: tool({
    description: [
      "Geocode a single US street address with the US Census Geocoder.",
      "Returns the standardized matched address, latitude/longitude, and the",
      "state, county, place, congressional district, census tract and census",
      "block it falls in. Returns match: null if the address can't be found.",
      "Call once per address. Only works for US addresses.",
    ].join(" "),
    inputSchema: z.object({
      address: z
        .string()
        .min(1)
        .max(MAX_ADDRESS_LENGTH)
        .describe(
          "A full one-line US address, e.g. '1600 Pennsylvania Ave NW, Washington, DC 20500'"
        ),
    }),
    execute: ({ address }, { abortSignal }) =>
      geocodeAddress(address, { signal: abortSignal }),
  }),
};
