import { Platform } from "react-native";

export type RiskCell = {
  cell_id: string;
  lon: number;
  lat: number;
  risk_score: number;
  risk_score_0_100?: number;
  habitat_suitability?: number;
  human_exposure?: number;
  explanation?: string;
  why?: string;
  tags?: string;
  forest_edge?: number;
};

export type PredictResponse = {
  district: string;
  meta: {
    mean_risk: number;
    max_risk: number;
    n_cells: number;
    risk_formula?: string;
    climate?: {
      rainfall_enabled?: boolean;
      month?: number;
      month_key?: string;
      mean_precip_mm_day?: number;
      mean_precip_anomaly?: number;
      climate_source?: string;
    };
  };
  top_cells: RiskCell[];
  bbox_wgs84?: {
    min_lon: number;
    min_lat: number;
    max_lon: number;
    max_lat: number;
  };
};

export type PlaybackFrame = {
  t_hours: number;
  x_true: number;
  y_true: number;
  x_est: number;
  y_est: number;
  lon_true?: number;
  lat_true?: number;
  lon_est?: number;
  lat_est?: number;
  uncertainty_radius_m: number;
  error_m: number;
  alert: number;
  ping_update: number;
};

export type PlaybackPing = {
  t_hours: number;
  x_obs?: number;
  y_obs?: number;
  lon_obs?: number;
  lat_obs?: number;
};

export type Playback = {
  crs?: string;
  crs_display?: string;
  disclaimer?: string;
  start_cell_id?: string;
  metrics?: Record<string, number | string>;
  frames: PlaybackFrame[];
  pings: PlaybackPing[];
};

export type RoadExplanationFactor = {
  id: string;
  label: string;
  value: string;
  note?: string;
};

export type RoadExplanation = {
  edge_id: string;
  title: string;
  segment_risk: number;
  risk_class: "risky" | "safe" | string;
  risk_category: string;
  display_reason?: string;
  summary: string[];
  factors: RoadExplanationFactor[];
  method?: string;
};

export type LocalRoadFeature = {
  type: "Feature";
  properties: {
    edge_id: string;
    segment_risk: number;
    risk_class: "risky" | "safe";
    color: string;
    length_m?: number;
    highway?: string;
    name?: string | null;
    under_circle?: boolean;
    elephant_dist_m?: number;
    path_dist_m?: number | null;
    land_risk?: number;
    display_reason?: string;
    explanation?: RoadExplanation;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

export type LocalRoadsAdvice = {
  headline: string;
  bullets: string[];
  avoid_roads?: string[];
  nearby_places?: string[];
  land_reason?: string | null;
  hour_of_day?: number;
};

export type LocalRoadsResponse = {
  type: "FeatureCollection";
  features: LocalRoadFeature[];
  meta: {
    n_roads: number;
    n_risky: number;
    n_safe: number;
    search_radius_m?: number;
    elephant_radius_m?: number;
    honesty?: string;
    advice?: LocalRoadsAdvice;
  };
};

/** Android emulator → host loopback; web/iOS simulator → localhost */
const DEV_HOST =
  Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";

const COMP1 = process.env.EXPO_PUBLIC_COMP1_API ?? `http://${DEV_HOST}:8003`;
const COMP2 = process.env.EXPO_PUBLIC_COMP2_API ?? `http://${DEV_HOST}:8001`;
const COMP3 = process.env.EXPO_PUBLIC_COMP3_API ?? `http://${DEV_HOST}:8002`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDistricts() {
  return jsonFetch<{
    districts: { id: string; ready: boolean }[];
    default: string;
  }>(`${COMP1}/api/v1/districts`);
}

export async function predictRisk(opts: {
  district: string;
  month: number;
  use_rainfall?: boolean;
  top_n?: number;
}): Promise<PredictResponse> {
  return jsonFetch<PredictResponse>(`${COMP1}/api/v1/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      district: opts.district,
      month: opts.month,
      use_rainfall: opts.use_rainfall ?? true,
      top_n: opts.top_n ?? 800,
      refresh: true,
    }),
  });
}

export async function simulateTrack(start_cell_id: string): Promise<Playback> {
  return jsonFetch<Playback>(`${COMP2}/api/v1/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_cell_id: start_cell_id, save_outputs: true }),
  });
}

export async function fetchLocalRoads(opts: {
  elephant_lon: number;
  elephant_lat: number;
  elephant_radius_m: number;
  hour_of_day?: number;
  buffer_m?: number;
  path?: { lon: number; lat: number }[];
}): Promise<LocalRoadsResponse> {
  return jsonFetch<LocalRoadsResponse>(`${COMP3}/api/v1/local_roads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      elephant_lon: opts.elephant_lon,
      elephant_lat: opts.elephant_lat,
      elephant_radius_m: opts.elephant_radius_m,
      hour_of_day: opts.hour_of_day ?? 18,
      buffer_m: opts.buffer_m ?? 1200,
      path: opts.path,
      max_features: 2500,
    }),
  });
}

export async function checkHealth() {
  const [c1, c2, c3] = await Promise.allSettled([
    fetch(`${COMP1}/health`).then((r) => r.json()),
    fetch(`${COMP2}/health`).then((r) => r.json()),
    fetch(`${COMP3}/health`).then((r) => r.json()),
  ]);
  return {
    comp1: c1.status === "fulfilled" ? c1.value : null,
    comp2: c2.status === "fulfilled" ? c2.value : null,
    comp3: c3.status === "fulfilled" ? c3.value : null,
  };
}
