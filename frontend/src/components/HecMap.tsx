"use client";

import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LocalRoadFeature, LocalRoadsResponse, Playback, RiskCell } from "@/lib/api";
import type { ThreatEvent } from "@/lib/path-guard-api";
import { roadLineToLatLngs } from "@/lib/api";
import "leaflet/dist/leaflet.css";

function riskColor(score: number, vmax: number): string {
  const t = Math.max(0, Math.min(1, score / Math.max(vmax, 1e-6)));
  if (t < 0.25) return "#1a9850";
  if (t < 0.45) return "#91cf60";
  if (t < 0.65) return "#fee08b";
  if (t < 0.85) return "#fc8d59";
  return "#d73027";
}

function FitBounds({
  cells,
  frame,
  localRoads,
}: {
  cells: RiskCell[];
  frame?: { lat: number; lon: number; radius_m?: number } | null;
  localRoads?: LocalRoadsResponse | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (frame) {
      const z = frame.radius_m && frame.radius_m > 1500 ? 11 : 12;
      map.setView([frame.lat, frame.lon], Math.max(map.getZoom(), z));
      return;
    }
    if (localRoads?.features?.length) {
      const pts = localRoads.features.flatMap((f) => roadLineToLatLngs(f));
      if (pts.length) {
        const lats = pts.map((p) => p[0]);
        const lons = pts.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)],
          ],
          { padding: [28, 28] },
        );
        return;
      }
    }
    if (cells.length === 0) return;
    const lats = cells.map((c) => c.lat);
    const lons = cells.map((c) => c.lon);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [24, 24] },
    );
  }, [cells, frame, localRoads, map]);
  return null;
}

function MapPickHandler({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type Props = {
  cells: RiskCell[];
  selectedId: string | null;
  onSelect: (cell: RiskCell) => void;
  playback?: Playback | null;
  frameIdx?: number;
  showTrue?: boolean;
  mode: "pick" | "play";
  localRoads?: LocalRoadsResponse | null;
  selectedRoadId?: string | null;
  onSelectRoad?: (road: LocalRoadFeature) => void;
  comp4SafeRoute?: [number, number][] | null;
  comp4ShortRoute?: [number, number][] | null;
  comp4Threats?: ThreatEvent[];
  comp4Origin?: { lat: number; lng: number } | null;
  comp4Dest?: { lat: number; lng: number } | null;
  wanderZone?: { lat: number; lng: number; radiusM: number } | null;
  routePickStart?: { lat: number; lng: number } | null;
  routePickEnd?: { lat: number; lng: number } | null;
  comp4PickMode?: "origin" | "dest" | null;
  onMapRoutePick?: (lat: number, lng: number) => void;
  disableCellSelect?: boolean;
};

export default function HecMap({
  cells,
  selectedId,
  onSelect,
  playback,
  frameIdx = 0,
  showTrue = true,
  mode,
  localRoads = null,
  selectedRoadId = null,
  onSelectRoad,
  comp4SafeRoute = null,
  comp4ShortRoute = null,
  comp4Threats = [],
  comp4Origin = null,
  comp4Dest = null,
  wanderZone = null,
  routePickStart = null,
  routePickEnd = null,
  comp4PickMode = null,
  onMapRoutePick,
  disableCellSelect = false,
}: Props) {
  const vmax = Math.max(...cells.map((c) => c.risk_score), 1e-6);
  const hot = [...cells].sort((a, b) => b.risk_score - a.risk_score).slice(0, 60);
  const hotIds = new Set(hot.map((c) => c.cell_id));

  const frames = playback?.frames ?? [];
  const frame = frames[frameIdx];
  const past = frames.slice(0, frameIdx + 1);
  const tNow = frame?.t_hours ?? 0;
  const pings = (playback?.pings ?? []).filter((p) => p.t_hours <= tNow + 1e-6);

  const center: [number, number] = frame?.lat_est
    ? [frame.lat_est, frame.lon_est!]
    : cells[0]
      ? [cells[0].lat, cells[0].lon]
      : [8.3, 80.4];

  return (
    <MapContainer
      center={center}
      zoom={10}
      style={{ height: "100%", width: "100%", borderRadius: 12 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds
        cells={cells}
        localRoads={localRoads}
        frame={
          mode === "play" && frame?.lat_est
            ? {
                lat: frame.lat_est,
                lon: frame.lon_est!,
                radius_m: frame.uncertainty_radius_m,
              }
            : null
        }
      />
      {onMapRoutePick && (
        <MapPickHandler
          active={comp4PickMode === "origin" || comp4PickMode === "dest"}
          onPick={onMapRoutePick}
        />
      )}

      {wanderZone && (
        <Circle
          center={[wanderZone.lat, wanderZone.lng]}
          radius={wanderZone.radiusM}
          pathOptions={{
            color: "#0d9488",
            fillColor: "#14b8a6",
            fillOpacity: 0.06,
            weight: 2,
            dashArray: "10 8",
          }}
        >
          <Tooltip sticky>
            Elephant wander + pick zone (tap start/end inside this area)
          </Tooltip>
        </Circle>
      )}

      {/* Comp-3 local roads under risk dots — click for why-risky panel */}
      {localRoads?.features?.map((f) => {
        const pts = roadLineToLatLngs(f);
        if (pts.length < 2) return null;
        const risky = f.properties.risk_class === "risky";
        const selected = selectedRoadId === f.properties.edge_id;
        const pickingRoute = comp4PickMode === "origin" || comp4PickMode === "dest";
        return (
          <Polyline
            key={f.properties.edge_id}
            positions={pts}
            pathOptions={{
              color: selected
                ? "#1d4ed8"
                : f.properties.color || (risky ? "#c0392b" : "#1e8449"),
              weight: selected ? 7 : risky ? 5 : 4,
              opacity: selected ? 1 : risky ? 0.95 : 0.75,
            }}
            eventHandlers={{
              click: (e) => {
                if (pickingRoute) return;
                e.originalEvent?.stopPropagation?.();
                onSelectRoad?.(f);
              },
            }}
          >
            <Tooltip sticky>
              {f.properties.name
                ? f.properties.name
                : risky
                  ? "Risky road"
                  : "Safer road"}{" "}
              · risk {f.properties.segment_risk.toFixed(2)}
              {f.properties.highway ? ` · ${f.properties.highway}` : ""}
              {" · click for why"}
            </Tooltip>
          </Polyline>
        );
      })}

      {comp4ShortRoute && comp4ShortRoute.length > 1 && (
        <Polyline
          positions={comp4ShortRoute}
          pathOptions={{
            color: "#64748b",
            weight: 6,
            dashArray: "12 8",
            opacity: 0.95,
          }}
        />
      )}
      {comp4SafeRoute && comp4SafeRoute.length > 1 && (
        <Polyline
          positions={comp4SafeRoute}
          pathOptions={{
            color: "#0d9488",
            weight: 6,
            opacity: 0.95,
            lineCap: "round",
          }}
        />
      )}

      {routePickStart && (
        <Circle
          center={[routePickStart.lat, routePickStart.lng]}
          radius={100}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.55,
            weight: 3,
          }}
        >
          <Tooltip>Where I am (start)</Tooltip>
        </Circle>
      )}
      {routePickEnd && (
        <Circle
          center={[routePickEnd.lat, routePickEnd.lng]}
          radius={100}
          pathOptions={{
            color: "#7c3aed",
            fillColor: "#8b5cf6",
            fillOpacity: 0.55,
            weight: 3,
          }}
        >
          <Tooltip>Where I want to go (end)</Tooltip>
        </Circle>
      )}

      {comp4Origin && !routePickStart && (
        <Circle
          center={[comp4Origin.lat, comp4Origin.lng]}
          radius={120}
          pathOptions={{
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.45,
            weight: 2,
          }}
        >
          <Tooltip>Comp-4 origin</Tooltip>
        </Circle>
      )}
      {comp4Dest && !routePickEnd && (
        <Circle
          center={[comp4Dest.lat, comp4Dest.lng]}
          radius={120}
          pathOptions={{
            color: "#7c3aed",
            fillColor: "#8b5cf6",
            fillOpacity: 0.45,
            weight: 2,
          }}
        >
          <Tooltip>Comp-4 destination</Tooltip>
        </Circle>
      )}

      {comp4Threats.map((t) => {
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
              fillOpacity: 0.15,
              weight: 2,
              dashArray: t.source === "Sensor_C2_Acoustic" ? "6 4" : undefined,
            }}
          >
            <Tooltip>
              {t.source} · {t.elephant_behavior ?? "Unknown"} · level {t.threat_level}
            </Tooltip>
          </Circle>
        );
      })}

      {cells.map((c) => {
        const isHot = hotIds.has(c.cell_id);
        const isSel = c.cell_id === selectedId;
        return (
          <CircleMarker
            key={c.cell_id}
            center={[c.lat, c.lon]}
            radius={isSel ? 10 : isHot ? 7 : 3}
            pathOptions={{
              color: isSel ? "#111" : isHot ? "#7f0000" : riskColor(c.risk_score, vmax),
              fillColor: isSel ? "#ffe066" : isHot ? "#d73027" : riskColor(c.risk_score, vmax),
              fillOpacity: isHot || isSel ? 0.95 : 0.45,
              weight: isSel ? 3 : 0,
            }}
            eventHandlers={{
              click: () => {
                if (!disableCellSelect) onSelect(c);
              },
            }}
          >
            <Tooltip>
              {c.cell_id} · risk {c.risk_score.toFixed(3)}
              {c.explanation ? ` — ${c.explanation}` : ""}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {mode === "play" && past.length >= 2 && showTrue && (
        <Polyline
          positions={past.map((f) => [f.lat_true!, f.lon_true!] as [number, number])}
          pathOptions={{ color: "#666", weight: 3, opacity: 0.75 }}
        />
      )}
      {mode === "play" && past.length >= 2 && (
        <Polyline
          positions={past.map((f) => [f.lat_est!, f.lon_est!] as [number, number])}
          pathOptions={{ color: "#2f6f4e", weight: 4, opacity: 0.9 }}
        />
      )}
      {mode === "play" &&
        pings.map((p, i) => (
          <CircleMarker
            key={`ping-${i}`}
            center={[p.lat_obs!, p.lon_obs!]}
            radius={5}
            pathOptions={{ color: "#111", fillColor: "#d73027", fillOpacity: 1, weight: 1 }}
          >
            <Tooltip>Ping @ {p.t_hours.toFixed(0)} h</Tooltip>
          </CircleMarker>
        ))}
      {mode === "play" && frame?.lat_est != null && (
        <>
          <Circle
            center={[frame.lat_est, frame.lon_est!]}
            radius={frame.uncertainty_radius_m}
            pathOptions={{
              color: frame.alert ? "#d73027" : "#2f6f4e",
              fillColor: frame.alert ? "#d73027" : "#2f6f4e",
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
          <CircleMarker
            center={[frame.lat_est, frame.lon_est!]}
            radius={8}
            pathOptions={{ color: "#111", fillColor: "#2f6f4e", fillOpacity: 1 }}
          />
          {showTrue && frame.lat_true != null && (
            <CircleMarker
              center={[frame.lat_true, frame.lon_true!]}
              radius={6}
              pathOptions={{ color: "#111", fillColor: "#888", fillOpacity: 1 }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
