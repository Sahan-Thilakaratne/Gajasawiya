import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, DimensionValue, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { LocalRoadsResponse, Playback, RiskCell } from '../api';

interface Props {
  cells?: RiskCell[];
  selectedId?: string | null;
  onSelectCell?: (cellId: string) => void;
  selectedRoadId?: string | null;
  onSelectRoad?: (edgeId: string) => void;
  playback?: Playback | null;
  frameIdx?: number;
  showTrue?: boolean;
  mode?: 'pick' | 'play';
  localRoads?: LocalRoadsResponse | null;
  height?: DimensionValue;
  wanderZone?: { lat: number; lng: number; radiusM: number } | null;
  comp4SafeRoute?: [number, number][] | null;
  comp4ShortRoute?: [number, number][] | null;
}

export const HecMapComponent: React.FC<Props> = ({
  cells = [],
  selectedId = null,
  onSelectCell,
  selectedRoadId = null,
  onSelectRoad,
  playback = null,
  frameIdx = 0,
  showTrue = true,
  mode = 'pick',
  localRoads = null,
  height = '100%',
  wanderZone = null,
  comp4SafeRoute = null,
  comp4ShortRoute = null,
}) => {
  const webViewRef = useRef<any>(null);

  // Compute base static HTML structure that only updates when dataset / mode changes, NOT on each frameIdx
  const baseHtml = useMemo(() => {
    const vmax = cells.length ? Math.max(...cells.map((c) => c.risk_score), 1e-6) : 0.03;
    const sorted = [...cells].sort((a, b) => b.risk_score - a.risk_score);
    const hot = sorted.slice(0, 60);
    const hotIds = new Set(hot.map((c) => c.cell_id));

    const frames = playback?.frames ?? [];
    const initialFrame = frames[0];
    const centerLat = wanderZone?.lat ?? (initialFrame?.lat_est ?? (cells[0] ? cells[0].lat : 8.3114));
    const centerLon = wanderZone?.lng ?? (initialFrame?.lon_est ?? (cells[0] ? cells[0].lon : 80.4037));

    const cellsData = cells.map((c) => ({
      id: c.cell_id,
      lat: c.lat,
      lon: c.lon,
      risk: c.risk_score,
      exp: c.explanation || c.why || '',
      isHot: hotIds.has(c.cell_id),
      isSel: c.cell_id === selectedId,
    }));

    const roadsData = (localRoads?.features ?? []).map((f) => {
      const coords = f.geometry?.coordinates ?? [];
      const pts = coords.map(([lon, lat]) => [lat, lon]);
      const risky = f.properties.risk_class === 'risky';
      const selected = f.properties.edge_id === selectedRoadId;
      return {
        id: f.properties.edge_id,
        pts,
        risky,
        selected,
        color: selected
          ? '#1D4ED8'
          : f.properties.color || (risky ? '#D32F2F' : '#2E7D32'),
        name: f.properties.name || (risky ? 'High-Risk Road' : 'Safer Road'),
        risk: f.properties.segment_risk,
        highway: f.properties.highway || '',
        category: f.properties.explanation?.risk_category || '',
      };
    });

    const safePts = comp4SafeRoute || [];
    const shortPts = comp4ShortRoute || [];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          body, html { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: #E8EDE8; }
          #map { height: 100%; width: 100%; touch-action: auto; z-index: 1; }
          .leaflet-popup-content { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.4; color: #222; }
          .popup-title { font-weight: bold; margin-bottom: 2px; }
          .popup-risk { color: #D32F2F; font-weight: 600; }
          .leaflet-control-zoom { border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            dragging: true,
            touchZoom: true,
            tap: false,
            scrollWheelZoom: true,
            bounceAtZoomLimits: true
          }).setView([${centerLat}, ${centerLon}], 11);

          L.control.zoom({ position: 'topright' }).addTo(map);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          function riskColor(score, vmax) {
            var t = Math.max(0, Math.min(1, score / Math.max(vmax, 1e-6)));
            if (t < 0.25) return "#1B5E20";
            if (t < 0.45) return "#4CAF50";
            if (t < 0.65) return "#FBC02D";
            if (t < 0.85) return "#F57C00";
            return "#D32F2F";
          }

          var vmax = ${vmax};
          var cells = ${JSON.stringify(cellsData)};
          var roads = ${JSON.stringify(roadsData)};
          var wanderZone = ${JSON.stringify(wanderZone)};
          var safeRoute = ${JSON.stringify(safePts)};
          var shortRoute = ${JSON.stringify(shortPts)};
          var mode = "${mode}";

          // Layers
          var wanderLayer = L.layerGroup().addTo(map);
          var roadsLayer = L.layerGroup().addTo(map);
          var cellsLayer = L.layerGroup().addTo(map);
          var pingsLayer = L.layerGroup().addTo(map);
          var estPathLayer = L.polyline([], { color: "#111827", weight: 4.5, opacity: 0.95 }).addTo(map);
          var truePathLayer = L.polyline([], { color: "#78909C", weight: 3, opacity: 0.75, dashArray: "4, 6" }).addTo(map);
          var uncertaintyCircle = null;
          var animalMarker = null;
          var trueMarker = null;

          // 1. Draw Wandering Zone Envelope (if present)
          if (wanderZone) {
            L.circle([wanderZone.lat, wanderZone.lng], {
              radius: wanderZone.radiusM,
              color: "#0D9488",
              fillColor: "#14B8A6",
              fillOpacity: 0.08,
              weight: 2,
              dashArray: "8, 8"
            }).addTo(wanderLayer).bindPopup("<b>Elephant Wander & Patrol Zone</b><br>Safe routing corridor envelope: " + (wanderZone.radiusM / 1000).toFixed(1) + " km");
          }

          // 2. Draw Comp-4 Shortest (grey dashed) & Safe (green solid) Routes
          if (shortRoute.length > 1) {
            L.polyline(shortRoute, {
              color: "#64748B",
              weight: 5,
              dashArray: "8, 6",
              opacity: 0.9
            }).addTo(map).bindPopup("<b>Direct Shortest Route</b><br>(Near elephant encounter hazard)");
          }
          if (safeRoute.length > 1) {
            L.polyline(safeRoute, {
              color: "#0D9488",
              weight: 5,
              opacity: 0.95
            }).addTo(map).bindPopup("<b>🛡️ Path Guard Safe Bypass</b>");
          }

          // 3. Draw Roads (tap → why-risky explanation)
          roads.forEach(function(r) {
            if (r.pts && r.pts.length >= 2) {
              var poly = L.polyline(r.pts, {
                color: r.color,
                weight: r.selected ? 7 : (r.risky ? 5 : 3.5),
                opacity: r.selected ? 1 : (r.risky ? 0.95 : 0.75)
              }).addTo(roadsLayer);

              var desc = "<div class='popup-title'>" + (r.name || (r.risky ? "Risky Road" : "Safer Road")) + "</div>" +
                "<div>Risk: <span class='popup-risk'>" + r.risk.toFixed(2) + "</span>" + (r.highway ? " · " + r.highway : "") + "</div>" +
                (r.category ? "<div style='margin-top:3px;color:#555;'>" + r.category + "</div>" : "") +
                "<div style='margin-top:6px;font-size:11px;color:#1565C0;'>Tap for why this road is flagged</div>";
              poly.bindPopup(desc);

              poly.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_ROAD',
                    edgeId: r.id
                  }));
                }
              });
            }
          });

          // 4. Draw Risk Cells
          cells.forEach(function(c) {
            var radius = c.isSel ? 9 : (c.isHot ? 6 : 3.5);
            var color = c.isSel ? "#000000" : (c.isHot ? "#B71C1C" : riskColor(c.risk, vmax));
            var fill = c.isSel ? "#FFD54F" : (c.isHot ? "#E53935" : riskColor(c.risk, vmax));
            var fillOpacity = (c.isHot || c.isSel) ? 0.95 : 0.45;
            var weight = c.isSel ? 3 : (c.isHot ? 1.5 : 0);

            var marker = L.circleMarker([c.lat, c.lon], {
              radius: radius,
              color: color,
              fillColor: fill,
              fillOpacity: fillOpacity,
              weight: weight
            }).addTo(cellsLayer);

            var popupContent = "<div class='popup-title'>" + c.id + "</div>" +
              "<div>Risk Score: <span class='popup-risk'>" + c.risk.toFixed(3) + "</span></div>" +
              (c.exp ? "<div style='margin-top:3px;color:#555;'>" + c.exp + "</div>" : "") +
              "<div style='margin-top:6px;font-size:11px;color:#1B5E20;'>Tap to select for tracking</div>";

            marker.bindPopup(popupContent);

            marker.on('click', function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SELECT_CELL',
                  cellId: c.id
                }));
              }
            });
          });

          // Fit bounds once at initialization
          if (wanderZone) {
            var bounds = L.latLng([wanderZone.lat, wanderZone.lng]).toBounds(wanderZone.radiusM * 2.2);
            map.fitBounds(bounds, { padding: [20, 20] });
          } else if (roads.length > 0) {
            var allPts = [];
            roads.forEach(function(r) { if (r.pts) allPts = allPts.concat(r.pts); });
            if (allPts.length > 0) {
              map.fitBounds(L.latLngBounds(allPts), { padding: [20, 20] });
            }
          } else if (cells.length > 0) {
            var cellPts = cells.map(function(c) { return [c.lat, c.lon]; });
            map.fitBounds(L.latLngBounds(cellPts), { padding: [20, 20] });
          }

          // Dynamic Frame Update Function called by React Native injectJavaScript without zooming or reloading
          window.updateTelemetry = function(data) {
            if (!data) return;

            // 1. Update paths
            if (data.pastEst && data.pastEst.length > 0) {
              estPathLayer.setLatLngs(data.pastEst);
            } else {
              estPathLayer.setLatLngs([]);
            }

            if (data.showTrue && data.pastTrue && data.pastTrue.length > 0) {
              truePathLayer.setLatLngs(data.pastTrue);
            } else {
              truePathLayer.setLatLngs([]);
            }

            // 2. Update GPS pings (black dots with crisp white border)
            pingsLayer.clearLayers();
            if (data.pings && data.pings.length > 0) {
              data.pings.forEach(function(p) {
                L.circleMarker([p.lat, p.lon], {
                  radius: 5,
                  color: "#FFFFFF",
                  fillColor: "#111827",
                  fillOpacity: 1,
                  weight: 1.5
                }).addTo(pingsLayer).bindPopup("GPS Ping @ " + p.t.toFixed(0) + "h");
              });
            }

            // 3. Update current elephant position & uncertainty circle
            if (data.current) {
              var alertColor = data.current.alert ? "#D32F2F" : "#111827";

              if (!uncertaintyCircle) {
                uncertaintyCircle = L.circle([data.current.latEst, data.current.lonEst], {
                  radius: data.current.radius,
                  color: data.current.alert ? "#D32F2F" : "#D32F2F",
                  fillColor: "#D32F2F",
                  fillOpacity: 0.16,
                  weight: 2
                }).addTo(map);
              } else {
                uncertaintyCircle.setLatLng([data.current.latEst, data.current.lonEst]);
                uncertaintyCircle.setRadius(data.current.radius);
                uncertaintyCircle.setStyle({ color: "#D32F2F", fillColor: "#D32F2F" });
              }

              if (!animalMarker) {
                animalMarker = L.circleMarker([data.current.latEst, data.current.lonEst], {
                  radius: 8,
                  color: "#FFFFFF",
                  fillColor: "#111827",
                  fillOpacity: 1,
                  weight: 2.5
                }).addTo(map).bindPopup("<b>Estimated Elephant Position</b><br>Uncertainty 2σ: " + data.current.radius.toFixed(0) + "m");
              } else {
                animalMarker.setLatLng([data.current.latEst, data.current.lonEst]);
                animalMarker.setStyle({ fillColor: "#111827" });
              }

              if (data.showTrue && data.current.latTrue != null) {
                if (!trueMarker) {
                  trueMarker = L.circleMarker([data.current.latTrue, data.current.lonTrue], {
                    radius: 6,
                    color: "#FFFFFF",
                    fillColor: "#607D8B",
                    fillOpacity: 1,
                    weight: 2
                  }).addTo(map).bindPopup("True Ground Position");
                } else {
                  trueMarker.setLatLng([data.current.latTrue, data.current.lonTrue]);
                }
              } else if (trueMarker) {
                map.removeLayer(trueMarker);
                trueMarker = null;
              }

              // Smoothly pan only if elephant moves out of current view
              if (!map.getBounds().contains([data.current.latEst, data.current.lonEst])) {
                map.panTo([data.current.latEst, data.current.lonEst], { animate: true, duration: 0.25 });
              }
            }
          };
        </script>
      </body>
      </html>
    `;
  }, [cells, selectedId, selectedRoadId, mode, localRoads, wanderZone, comp4SafeRoute, comp4ShortRoute]);

  // Update dynamic frames smoothly using JS injection
  useEffect(() => {
    if (!playback || mode !== 'play') return;

    const frames = playback.frames ?? [];
    const frame = frames[frameIdx];
    const past = frames.slice(0, frameIdx + 1);
    const tNow = frame?.t_hours ?? 0;
    const pings = (playback.pings ?? []).filter((p) => p.t_hours <= tNow + 1e-6);

    const pastTruePts = past
      .filter((f) => f.lat_true != null && f.lon_true != null)
      .map((f) => [f.lat_true, f.lon_true]);

    const pastEstPts = past
      .filter((f) => f.lat_est != null && f.lon_est != null)
      .map((f) => [f.lat_est, f.lon_est]);

    const pingsData = pings
      .filter((p) => p.lat_obs != null && p.lon_obs != null)
      .map((p) => ({ lat: p.lat_obs, lon: p.lon_obs, t: p.t_hours }));

    const currentFrameData = frame
      ? {
          latEst: frame.lat_est,
          lonEst: frame.lon_est,
          latTrue: frame.lat_true,
          lonTrue: frame.lon_true,
          radius: frame.uncertainty_radius_m || 500,
          alert: Boolean(frame.alert),
        }
      : null;

    const payload = JSON.stringify({
      current: currentFrameData,
      pastEst: pastEstPts,
      pastTrue: pastTruePts,
      pings: pingsData,
      showTrue,
    });

    const js = `window.updateTelemetry && window.updateTelemetry(${payload}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [playback, frameIdx, showTrue, mode]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SELECT_CELL' && onSelectCell) {
        onSelectCell(data.cellId);
      }
      if (data.type === 'SELECT_ROAD' && onSelectRoad) {
        onSelectRoad(data.edgeId);
      }
    } catch {
      // ignore
    }
  };

  const handleWebViewLoad = () => {
    if (playback && mode === 'play') {
      const frames = playback.frames ?? [];
      const frame = frames[frameIdx];
      const past = frames.slice(0, frameIdx + 1);
      const tNow = frame?.t_hours ?? 0;
      const pings = (playback.pings ?? []).filter((p) => p.t_hours <= tNow + 1e-6);

      const pastTruePts = past
        .filter((f) => f.lat_true != null && f.lon_true != null)
        .map((f) => [f.lat_true, f.lon_true]);

      const pastEstPts = past
        .filter((f) => f.lat_est != null && f.lon_est != null)
        .map((f) => [f.lat_est, f.lon_est]);

      const pingsData = pings
        .filter((p) => p.lat_obs != null && p.lon_obs != null)
        .map((p) => ({ lat: p.lat_obs, lon: p.lon_obs, t: p.t_hours }));

      const currentFrameData = frame
        ? {
            latEst: frame.lat_est,
            lonEst: frame.lon_est,
            latTrue: frame.lat_true,
            lonTrue: frame.lon_true,
            radius: frame.uncertainty_radius_m || 500,
            alert: Boolean(frame.alert),
          }
        : null;

      const payload = JSON.stringify({
        current: currentFrameData,
        pastEst: pastEstPts,
        pastTrue: pastTruePts,
        pings: pingsData,
        showTrue,
      });

      webViewRef.current?.injectJavaScript(`window.updateTelemetry && window.updateTelemetry(${payload}); true;`);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: baseHtml }}
        style={styles.webview}
        onMessage={handleMessage}
        onLoadEnd={handleWebViewLoad}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={true}
        nestedScrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8EDE8',
  },
  webview: {
    flex: 1,
    backgroundColor: '#E8EDE8',
  },
});
