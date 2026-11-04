// Shared HTTP helpers for place data sources.

import type { Point } from "../types";

/** Some public APIs (NWS, Overpass) require an identifying User-Agent. */
export const USER_AGENT =
  "tersa-place-tool (+https://github.com/vercel-labs/tersa)";

/** A source that can't be used here, such as a missing or rejected API key. */
export class SourceUnavailableError extends Error {
  override name = "SourceUnavailableError";
}

export class HttpError extends Error {
  override name = "HttpError";
  readonly status?: number;
  /** Parsed JSON error body, when the server sent one. */
  readonly body?: unknown;

  constructor(
    message: string,
    status?: number,
    body?: unknown,
    cause?: unknown
  ) {
    super(message, { cause });
    this.status = status;
    this.body = body;
  }
}

const isRetryableStatus = (status: number) =>
  status === 429 || status === 502 || status === 503 || status === 504;

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });

export interface FetchJsonOptions {
  /** Name used in error messages. URLs are never included (they may hold keys). */
  label: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Extra attempts after a network error, retryable status or non-JSON body. */
  retries?: number;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
}

type AttemptResult<T> =
  | { done: true; value: T }
  | { done: false; error: HttpError };

/** One request. Returns a retryable failure, or throws a final one. */
const attemptFetch = async <T>(
  url: string | URL,
  {
    label,
    signal,
    timeoutMs,
    method,
    headers,
    body,
  }: FetchJsonOptions & {
    timeoutMs: number;
  }
): Promise<AttemptResult<T>> => {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  let json: T | undefined;

  try {
    response = await fetch(url, {
      method,
      body,
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    json = (await response.json().catch(() => undefined)) as T | undefined;
  } catch (cause) {
    if (signal?.aborted) {
      throw signal.reason;
    }

    const message = timeout.aborted
      ? `${label} timed out after ${timeoutMs / 1000}s`
      : `${label} request failed`;
    return {
      done: false,
      error: new HttpError(message, undefined, undefined, cause),
    };
  }

  if (signal?.aborted) {
    throw signal.reason;
  }

  if (response.ok && json !== undefined) {
    return { done: true, value: json };
  }

  const error = new HttpError(
    response.ok
      ? `${label} returned an invalid response`
      : `${label} request failed (${response.status})`,
    response.status,
    json
  );

  // A bad body on a 200, or a transient status, is worth another try.
  // Anything else (401, 404…) goes straight back to the caller.
  if (response.ok || isRetryableStatus(response.status)) {
    return { done: false, error };
  }

  throw error;
};

/**
 * Fetches JSON with a per-attempt timeout and retries for transient failures.
 * Caller aborts are never retried.
 */
export const fetchJson = async <T>(
  url: string | URL,
  { timeoutMs = 15_000, retries = 1, ...options }: FetchJsonOptions,
  attempt = 0
): Promise<T> => {
  const result = await attemptFetch<T>(url, { ...options, timeoutMs });

  if (result.done) {
    return result.value;
  }

  if (attempt >= retries) {
    throw result.error;
  }

  await sleep(500 * (attempt + 1), options.signal);
  return fetchJson<T>(url, { ...options, timeoutMs, retries }, attempt + 1);
};

interface ArcgisResponse<A> {
  features?: { attributes: A }[];
  error?: { message?: string };
}

/**
 * Queries a public ArcGIS Feature/Map Server layer for features at a point,
 * or matching a where clause.
 */
export const queryArcgisLayer = async <A>(
  layerUrl: string,
  {
    label,
    point,
    where,
    outFields,
    retries,
    signal,
  }: {
    label: string;
    point?: Point;
    where?: string;
    outFields: string[];
    retries?: number;
    signal?: AbortSignal;
  }
): Promise<A[]> => {
  const params = new URLSearchParams({
    f: "json",
    outFields: outFields.join(","),
    returnGeometry: "false",
    where: where ?? "1=1",
  });

  if (point) {
    params.set("geometry", `${point.longitude},${point.latitude}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("inSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
  }

  const body = await fetchJson<ArcgisResponse<A>>(
    `${layerUrl}/query?${params}`,
    { label, retries, signal }
  );

  if (body.error) {
    throw new HttpError(
      `${label} query failed: ${body.error.message ?? "unknown error"}`
    );
  }

  return (body.features ?? []).map((feature) => feature.attributes);
};

/** Great-circle distance in metres. */
export const distanceMeters = (a: Point, b: Point) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
