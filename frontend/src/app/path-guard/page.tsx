"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  calculateSafePath,
  checkPathGuardHealth,
  fetchThreats,
  getComp4ApiUrl,
  routeToLatLngs,
  submitSighting,
  type ThreatEvent,
} from "@/lib/path-guard-api";

const MapPanel = dynamic(() => import("@/components/PathGuardMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-stone-500">
      Loading map…
    </div>
  ),
});

const DEMO_ORIGIN = { lat: 6.9147, lng: 79.9726 };
const DEMO_DEST = { lat: 6.9100, lng: 79.9600 };

export default function PathGuardPage() {
  const [threats, setThreats] = useState<ThreatEvent[]>([]);
  const [safeCoords, setSafeCoords] = useState<[number, number][] | null>(null);
  const [shortCoords, setShortCoords] = useState<[number, number][] | null>(null);
  const [origin, setOrigin] = useState(DEMO_ORIGIN);
  const [dest, setDest] = useState(DEMO_DEST);
  const [sightingLat, setSightingLat] = useState(String(DEMO_ORIGIN.lat));
  const [sightingLng, setSightingLng] = useState(String(DEMO_ORIGIN.lng));
  const [behavior, setBehavior] = useState("Calm");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSighting, setLastSighting] = useState<string | null>(null);
  const [health, setHealth] = useState({ apiUp: false, mlUp: false });
  const [routeMeta, setRouteMeta] = useState<{
    threatsOnShortest: number;
    activeThreats: number;
  } | null>(null);

  const refreshThreats = useCallback(async () => {
    try {
      const data = await fetchThreats();
      setThreats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    checkPathGuardHealth().then((h) =>
      setHealth({ apiUp: h.apiUp, mlUp: h.mlUp }),
    );
    void refreshThreats();
  }, [refreshThreats]);

  useEffect(() => {
    const socket: Socket = io(getComp4ApiUrl(), { transports: ["websocket", "polling"] });

    socket.on("ThreatData", (data: ThreatEvent[]) => {
      if (Array.isArray(data)) setThreats(data);
    });
    socket.on("NewVerifiedThreat", (threat: ThreatEvent) => {
      setThreats((prev) => {
        const exists = prev.some((t) => t._id === threat._id);
        return exists ? prev : [threat, ...prev];
      });
    });
    socket.on("force_reroute", (payload: { message?: string }) => {
      setLastSighting(payload.message ?? "Route updated due to new threat");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const runRoute = async () => {
    setError(null);
    setBusy("Calculating safe route…");
    try {
      const res = await calculateSafePath({
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Routing failed");
      }
      setSafeCoords(routeToLatLngs(res.data.safe_route.coordinates));
      setShortCoords(routeToLatLngs(res.data.shortest_route.coordinates));
      setRouteMeta({
        threatsOnShortest: res.data.shortest_route.threats_on_path,
        activeThreats: res.data.active_threats_count,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runSighting = async () => {
    setError(null);
    setBusy("Submitting sighting to ML verifier…");
    try {
      const lat = parseFloat(sightingLat);
      const lng = parseFloat(sightingLng);
      const res = await submitSighting({
        reported_latitude: lat,
        reported_longitude: lng,
        device_latitude: lat,
        device_longitude: lng,
        elephant_behavior: behavior,
        description,
      });
      if (!res.success) throw new Error(res.error ?? "Sighting failed");
      setLastSighting(
        `${res.message ?? "Submitted"} · confidence ${res.data?.ml_confidence?.toFixed(3)} · ${res.data?.verification_status}`,
      );
      await refreshThreats();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2f6] text-stone-900">
      <header className="border-b border-slate-300/80 bg-[#e2e8f0] px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Gajasaviya · Comp-4 standalone
            </p>
            <h1 className="font-serif text-3xl tracking-tight text-slate-900">
              Gaja Saviya Path-Guard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Separate routing + crowdsourced sightings stack. Uses its own API on :5001 and ML on
              :8004 — not merged with Comp-1/2/3.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/"
              className="rounded-full border border-slate-400 px-3 py-1 text-slate-700 hover:bg-white"
            >
              ← Comp-1/2/3 demo
            </Link>
            <span
              className={`rounded-full px-3 py-1 ${health.apiUp ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              API {health.apiUp ? "up" : "down"}
            </span>
            <span
              className={`rounded-full px-3 py-1 ${health.mlUp ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              ML {health.mlUp ? "up" : "down"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[320px_1fr]">
        <aside className="max-h-[85vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-300 bg-white/90 p-4 shadow-sm">
          <section>
            <h2 className="text-sm font-semibold text-slate-800">Threats</h2>
            <p className="mt-1 text-xs text-slate-500">
              Live via Socket.io + REST. Data stored in Comp-4{" "}
              <code className="text-[10px]">backend/data/db.json</code>.
            </p>
            <button
              type="button"
              onClick={() => void refreshThreats()}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Refresh threats ({threats.length})
            </button>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-800">Safe routing</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <label>
                Origin lat
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  value={origin.lat}
                  onChange={(e) =>
                    setOrigin((o) => ({ ...o, lat: parseFloat(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                Origin lng
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  value={origin.lng}
                  onChange={(e) =>
                    setOrigin((o) => ({ ...o, lng: parseFloat(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                Dest lat
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  value={dest.lat}
                  onChange={(e) =>
                    setDest((d) => ({ ...d, lat: parseFloat(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                Dest lng
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  value={dest.lng}
                  onChange={(e) =>
                    setDest((d) => ({ ...d, lng: parseFloat(e.target.value) || 0 }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void runRoute()}
              disabled={Boolean(busy)}
              className="mt-3 w-full rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Calculate safe path
            </button>
            {routeMeta && (
              <p className="mt-2 text-xs text-slate-600">
                Active threats: {routeMeta.activeThreats} · on shortest path:{" "}
                {routeMeta.threatsOnShortest}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-800">Crowdsourced sighting</h2>
            <label className="mt-2 block text-xs text-slate-500">Latitude</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={sightingLat}
              onChange={(e) => setSightingLat(e.target.value)}
            />
            <label className="mt-2 block text-xs text-slate-500">Longitude</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={sightingLng}
              onChange={(e) => setSightingLng(e.target.value)}
            />
            <label className="mt-2 block text-xs text-slate-500">Behavior</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
            >
              <option value="Calm">Calm</option>
              <option value="Social">Social</option>
              <option value="Aggressive">Aggressive</option>
            </select>
            <label className="mt-2 block text-xs text-slate-500">Note</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void runSighting()}
              disabled={Boolean(busy)}
              className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Submit sighting (ML verify)
            </button>
          </section>

          {lastSighting && (
            <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-700">{lastSighting}</p>
          )}
          {busy && <p className="text-sm text-amber-800">{busy}</p>}
          {error && (
            <pre className="max-h-40 overflow-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-800">
              {error}
            </pre>
          )}
        </aside>

        <section className="flex min-h-[70vh] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-slate-900">Malabe demo network</h2>
            <div className="flex gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1 w-6 bg-teal-600" />
                safe route
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1 w-6 border-b-2 border-dashed border-slate-400" />
                shortest
              </span>
            </div>
          </div>
          <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-300 bg-slate-200 shadow-sm">
            <MapPanel
              threats={threats}
              safeRoute={safeCoords}
              shortestRoute={shortCoords}
              origin={origin}
              destination={dest}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
