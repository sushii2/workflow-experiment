// Small geometry helpers for area searches. Coordinates are WGS84 degrees.

import type { Point } from "../types";

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Polygon rings as [longitude, latitude] pairs (outer rings and holes). */
export type Rings = [number, number][][];

/** Where to search: a radius around a point, or an area's boundary. */
export type SearchShape =
  | { kind: "radius"; center: Point; radiusM: number }
  | { kind: "boundary"; center: Point; bbox: BBox; rings: Rings };

const METERS_PER_DEGREE_LAT = 111_320;

/** The box that encloses a circle of `radiusM` around `center`. */
export const bboxAround = (center: Point, radiusM: number): BBox => {
  const dLat = radiusM / METERS_PER_DEGREE_LAT;
  const dLon =
    radiusM /
    (METERS_PER_DEGREE_LAT * Math.cos((center.latitude * Math.PI) / 180));

  return {
    west: center.longitude - dLon,
    south: center.latitude - dLat,
    east: center.longitude + dLon,
    north: center.latitude + dLat,
  };
};

export const shapeBBox = (shape: SearchShape) =>
  shape.kind === "radius"
    ? bboxAround(shape.center, shape.radiusM)
    : shape.bbox;

/**
 * Even-odd point-in-polygon over every ring, which handles holes and
 * multipolygons without knowing which ring is which.
 */
export const pointInRings = (point: Point, rings: Rings) => {
  const { longitude: x, latitude: y } = point;
  let inside = false;

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }

  return inside;
};

/** Inside spans of a horizontal line at `latitude` (even-odd), as [west, east] pairs. */
const spansAt = (latitude: number, rings: Rings): [number, number][] => {
  const crossings: number[] = [];

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      if (yi > latitude !== yj > latitude) {
        crossings.push(((xj - xi) * (latitude - yi)) / (yj - yi) + xi);
      }
    }
  }

  crossings.sort((a, b) => a - b);

  const spans: [number, number][] = [];
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    spans.push([crossings[k], crossings[k + 1]]);
  }
  return spans;
};

/**
 * A point guaranteed to be inside the polygon. Centroids of L-shaped or
 * courtyard buildings can fall outside them, which would make a point lookup
 * find the wrong building. Uses `hint` (e.g. the centroid) when it's inside,
 * else the middle of the widest inside span on a few horizontal lines.
 */
export const interiorPoint = (rings: Rings, hint: Point): Point => {
  if (pointInRings(hint, rings)) {
    return hint;
  }

  const latitudes = rings.flat().map(([, lat]) => lat);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const candidates = [hint.latitude, 0.5, 0.25, 0.75].map((value, index) =>
    index === 0 ? value : south + (north - south) * value
  );

  let best: { point: Point; width: number } | undefined;

  for (const latitude of candidates) {
    for (const [west, east] of spansAt(latitude, rings)) {
      if (!best || east - west > best.width) {
        best = {
          point: { latitude, longitude: (west + east) / 2 },
          width: east - west,
        };
      }
    }
  }

  return best?.point ?? hint;
};
