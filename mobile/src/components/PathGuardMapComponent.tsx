import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, DimensionValue } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ThreatEvent } from '../pathGuardApi';
import type { Playback } from '../api';

interface Props {
  threats?: ThreatEvent[];
  playback?: Playback | null;
  safeRoute?: [number, number][] | null;
  shortestRoute?: [number, number][] | null;
  origin?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
  height?: DimensionValue;
  wanderZone?: { lat: number; lng: number; radiusM: number } | null;
  onMapTap?: (lat: number, lng: number) => void;
  pickMode?: 'origin' | 'dest' | null;
}

export const PathGuardMapComponent: React.FC<Props> = ({
  threats = [],
  playback = null,
  safeRoute = null,
  shortestRoute = null,
  origin = null,
  destination = null,
  height = 360,
  wanderZone = null,
  onMapTap,
  pickMode = null,
}) => {
  const webViewRef = useRef<any>(null);

  // Static base HTML loaded once (or when wanderZone / threats dataset changes)
  const baseHtml = useMemo(() => {
    const threatsData = threats.map((t) => ({
      id: t._id,
      lat: t.location.coordinates[1],
      lon: t.location.coordinates[0],
      level: t.threat_level,
      behavior: t.elephant_behavior || 'Wild',
      desc: t.description || 'Elephant Activity Zone',
      radius: t.radius_meters || 800,
    }));

    const frames = playback?.frames ?? [];
    const estPts = frames
      .filter((f) => f.lat_est != null && f.lon_est != null)
      .map((f) => [f.lat_est, f.lon_est]);

    const truePts = frames
      .filter((f) => f.lat_true != null && f.lon_true != null)
      .map((f) => [f.lat_true, f.lon_true]);

    const pingsData = (playback?.pings ?? [])
      .filter((p) => p.lat_obs != null && p.lon_obs != null)
      .map((p) => ({ lat: p.lat_obs, lon: p.lon_obs, t: p.t_hours }));

    const lastFrame = frames[frames.length - 1];
    const currentElephant = lastFrame
      ? {
          lat: lastFrame.lat_est,
          lon: lastFrame.lon_est,
          radius: lastFrame.uncertainty_radius_m || 500,
        }
      : null;

    const centerLat = wanderZone?.lat ?? (lastFrame?.lat_est ?? (threats[0]?.location.coordinates[1] ?? 8.3114));
    const centerLon = wanderZone?.lng ?? (lastFrame?.lon_est ?? (threats[0]?.location.coordinates[0] ?? 80.4037));

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
          #map { height: 100%; width: 100%; touch-action: auto; cursor: crosshair; }
          .leaflet-popup-content { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.4; color: #222; }
          .popup-title { font-weight: bold; margin-bottom: 2px; }
          .threat-badge { background: #FFEBEE; color: #C62828; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-block; font-size: 11px; }
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
            scrollWheelZoom: true
          }).setView([${centerLat}, ${centerLon}], 13);

          L.control.zoom({ position: 'topright' }).addTo(map);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var threats = ${JSON.stringify(threatsData)};
          var wanderZone = ${JSON.stringify(wanderZone)};
          var estPts = ${JSON.stringify(estPts)};
          var truePts = ${JSON.stringify(truePts)};
          var pings = ${JSON.stringify(pingsData)};
          var currentElephant = ${JSON.stringify(currentElephant)};

          var allPts = [];

          function emitTap(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MAP_TAP',
                lat: lat,
                lng: lng
              }));
            }
          }

          map.on('click', function(e) {
            emitTap(e.latlng.lat, e.latlng.lng);
          });

          // 1. Draw Wandering Zone Envelope
          if (wanderZone) {
            allPts.push([wanderZone.lat, wanderZone.lng]);
            L.circle([wanderZone.lat, wanderZone.lng], {
              radius: wanderZone.radiusM,
              color: "#0D9488",
              fillColor: "#14B8A6",
              fillOpacity: 0.08,
              weight: 2,
              dashArray: "8, 8",
              interactive: false
            }).addTo(map);
          }

          // 2. Draw Simulated Elephant Tracks (Component 2 details)
          if (truePts.length > 1) {
            L.polyline(truePts, {
              color: "#90A4AE",
              weight: 3,
              opacity: 0.7,
              dashArray: "4, 6",
              interactive: false
            }).addTo(map);
          }

          if (estPts.length > 1) {
            L.polyline(estPts, {
              color: "#111827",
              weight: 4.5,
              opacity: 0.95,
              interactive: false
            }).addTo(map);
            allPts = allPts.concat(estPts);
          }

          // GPS Pings (solid black dots with white border)
          pings.forEach(function(p) {
            L.circleMarker([p.lat, p.lon], {
              radius: 4.5,
              color: "#FFFFFF",
              fillColor: "#111827",
              fillOpacity: 1,
              weight: 1.5,
              interactive: false
            }).addTo(map);
          });

          // Elephant Location + Uncertainty Circle
          if (currentElephant && currentElephant.lat != null) {
            L.circle([currentElephant.lat, currentElephant.lon], {
              radius: currentElephant.radius,
              color: "#D32F2F",
              fillColor: "#D32F2F",
              fillOpacity: 0.16,
              weight: 2,
              interactive: false
            }).addTo(map);

            var elephantMarker = L.circleMarker([currentElephant.lat, currentElephant.lon], {
              radius: 8,
              color: "#FFFFFF",
              fillColor: "#111827",
              fillOpacity: 1,
              weight: 2.5
            }).addTo(map);
            elephantMarker.bindPopup("<b>Estimated Elephant Location</b><br>Uncertainty: " + currentElephant.radius.toFixed(0) + "m");
          }

          // 3. Draw Threat Zones
          threats.forEach(function(t) {
            allPts.push([t.lat, t.lon]);
            
            L.circle([t.lat, t.lon], {
              radius: t.radius,
              color: "#D32F2F",
              fillColor: "#FF5252",
              fillOpacity: 0.15,
              weight: 1.5,
              dashArray: "4, 4",
              interactive: false
            }).addTo(map);

            var marker = L.circleMarker([t.lat, t.lon], {
              radius: 7,
              color: "#FFFFFF",
              fillColor: "#D32F2F",
              fillOpacity: 1,
              weight: 2
            }).addTo(map);

            var popupContent = "<div class='popup-title'>⚠️ Elephant Threat Zone</div>" +
              "<div class='threat-badge'>Threat Level " + t.level + "/10 · " + t.behavior + "</div>" +
              "<div style='margin-top:4px;color:#555;'>" + t.desc + "</div>";
            marker.bindPopup(popupContent);
          });

          // Dynamic layers for routing (updated via JS injection without reload)
          var startMarker = null;
          var endMarker = null;
          var safePolyline = L.polyline([], { color: "#F59E0B", weight: 6, opacity: 1.0 }).addTo(map);
          var shortPolyline = L.polyline([], { color: "#64748B", weight: 4, opacity: 0.8, dashArray: "6, 6" }).addTo(map);

          window.updateRoutingOverlay = function(data) {
            if (!data) return;

            // Update Start Pin
            if (data.origin) {
              if (!startMarker) {
                startMarker = L.circleMarker([data.origin.lat, data.origin.lng], {
                  radius: 9,
                  color: "#FFFFFF",
                  fillColor: "#1565C0",
                  fillOpacity: 1,
                  weight: 3
                }).addTo(map).bindPopup("<b>📍 Trip Start (Origin)</b>");
              } else {
                startMarker.setLatLng([data.origin.lat, data.origin.lng]);
              }
            } else if (startMarker) {
              map.removeLayer(startMarker);
              startMarker = null;
            }

            // Update End Pin
            if (data.dest) {
              if (!endMarker) {
                endMarker = L.circleMarker([data.dest.lat, data.dest.lng], {
                  radius: 9,
                  color: "#FFFFFF",
                  fillColor: "#7C3AED",
                  fillOpacity: 1,
                  weight: 3
                }).addTo(map).bindPopup("<b>🎯 Trip Destination (End)</b>");
              } else {
                endMarker.setLatLng([data.dest.lat, data.dest.lng]);
              }
            } else if (endMarker) {
              map.removeLayer(endMarker);
              endMarker = null;
            }

            // Update Polylines
            if (data.safeRoute && data.safeRoute.length > 1) {
              safePolyline.setLatLngs(data.safeRoute);
            } else {
              safePolyline.setLatLngs([]);
            }

            if (data.shortRoute && data.shortRoute.length > 1) {
              shortPolyline.setLatLngs(data.shortRoute);
            } else {
              shortPolyline.setLatLngs([]);
            }
          };

          // Fit bounds once at initialization
          if (wanderZone) {
            var bounds = L.latLng([wanderZone.lat, wanderZone.lng]).toBounds(wanderZone.radiusM * 2.2);
            map.fitBounds(bounds, { padding: [20, 20] });
          } else if (allPts.length > 0) {
            map.fitBounds(L.latLngBounds(allPts), { padding: [25, 25] });
          }
        </script>
      </body>
      </html>
    `;
  }, [threats, wanderZone, playback]);

  // Smoothly update origin, destination, and routes without reloading WebView / without changing zoom
  useEffect(() => {
    const payload = JSON.stringify({
      origin,
      dest: destination,
      safeRoute,
      shortRoute: shortestRoute,
    });
    webViewRef.current?.injectJavaScript(`window.updateRoutingOverlay && window.updateRoutingOverlay(${payload}); true;`);
  }, [origin, destination, safeRoute, shortestRoute]);

  const handleWebViewLoad = () => {
    const payload = JSON.stringify({
      origin,
      dest: destination,
      safeRoute,
      shortRoute: shortestRoute,
    });
    webViewRef.current?.injectJavaScript(`window.updateRoutingOverlay && window.updateRoutingOverlay(${payload}); true;`);
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_TAP' && onMapTap) {
        onMapTap(data.lat, data.lng);
      }
    } catch {
      // ignore
    }
  };

  const simKey =
    playback?.frames && playback.frames.length > 0
      ? `${playback.frames[0]?.lat_est?.toFixed(4)}_${playback.frames[playback.frames.length - 1]?.lat_est?.toFixed(4)}_${playback.frames.length}`
      : 'initial_guard';

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        key={simKey}
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
