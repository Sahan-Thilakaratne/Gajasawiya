"use client";

import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { ThreatEvent } from "@/lib/path-guard-api";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [6.9147, 79.9726];

function FitView({
  threats,
  safeRoute,
  shortestRoute,
}: {
  threats: ThreatEvent[];
  safeRoute?: [number, number][] | null;
  shortestRoute?: [number, number][] | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const t of threats) {
      const [lng, lat] = t.location.coordinates;
      pts.push([lat, lng]);
    }
    if (safeRoute?.length) pts.push(...safeRoute);
    if (shortestRoute?.length) pts.push(...shortestRoute);
    if (!pts.length) {
      map.setView(DEFAULT_CENTER, 13);
      return;
    }
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [32, 32] },
    );
  }, [threats, safeRoute, shortestRoute, map]);
  return null;
}

type Props = {
  threats: ThreatEvent[];
  safeRoute?: [number, number][] | null;
  shortestRoute?: [number, number][] | null;
  origin?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
};

export default function PathGuardMap({
  threats,
  safeRoute,
  shortestRoute,
  origin,
  destination,
}: Props) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitView
        threats={threats}
        safeRoute={safeRoute}
        shortestRoute={shortestRoute}
      />

      {shortestRoute && shortestRoute.length > 1 && (
        <Polyline
          positions={shortestRoute}
          pathOptions={{ color: "#94a3b8", weight: 4, dashArray: "8 6" }}
        />
      )}
      {safeRoute && safeRoute.length > 1 && (
        <Polyline
          positions={safeRoute}
          pathOptions={{ color: "#0d9488", weight: 5 }}
        />
      )}

      {origin && (
        <Circle
          center={[origin.lat, origin.lng]}
          radius={80}
          pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.5 }}
        />
      )}
      {destination && (
        <Circle
          center={[destination.lat, destination.lng]}
          radius={80}
          pathOptions={{ color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 0.5 }}
        />
      )}

      {threats.map((t) => {
        const [lng, lat] = t.location.coordinates;
        const radius = t.radius_meters ?? 1000;
        const color =
          t.status === "Verified"
            ? t.elephant_behavior === "Aggressive"
              ? "#dc2626"
              : "#ea580c"
            : "#f59e0b";
        return (
          <Circle
            key={t._id}
            center={[lat, lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.18,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <div className="text-xs">
                <strong>{t.source}</strong>
                <br />
                {t.elephant_behavior ?? "Unknown"} · level {t.threat_level}
                <br />
                {t.status}
              </div>
            </Tooltip>
          </Circle>
        );
      })}
    </MapContainer>
  );
}

