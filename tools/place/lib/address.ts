// Loose US street-address comparison, for checking that a record found near a
// point (a building footprint, an OSM feature) belongs to the input address.

const DIRECTIONS = new Set([
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
]);

const HOUSE_NUMBER_AND_STREET = /^(\d+[A-Z]?)\s+(.+)$/;
const WHITESPACE = /\s+/;

/**
 * "1600 PENNSYLVANIA AVE NW, WASHINGTON…" → "1600 PENNSYLVANIA": the house
 * number plus the first street word that isn't a direction. Undefined when the
 * address doesn't start with a house number.
 */
export const addressKey = (address: string | null | undefined) => {
  const firstLine = (address ?? "").toUpperCase().split(",")[0].trim();
  const match = HOUSE_NUMBER_AND_STREET.exec(firstLine);

  if (!match) {
    return;
  }

  const street = match[2]
    .split(WHITESPACE)
    .find((word) => !DIRECTIONS.has(word));

  return street ? `${match[1]} ${street}` : undefined;
};

/**
 * False only when both addresses are comparable and clearly differ. Missing or
 * unparseable addresses don't count as a mismatch.
 */
export const addressesMayMatch = (
  a: string | null | undefined,
  b: string | null | undefined
) => {
  const keyA = addressKey(a);
  const keyB = addressKey(b);
  return !(keyA && keyB) || keyA === keyB;
};
