import type { PlaceContext } from "../context";
import { notFound, ok, toText } from "../lib/section";
import type { SectionResult } from "../types";

export interface Zoning {
  /** Local zoning code, e.g. "R-2". */
  code?: string;
  description?: string;
  /** Regrid's standardized category, e.g. "Residential", "Planned". */
  type?: string;
  subtype?: string;
  /** Link to the municipal code section for this district. */
  codeUrl?: string;
}

const REGRID = "Regrid";

/**
 * Task: how is this parcel zoned? Regrid's coverage varies by city, so a
 * missing zoning code is reported as not_found rather than guessed.
 */
export const getZoning = async (
  ctx: PlaceContext
): Promise<SectionResult<Zoning>> => {
  const parcel = await ctx.parcel();

  if (!parcel) {
    return notFound("Regrid has no parcel at this point", [{ name: REGRID }]);
  }

  const f = parcel.fields;
  const zoning: Zoning = {
    code: toText(f.zoning),
    description: toText(f.zoning_description),
    type: toText(f.zoning_type),
    subtype: toText(f.zoning_subtype),
    codeUrl: toText(f.zoning_code_link),
  };

  if (!(zoning.code || zoning.type)) {
    return notFound(
      "Regrid has no zoning for this parcel. Check the city or county zoning map.",
      [{ name: REGRID, url: parcel.url }]
    );
  }

  return ok(zoning, [{ name: REGRID, url: parcel.url }]);
};
