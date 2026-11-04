// Regrid parcel API: parcel boundaries, ownership, assessor and zoning data
// for US counties. https://support.regrid.com/docs/search-parcels

import { fetchJson, HttpError, SourceUnavailableError } from "../lib/http";
import type { Point } from "../types";

const REGRID_BASE_URL = "https://app.regrid.com";

/** Standardized Regrid schema fields we use. Counties fill them unevenly. */
export interface RegridParcelFields {
  parcelnumb?: string;
  owner?: string;
  mailadd?: string;
  mail_city?: string;
  mail_state2?: string;
  mail_zip?: string;
  address?: string;
  scity?: string;
  state2?: string;
  szip5?: string;
  county?: string;
  usecode?: string;
  usedesc?: string;
  lbcs_activity_desc?: string;
  lbcs_site_desc?: string;
  zoning?: string;
  zoning_description?: string;
  zoning_type?: string;
  zoning_subtype?: string;
  zoning_code_link?: string;
  struct?: boolean;
  yearbuilt?: number | string;
  numstories?: number | string;
  structstyle?: string;
  ll_bldg_count?: number | string;
  ll_bldg_footprint_sqft?: number | string;
  parvaltype?: string;
  parval?: number | string;
  landval?: number | string;
  improvval?: number | string;
  saleprice?: number | string;
  saledate?: string;
  ll_gisacre?: number | string;
  legaldesc?: string;
  ll_updated_at?: string;
}

export interface RegridParcel {
  /** Public parcel page on regrid.com. */
  url: string;
  fields: RegridParcelFields;
}

interface RegridResponse {
  parcels?: {
    features?: {
      properties?: { path?: string; fields?: RegridParcelFields };
    }[];
  };
}

const getToken = () => {
  const token = process.env.REGRID_API_KEY?.trim();

  if (!token) {
    throw new SourceUnavailableError("REGRID_API_KEY is not set");
  }

  return token;
};

const queryRegrid = async (
  endpoint: "point" | "address",
  params: Record<string, string>,
  signal: AbortSignal | undefined
): Promise<RegridParcel | null> => {
  const url = new URL(`/api/v2/parcels/${endpoint}`, REGRID_BASE_URL);
  url.search = new URLSearchParams({
    ...params,
    limit: "1",
    return_geometry: "false",
    token: getToken(),
  }).toString();

  let body: RegridResponse;

  try {
    body = await fetchJson<RegridResponse>(url, {
      label: "Regrid",
      signal,
    });
  } catch (error) {
    if (
      error instanceof HttpError &&
      (error.status === 401 || error.status === 403)
    ) {
      const message = (error.body as { message?: string } | undefined)?.message;
      throw new SourceUnavailableError(
        `Regrid rejected REGRID_API_KEY${message ? `: ${message}` : ""}`,
        { cause: error }
      );
    }

    throw error;
  }

  const properties = body.parcels?.features?.[0]?.properties;

  if (!properties?.fields) {
    return null;
  }

  return {
    url: new URL(properties.path ?? "/", REGRID_BASE_URL).toString(),
    fields: properties.fields,
  };
};

/**
 * The parcel for an address or point, or null when Regrid has none. Searches
 * by address first when one is given, because geocoded address points often
 * fall on the street rather than inside the parcel.
 */
export const fetchRegridParcel = async (
  { point, address }: { point: Point; address?: string },
  { signal }: { signal?: AbortSignal } = {}
): Promise<RegridParcel | null> => {
  if (address) {
    const parcel = await queryRegrid("address", { query: address }, signal);

    if (parcel) {
      return parcel;
    }
  }

  return queryRegrid(
    "point",
    { lat: String(point.latitude), lon: String(point.longitude) },
    signal
  );
};
