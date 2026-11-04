import type { PlaceContext } from "../context";
import { notFound, ok, toNumber, toText } from "../lib/section";
import type { SectionResult } from "../types";

export interface Ownership {
  owner?: string;
  mailingAddress?: string;
  parcelNumber?: string;
  /** The assessor's land-use description, e.g. "SINGLE FAMILY RESIDENCE". */
  landUse?: string;
  acres?: number;
  /** Total parcel value and how the county defines it (e.g. "ASSESSED", "MARKET"). */
  parcelValue?: number;
  parcelValueType?: string;
  landValue?: number;
  improvementValue?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  legalDescription?: string;
  /** When Regrid last refreshed this parcel. */
  updatedAt?: string;
}

const REGRID = "Regrid (county assessor data)";

/** Task: who owns this parcel, and what is it worth on the tax roll? */
export const getOwnership = async (
  ctx: PlaceContext
): Promise<SectionResult<Ownership>> => {
  const parcel = await ctx.parcel();

  if (!parcel) {
    return notFound("Regrid has no parcel at this point", [{ name: REGRID }]);
  }

  const f = parcel.fields;
  const mailingAddress = [
    toText(f.mailadd),
    toText(f.mail_city),
    [toText(f.mail_state2), toText(f.mail_zip)].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return ok(
    {
      owner: toText(f.owner),
      mailingAddress: mailingAddress || undefined,
      parcelNumber: toText(f.parcelnumb),
      landUse: toText(f.usedesc) ?? toText(f.lbcs_activity_desc),
      acres: toNumber(f.ll_gisacre),
      parcelValue: toNumber(f.parval),
      parcelValueType: toText(f.parvaltype),
      landValue: toNumber(f.landval),
      improvementValue: toNumber(f.improvval),
      lastSalePrice: toNumber(f.saleprice),
      lastSaleDate: toText(f.saledate),
      legalDescription: toText(f.legaldesc),
      updatedAt: toText(f.ll_updated_at),
    },
    [{ name: REGRID, url: parcel.url }]
  );
};
