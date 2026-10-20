/** Comp-4 Path Guard — standalone API client (not wired to Comp-1/2/3). */

export type ThreatEvent = {
  _id: string;
  source: string;
  threat_level: number;
  threat_intensity_penalty?: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  description?: string;
  elephant_behavior?: string;
  status: string;
  confidence_score?: number;
  radius_meters?: number;
  decay_factor?: number;
  effective_penalty?: number;
  createdAt?: string;
};

/** Backend may return [lng, lat] pairs or { latitude, longitude } objects. */
export type RouteCoord =
  | [number, number]
  | { latitude: number; longitude: number };

export type RouteCoords = RouteCoord[];

export type SafePathResponse = {
  success: boolean;
  data?: {
    safe_route: {
      coordinates: RouteCoords;
      total_cost: number;
      type: string;
    };
    shortest_route: {
      coordinates: RouteCoords;
      total_cost: number;
      threats_on_path: number;
      type: string;
    };
    active_threats_count: number;
  };
  error?: string;
};

export type SightingResult = {
  success: boolean;
  message?: string;
  data?: {
    sighting_id: string;
    ml_confidence: number;
    verification_status: string;
    features_used?: Record<string, number>;
  };
  error?: string;
};

const COMP4_API = process.env.NEXT_PUBLIC_COMP4_API ?? "http://localhost:5001";
const COMP4_ML = process.env.NEXT_PUBLIC_COMP4_ML_API ?? "http://localhost:8004";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function threatLngLat(t: ThreatEvent): [number, number] {
  const [lng, lat] = t.location.coordinates;
  return [lng, lat];
}

/** Convert Comp-4 route coords to Leaflet [lat, lng] pairs. */
export function routeToLatLngs(coords: RouteCoords): [number, number][] {
  return (coords ?? []).map((c) => {
    if (Array.isArray(c)) {
      const [lng, lat] = c;
      return [lat, lng];
    }
    return [c.latitude, c.longitude];
  });
}

export async function fetchThreats(): Promise<ThreatEvent[]> {
  const res = await jsonFetch<{ success: boolean; data: ThreatEvent[] }>(
    `${COMP4_API}/api/threats`,
  );
  return res.data ?? [];
}

export async function fetchNearbyThreats(lat: number, lng: number, radius = 50000) {
  const res = await jsonFetch<{ success: boolean; data: ThreatEvent[] }>(
    `${COMP4_API}/api/threats/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
  );
  return res.data ?? [];
}

export async function syncComp4Network(
  frames: Array<{
    x_est?: number;
    y_est?: number;
    lat_est?: number;
    lon_est?: number;
  }>,
) {
  return jsonFetch<{ success: boolean; data?: { node_count: number; message: string }; error?: string }>(
    `${COMP4_API}/api/routing/sync-network`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames }),
    },
  );
}

export async function calculateSafePath(opts: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
}): Promise<SafePathResponse> {
  return jsonFetch<SafePathResponse>(`${COMP4_API}/api/routing/safe-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
}

export async function submitSighting(opts: {
  reported_longitude: number;
  reported_latitude: number;
  device_longitude?: number;
  device_latitude?: number;
  elephant_behavior?: string;
  description?: string;
}): Promise<SightingResult> {
  return jsonFetch<SightingResult>(`${COMP4_API}/api/sightings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
}

export async function postElephantThreat(opts: {
  latitude: number;
  longitude: number;
  radius_meters?: number;
  threat_level?: number;
}) {
  return jsonFetch<{ success: boolean }>(`${COMP4_API}/api/threats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "Sensor_C2_Acoustic",
      threat_level: opts.threat_level ?? 7,
      threat_intensity_penalty: 2000,
      longitude: opts.longitude,
      latitude: opts.latitude,
      radius_meters: opts.radius_meters ?? 1000,
      description: "Comp-2 estimated elephant position (flow integration)",
      elephant_behavior: "Social",
      confidence_score: 0.9,
    }),
  });
}

export async function checkPathGuardHealth() {
  const [api, ml] = await Promise.allSettled([
    fetch(`${COMP4_API}/`).then((r) => r.json()),
    fetch(`${COMP4_ML}/health`).then((r) => r.json()),
  ]);
  return {
    api: api.status === "fulfilled" ? api.value : null,
    ml: ml.status === "fulfilled" ? ml.value : null,
    apiUp: api.status === "fulfilled",
    mlUp: ml.status === "fulfilled",
  };
}

export function getComp4ApiUrl() {
  return COMP4_API;
}
