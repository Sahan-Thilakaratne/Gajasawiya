import type { Playback } from './api';

/** Extra metres beyond each frame uncertainty circle (matches Comp-3 local buffer). */
export const WANDER_PICK_EXTRA_M = 1200;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True if point is within any frame's uncertainty + buffer along the sim path. */
export function isPickNearWander(lat: number, lng: number, playback: Playback): boolean {
  for (const f of playback.frames) {
    if (f.lat_est == null || f.lon_est == null) continue;
    const reach = (f.uncertainty_radius_m ?? 500) + WANDER_PICK_EXTRA_M;
    if (haversineM(lat, lng, f.lat_est, f.lon_est) <= reach) return true;
  }
  return false;
}

/** Visual guide: circle covering the wander + pick zone. */
export function wanderZoneEnvelope(playback: Playback): {
  lat: number;
  lng: number;
  radiusM: number;
} | null {
  const pts = playback.frames.filter((f) => f.lat_est != null && f.lon_est != null);
  if (!pts.length) return null;

  const lats = pts.map((f) => f.lat_est!);
  const lons = pts.map((f) => f.lon_est!);
  const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const lng = lons.reduce((a, b) => a + b, 0) / lons.length;

  let radiusM = 0;
  for (const f of pts) {
    const d =
      haversineM(lat, lng, f.lat_est!, f.lon_est!) +
      (f.uncertainty_radius_m ?? 500) +
      WANDER_PICK_EXTRA_M;
    if (d > radiusM) radiusM = d;
  }
  return { lat, lng, radiusM };
}

/** Compute smart origin and destination on opposite ends of the elephant wandering corridor. */
export function autoGenerateWanderEndpoints(playback: Playback): {
  origin: { lat: number; lng: number };
  dest: { lat: number; lng: number };
} | null {
  const pts = playback.frames.filter((f) => f.lat_est != null && f.lon_est != null);
  if (pts.length < 2) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];

  // Offset slightly outward from the endpoints to create a corridor crossing the elephant's path
  const dLat = (last.lat_est! - first.lat_est!) * 0.4;
  const dLon = (last.lon_est! - first.lon_est!) * 0.4;

  return {
    origin: {
      lat: Number((first.lat_est! - dLat * 0.5).toFixed(5)),
      lng: Number((first.lon_est! - dLon * 0.5).toFixed(5)),
    },
    dest: {
      lat: Number((last.lat_est! + dLat * 0.5).toFixed(5)),
      lng: Number((last.lon_est! + dLon * 0.5).toFixed(5)),
    },
  };
}
