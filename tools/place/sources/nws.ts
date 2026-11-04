// National Weather Service active alerts (no key, User-Agent required).
// https://www.weather.gov/documentation/services-web-api

import { fetchJson } from "../lib/http";
import type { Point } from "../types";

export const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active";

const MAX_ALERTS = 10;

export interface WeatherAlert {
  event: string;
  severity?: string;
  urgency?: string;
  headline?: string;
  effective?: string;
  ends?: string;
  issuedBy?: string;
}

interface NwsAlertsResponse {
  features?: {
    properties?: {
      event?: string;
      severity?: string;
      urgency?: string;
      headline?: string;
      effective?: string;
      ends?: string | null;
      expires?: string;
      senderName?: string;
    };
  }[];
}

/** Watches, warnings and advisories in effect at a point right now. */
export const fetchActiveAlerts = async (
  point: Point,
  { signal }: { signal?: AbortSignal } = {}
): Promise<WeatherAlert[]> => {
  // NWS accepts at most 4 decimal places.
  const url = `${NWS_ALERTS_URL}?point=${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;

  const body = await fetchJson<NwsAlertsResponse>(url, {
    label: "National Weather Service",
    headers: { Accept: "application/geo+json" },
    signal,
  });

  return (body.features ?? [])
    .flatMap(({ properties: p }) =>
      p?.event
        ? [
            {
              event: p.event,
              severity: p.severity,
              urgency: p.urgency,
              headline: p.headline,
              effective: p.effective,
              ends: p.ends ?? p.expires,
              issuedBy: p.senderName,
            },
          ]
        : []
    )
    .slice(0, MAX_ALERTS);
};
