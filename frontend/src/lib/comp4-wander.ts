import type { Playback } from "@/lib/api";

/** Extra metres beyond each frame uncertainty circle (matches Comp-3 local buffer). */
export const WANDER_PICK_EXTRA_M = 1200;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
