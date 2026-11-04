// US Census Geocoder client.
// https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

const CENSUS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

/** The Census Geocoder rejects addresses longer than this. */
export const MAX_ADDRESS_LENGTH = 100;

export interface GeocodeMatch {
  matchedAddress: string;
  latitude: number;
  longitude: number;
  state?: string;
  county?: string;
  place?: string;
  censusTract?: string;
  censusBlock?: string;
  congressionalDistrict?: string;
}

export interface GeocodeResult {
  input: string;
  match: GeocodeMatch | null;
}

interface CensusGeography {
  NAME?: string;
  GEOID?: string;
}

interface CensusAddressMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number };
  geographies?: Record<string, CensusGeography[] | undefined>;
}

interface CensusResponse {
  result?: { addressMatches?: CensusAddressMatch[] };
  errors?: string[];
}

// Some layer names carry a vintage (e.g. "120th Congressional Districts"),
// so look layers up by suffix rather than exact name.
const findLayer = (
  geographies: CensusAddressMatch["geographies"],
  suffix: string
) =>
  Object.entries(geographies ?? {}).find(([name]) =>
    name.endsWith(suffix)
  )?.[1]?.[0];

export const geocodeAddress = async (
  rawAddress: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<GeocodeResult> => {
  const address = rawAddress.replace(/\s+/g, " ").trim();

  if (!address) {
    throw new Error("Address cannot be empty");
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    throw new Error(
      `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer`
    );
  }

  const url = new URL(CENSUS_GEOCODER_URL);
  url.search = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  }).toString();

  const timeout = AbortSignal.timeout(20_000);

  const response = await fetch(url, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  const body = (await response
    .json()
    .catch(() => null)) as CensusResponse | null;

  if (!response.ok || body?.errors?.length) {
    throw new Error(
      body?.errors?.join(", ") ??
        `Census Geocoder request failed (${response.status})`
    );
  }

  const match = body?.result?.addressMatches?.[0];

  if (!match) {
    return { input: address, match: null };
  }

  const { geographies } = match;

  return {
    input: address,
    match: {
      matchedAddress: match.matchedAddress,
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      state: findLayer(geographies, "States")?.NAME,
      county: findLayer(geographies, "Counties")?.NAME,
      place: findLayer(geographies, "Incorporated Places")?.NAME,
      censusTract: findLayer(geographies, "Census Tracts")?.GEOID,
      censusBlock: findLayer(geographies, "Census Blocks")?.GEOID,
      congressionalDistrict: findLayer(geographies, "Congressional Districts")
        ?.NAME,
    },
  };
};
