"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkHealth,
  fetchDistricts,
  fetchLocalRoads,
  predictRisk,
  simulateTrack,
  type LocalRoadFeature,
  type LocalRoadsResponse,
  type Playback,
  type PredictResponse,
  type RiskCell,
} from "@/lib/api";
import {
  calculateSafePath,
  checkPathGuardHealth,
  fetchThreats,
  postElephantThreat,
  routeToLatLngs,
  syncComp4Network,
  type ThreatEvent,
} from "@/lib/path-guard-api";

import {
  isPickNearWander,
  wanderZoneEnvelope,
  WANDER_PICK_EXTRA_M,
} from "@/lib/comp4-wander";

const HecMap = dynamic(() => import("@/components/HecMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-stone-500">
      Loading map…
    </div>
  ),
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function HomePage() {
  const [districts, setDistricts] = useState<{ id: string; ready: boolean }[]>([]);
  const [district, setDistrict] = useState("Anuradhapura");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [useRain, setUseRain] = useState(true);
  const [predict, setPredict] = useState<PredictResponse | null>(null);
  const [selected, setSelected] = useState<RiskCell | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [localRoads, setLocalRoads] = useState<LocalRoadsResponse | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<LocalRoadFeature | null>(null);
  const [comp4SafeRoute, setComp4SafeRoute] = useState<[number, number][] | null>(null);
  const [comp4ShortRoute, setComp4ShortRoute] = useState<[number, number][] | null>(null);
  const [comp4Threats, setComp4Threats] = useState<ThreatEvent[]>([]);
  const [comp4Origin, setComp4Origin] = useState<{ lat: number; lng: number } | null>(null);
  const [comp4Dest, setComp4Dest] = useState<{ lat: number; lng: number } | null>(null);
  const [comp4Meta, setComp4Meta] = useState<{
    threatsOnShortest: number;
    activeThreats: number;
    safePoints: number;
    shortPoints: number;
    message?: string;
  } | null>(null);
  const [routePickStart, setRoutePickStart] = useState<{ lat: number; lng: number } | null>(null);
  const [routePickEnd, setRoutePickEnd] = useState<{ lat: number; lng: number } | null>(null);
  const [comp4PickMode, setComp4PickMode] = useState<"origin" | "dest" | null>(null);
  const [routeHour, setRouteHour] = useState(18);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTrue, setShowTrue] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    comp1: boolean;
    comp2: boolean;
    comp3: boolean;
    comp4: boolean;
  }>({
    comp1: false,
    comp2: false,
    comp3: false,
    comp4: false,
  });
  const [speedMs, setSpeedMs] = useState(280);
  const roadsReq = useRef(0);

  const mode = playback ? "play" : "pick";

  useEffect(() => {
    fetchDistricts()
      .then((d) => {
        setDistricts(d.districts);
        setDistrict(d.default || "Anuradhapura");
      })
      .catch(() => setDistricts([{ id: "Anuradhapura", ready: true }]));
    checkHealth().then((h) =>
      setHealth((prev) => ({
        ...prev,
        comp1: Boolean(h.comp1?.status === "ok" || h.comp1?.ok),
        comp2: Boolean(h.comp2?.ok),
        comp3: Boolean(h.comp3?.ok),
      })),
    );
    checkPathGuardHealth().then((h) =>
      setHealth((prev) => ({ ...prev, comp4: h.apiUp })),
    );
  }, []);

  useEffect(() => {
    if (!playing || !playback) return;
    if (frameIdx >= playback.frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setFrameIdx((i) => i + 1), speedMs);
    return () => window.clearTimeout(t);
  }, [playing, frameIdx, playback, speedMs]);

  const loadLocalRoads = useCallback(
    async (pb: Playback, idx: number, hour: number, showBusy: boolean) => {
      const fr = pb.frames[idx];
      if (!fr?.lon_est || !fr?.lat_est) return;
      const reqId = ++roadsReq.current;
      if (showBusy) setBusy("Comp-3: colouring roads near elephant…");
      try {
        const path = pb.frames
          .slice(0, idx + 1)
          .filter((f) => f.lon_est != null && f.lat_est != null)
          .filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 30)) === 0)
          .map((f) => ({ lon: f.lon_est!, lat: f.lat_est! }));
        const res = await fetchLocalRoads({
          elephant_lon: fr.lon_est,
          elephant_lat: fr.lat_est,
          elephant_radius_m: fr.uncertainty_radius_m || 500,
          hour_of_day: hour,
          buffer_m: 1200,
          path,
        });
        if (reqId === roadsReq.current) {
          setLocalRoads(res);
          setSelectedRoad(null);
        }
      } catch (e) {
        if (reqId === roadsReq.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (showBusy && reqId === roadsReq.current) setBusy(null);
      }
    },
    [],
  );

  const clearComp4Routes = useCallback(() => {
    setComp4SafeRoute(null);
    setComp4ShortRoute(null);
    setComp4Threats([]);
    setComp4Origin(null);
    setComp4Dest(null);
    setComp4Meta(null);
    setRoutePickStart(null);
    setRoutePickEnd(null);
    setComp4PickMode(null);
  }, []);

  const runComp1 = useCallback(async () => {
    setError(null);
    setBusy("Running Comp-1 risk model…");
    setPlayback(null);
    setLocalRoads(null);
    setSelectedRoad(null);
    clearComp4Routes();
    setPlaying(false);
    setSelected(null);
    try {
      const res = await predictRisk({
        district,
        month,
        use_rainfall: useRain,
        top_n: 1000,
      });
      setPredict(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [district, month, useRain, clearComp4Routes]);

  const runComp2 = useCallback(async () => {
    if (!selected) return;
    setError(null);
    setBusy(`Simulating Comp-2 from ${selected.cell_id}…`);
    setLocalRoads(null);
    setSelectedRoad(null);
    clearComp4Routes();
    try {
      const pb = await simulateTrack(selected.cell_id);
      setPlayback(pb);
      setFrameIdx(0);
      setPlaying(true);
      await loadLocalRoads(pb, 0, routeHour, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [selected, loadLocalRoads, routeHour, clearComp4Routes]);

  const runComp4Route = useCallback(async () => {
    if (!playback || !localRoads || !routePickStart || !routePickEnd) return;
    const fr = playback.frames[frameIdx];
    if (!fr?.lat_est || !fr?.lon_est) {
      setError("Comp-2 frames need lat/lon for elephant threat.");
      return;
    }
    setError(null);
    setComp4PickMode(null);
    setBusy("Comp-4: syncing roads + routing your picks…");
    try {
      const sync = await syncComp4Network(playback.frames);
      if (!sync.success) {
        throw new Error(sync.error ?? "Comp-4 network sync failed");
      }
      await postElephantThreat({
        latitude: fr.lat_est,
        longitude: fr.lon_est,
        radius_meters: Math.max(fr.uncertainty_radius_m || 500, 400),
      });
      const res = await calculateSafePath({
        origin_lat: routePickStart.lat,
        origin_lng: routePickStart.lng,
        dest_lat: routePickEnd.lat,
        dest_lng: routePickEnd.lng,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Comp-4 routing failed");
      }
      const safePts = routeToLatLngs(res.data.safe_route.coordinates);
      const shortPts = routeToLatLngs(res.data.shortest_route.coordinates);
      setComp4SafeRoute(safePts.length > 0 ? safePts : null);
      setComp4ShortRoute(shortPts.length > 0 ? shortPts : null);
      setComp4Origin(routePickStart);
      setComp4Dest(routePickEnd);
      const threats = await fetchThreats();
      setComp4Threats(threats);
      const safeOk = safePts.length > 1;
      const shortOk = shortPts.length > 1;
      setComp4Meta({
        threatsOnShortest: res.data.shortest_route.threats_on_path,
        activeThreats: res.data.active_threats_count,
        safePoints: safePts.length,
        shortPoints: shortPts.length,
        message: safeOk
          ? `Routes drawn — green = safe, grey dashed = shortest; orange circles = threats.`
          : shortOk
            ? "Only shortest path found — safe route had no graph connection."
            : "No route on Comp-4 graph — try picks closer to roads inside the wander zone.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [playback, localRoads, routePickStart, routePickEnd, frameIdx]);

  const handleMapRoutePick = useCallback(
    (lat: number, lng: number) => {
      if (!playback || !comp4PickMode) return;
      if (!isPickNearWander(lat, lng, playback)) {
        setError(
          `Tap inside the elephant wander zone (within ~${WANDER_PICK_EXTRA_M} m of the sim path + uncertainty).`,
        );
        return;
      }
      setError(null);
      if (comp4PickMode === "origin") {
        setRoutePickStart({ lat, lng });
        setComp4PickMode(null);
      } else {
        setRoutePickEnd({ lat, lng });
        setComp4PickMode(null);
      }
    },
    [playback, comp4PickMode],
  );

  const wanderZone = useMemo(
    () => (playback && localRoads ? wanderZoneEnvelope(playback) : null),
    [playback, localRoads],
  );

  useEffect(() => {
    if (!playback || playing) return;
    const t = window.setTimeout(() => {
      void loadLocalRoads(playback, frameIdx, routeHour, false);
    }, 450);
    return () => window.clearTimeout(t);
  }, [frameIdx, playback, playing, routeHour, loadLocalRoads]);

  const refreshRoadsNow = useCallback(() => {
    if (!playback) return;
    void loadLocalRoads(playback, frameIdx, routeHour, true);
  }, [playback, frameIdx, routeHour, loadLocalRoads]);

  const hotList = useMemo(() => {
    if (!predict) return [];
    return [...predict.top_cells]
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 40);
  }, [predict]);

  const frame = playback?.frames[frameIdx];
  const clim = predict?.meta?.climate;
  const showMap = Boolean(predict);

  return (
    <div className="min-h-screen bg-[#f3efe6] text-stone-900">
      <header className="border-b border-stone-300/80 bg-[#ebe4d4] px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Gajasaviya · HEC research demo
            </p>
            <h1 className="font-serif text-3xl tracking-tight text-stone-900">
              Risk → elephant → roads → safe path
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Comp-1 hotspots → Comp-2 tracker → Comp-3 local roads → Comp-4 safe A→B route
              (avoids live elephant threat). Not live DWC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/path-guard"
              className="rounded-full border border-stone-400 px-3 py-1 text-stone-700 hover:bg-white"
            >
              Comp-4 lab →
            </Link>
            <span
              className={`rounded-full px-3 py-1 ${health.comp1 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              Comp-1 {health.comp1 ? "up" : "down"}
            </span>
            <span
              className={`rounded-full px-3 py-1 ${health.comp2 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              Comp-2 {health.comp2 ? "up" : "down"}
            </span>
            <span
              className={`rounded-full px-3 py-1 ${health.comp3 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              Comp-3 {health.comp3 ? "up" : "down"}
            </span>
            <span
              className={`rounded-full px-3 py-1 ${health.comp4 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
            >
              Comp-4 {health.comp4 ? "up" : "down"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[320px_1fr]">
        <aside className="max-h-[85vh] space-y-4 overflow-y-auto rounded-2xl border border-stone-300 bg-white/80 p-4 shadow-sm">
          <section>
            <h2 className="text-sm font-semibold text-stone-800">1 · Comp-1 risk</h2>
            <label className="mt-2 block text-xs text-stone-500">District</label>
            <select
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              {(districts.length ? districts : [{ id: "Anuradhapura", ready: true }]).map(
                (d) => (
                  <option key={d.id} value={d.id} disabled={!d.ready}>
                    {d.id}
                    {!d.ready ? " (soon)" : ""}
                  </option>
                ),
              )}
            </select>
            <label className="mt-3 block text-xs text-stone-500">Rainfall month</label>
            <select
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={useRain}
                onChange={(e) => setUseRain(e.target.checked)}
              />
              Apply rainfall / season effect
            </label>
            <button
              type="button"
              onClick={runComp1}
              disabled={Boolean(busy)}
              className="mt-3 w-full rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              Run Comp-1 risk model
            </button>
            {clim?.rainfall_enabled && (
              <p className="mt-2 text-xs text-stone-600">
                {clim.month_key}: {clim.mean_precip_mm_day?.toFixed(2)} mm/day · anomaly{" "}
                {((clim.mean_precip_anomaly ?? 0) * 100).toFixed(0)}%
              </p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-stone-800">2 · Pick hotspot</h2>
            <select
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              value={selected?.cell_id ?? ""}
              disabled={!hotList.length}
              onChange={(e) => {
                const cell = hotList.find((c) => c.cell_id === e.target.value) ?? null;
                setSelected(cell);
                setPlayback(null);
                setLocalRoads(null);
                clearComp4Routes();
                setPlaying(false);
              }}
            >
              <option value="">Click map or choose…</option>
              {hotList.map((c) => (
                <option key={c.cell_id} value={c.cell_id}>
                  {c.cell_id} ({c.risk_score.toFixed(3)})
                </option>
              ))}
            </select>
            {selected && (
              <p className="mt-2 text-xs text-stone-600">
                <strong>{selected.cell_id}</strong> · {selected.explanation}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-stone-800">3 · Comp-2 tracker</h2>
            <button
              type="button"
              onClick={runComp2}
              disabled={!selected || Boolean(busy)}
              className="mt-2 w-full rounded-lg bg-emerald-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Run simulation + local roads
            </button>
            {playback && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    onClick={() => setPlaying(true)}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    onClick={() => setPlaying(false)}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    onClick={() => {
                      setPlaying(false);
                      setFrameIdx(0);
                    }}
                  >
                    Reset
                  </button>
                </div>
                <label className="block text-xs text-stone-500">
                  Speed
                  <select
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    value={speedMs}
                    onChange={(e) => setSpeedMs(Number(e.target.value))}
                  >
                    <option value={550}>Slow</option>
                    <option value={280}>Normal</option>
                    <option value={120}>Fast</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showTrue}
                    onChange={(e) => setShowTrue(e.target.checked)}
                  />
                  Show true path
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.max((playback.frames.length || 1) - 1, 0)}
                  value={frameIdx}
                  onChange={(e) => {
                    setPlaying(false);
                    setFrameIdx(Number(e.target.value));
                  }}
                  className="w-full"
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-stone-800">4 · Comp-3 local roads</h2>
            <p className="mt-1 text-xs text-stone-500">
              Only roads near the elephant circle / recent path.{" "}
              <strong>Red</strong> = next to the animal (or extreme land risk).{" "}
              <strong>Green</strong> = farther / safer. Click a road for “why
              risky?” factors.
            </p>
            <label className="mt-2 block text-xs text-stone-500">Hour of day</label>
            <select
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              value={routeHour}
              onChange={(e) => setRouteHour(Number(e.target.value))}
            >
              {[6, 12, 18, 22].map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refreshRoadsNow}
              disabled={!playback || Boolean(busy)}
              className="mt-3 w-full rounded-lg bg-teal-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Refresh road colours
            </button>
            {localRoads && (
              <div className="mt-3 space-y-1 text-xs text-stone-700">
                <p>
                  <span className="inline-block h-2 w-4 bg-[#c0392b] align-middle" /> Risky:{" "}
                  {localRoads.meta.n_risky}
                </p>
                <p>
                  <span className="inline-block h-2 w-4 bg-[#1e8449] align-middle" /> Safer:{" "}
                  {localRoads.meta.n_safe}
                </p>
                <p>Total near elephant: {localRoads.meta.n_roads}</p>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-stone-800">5 · Comp-4 safe path</h2>
            <p className="mt-1 text-xs text-stone-500">
              After Comp-3 roads load: tap <strong>where you are</strong> and{" "}
              <strong>where you want to go</strong> inside the teal wander zone on the map.
              Comp-4 shows threat circles + shortest (grey dashed) + safe (green) paths.
            </p>
            <div className="mt-2 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setComp4PickMode("origin");
                }}
                disabled={!localRoads || Boolean(busy)}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                  comp4PickMode === "origin"
                    ? "bg-blue-700 text-white"
                    : "border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                }`}
              >
                1 · Tap where I am on map
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setComp4PickMode("dest");
                }}
                disabled={!localRoads || Boolean(busy)}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                  comp4PickMode === "dest"
                    ? "bg-violet-700 text-white"
                    : "border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100"
                }`}
              >
                2 · Tap where I want to go
              </button>
              <button
                type="button"
                onClick={() => void runComp4Route()}
                disabled={
                  !localRoads || !routePickStart || !routePickEnd || Boolean(busy)
                }
                className="w-full rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                3 · Run Comp-4 routes
              </button>
              {(routePickStart || routePickEnd || comp4PickMode) && (
                <button
                  type="button"
                  onClick={() => {
                    setRoutePickStart(null);
                    setRoutePickEnd(null);
                    setComp4PickMode(null);
                    clearComp4Routes();
                  }}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
                >
                  Clear picks & routes
                </button>
              )}
            </div>
            {localRoads && (
              <p className="mt-2 text-xs text-stone-600">
                {routePickStart ? "Start set" : "Start not set"} ·{" "}
                {routePickEnd ? "End set" : "End not set"}
                {comp4PickMode === "origin" && " — click the map for start"}
                {comp4PickMode === "dest" && " — click the map for destination"}
              </p>
            )}
            {comp4Meta && (
              <div className="mt-3 space-y-1 text-xs text-stone-700">
                {comp4Meta.message && (
                  <p className="rounded-md bg-slate-100 px-2 py-1.5 text-slate-800">
                    {comp4Meta.message}
                  </p>
                )}
                <p>Active threats: {comp4Meta.activeThreats}</p>
                <p>Threats on shortest path: {comp4Meta.threatsOnShortest}</p>
                <p>Route points: safe {comp4Meta.safePoints} · shortest {comp4Meta.shortPoints}</p>
              </div>
            )}
          </section>

          {localRoads?.meta?.advice && (
            <section className="rounded-xl border border-amber-300/80 bg-amber-50/90 p-3">
              <h2 className="text-sm font-semibold text-amber-950">Warning / advice</h2>
              <p className="mt-2 text-sm font-medium text-amber-950">
                {localRoads.meta.advice.headline}
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-amber-900">
                {localRoads.meta.advice.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {selectedRoad?.properties.explanation && (
            <section className="rounded-xl border border-sky-300/80 bg-sky-50/90 p-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-sky-950">
                  Why is this road flagged?
                </h2>
                <button
                  type="button"
                  className="text-xs text-sky-800 underline"
                  onClick={() => setSelectedRoad(null)}
                >
                  Clear
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-sky-950">
                {selectedRoad.properties.explanation.title}
              </p>
              <p className="mt-1 text-xs text-sky-900">
                Score{" "}
                <strong>
                  {selectedRoad.properties.explanation.segment_risk.toFixed(3)}
                </strong>{" "}
                · {selectedRoad.properties.explanation.risk_category}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-sky-900">
                {selectedRoad.properties.explanation.summary.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="mt-3 space-y-2 border-t border-sky-200 pt-2">
                {selectedRoad.properties.explanation.factors.map((f) => (
                  <div key={f.id}>
                    <p className="text-xs font-medium text-sky-950">{f.label}</p>
                    <p className="text-xs text-sky-900">{f.value}</p>
                    {f.note && (
                      <p className="text-[11px] text-sky-700/90">{f.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
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
            <h2 className="font-serif text-xl text-stone-900">
              {comp4PickMode === "origin"
                ? "Comp-4 · click map for where you are (inside teal zone)"
                : comp4PickMode === "dest"
                  ? "Comp-4 · click map for destination (inside teal zone)"
                  : mode === "play" && frame
                    ? `Elephant · t=${frame.t_hours.toFixed(2)} h · ${frame.alert ? "ALERT" : "ok"} · roads ${localRoads ? "on" : "…"}`
                    : predict
                      ? `Comp-1 · ${predict.district} — click a red hotspot, then run Comp-2`
                      : "Run Comp-1 to start"}
            </h2>
            {(localRoads || comp4SafeRoute) && (
              <div className="flex flex-wrap gap-3 text-xs text-stone-600">
                {localRoads && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-1 w-6 bg-[#c0392b]" />
                      risky
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-1 w-6 bg-[#1e8449]" />
                      safer
                    </span>
                  </>
                )}
                {comp4SafeRoute && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-1 w-6 bg-[#0d9488]" />
                      Comp-4 safe
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-1 w-6 border-b-2 border-dashed border-slate-400" />
                      shortest
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-500 opacity-60" />
                      threat zone
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {localRoads?.meta?.advice && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">{localRoads.meta.advice.headline}</p>
              <p className="mt-1 text-xs text-amber-900/90">
                {localRoads.meta.advice.bullets.slice(0, 2).join(" · ")}
              </p>
            </div>
          )}

          <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-stone-300 bg-stone-200 shadow-sm">
            {showMap ? (
              <HecMap
                cells={predict?.top_cells ?? []}
                selectedId={selected?.cell_id ?? null}
                onSelect={(c) => {
                  setSelected(c);
                  setPlayback(null);
                  setLocalRoads(null);
                  setSelectedRoad(null);
                  clearComp4Routes();
                  setPlaying(false);
                }}
                playback={playback}
                frameIdx={frameIdx}
                showTrue={showTrue}
                mode={mode}
                localRoads={localRoads}
                selectedRoadId={selectedRoad?.properties.edge_id ?? null}
                onSelectRoad={setSelectedRoad}
                comp4SafeRoute={comp4SafeRoute}
                comp4ShortRoute={comp4ShortRoute}
                comp4Threats={comp4Threats}
                comp4Origin={comp4Origin}
                comp4Dest={comp4Dest}
                wanderZone={wanderZone}
                routePickStart={routePickStart}
                routePickEnd={routePickEnd}
                comp4PickMode={comp4PickMode}
                onMapRoutePick={localRoads ? handleMapRoutePick : undefined}
                disableCellSelect={comp4PickMode !== null}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-stone-600">
                Start APIs :8003 / :8001 / :8002 / :5001, then run Comp-1.
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-stone-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Error</p>
              <p className="text-2xl font-semibold">
                {frame ? `${frame.error_m.toFixed(0)} m` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-stone-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Uncertainty 2σ</p>
              <p className="text-2xl font-semibold">
                {frame ? `${frame.uncertainty_radius_m.toFixed(0)} m` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-stone-300 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Risky / safer roads</p>
              <p className="text-2xl font-semibold">
                {localRoads
                  ? `${localRoads.meta.n_risky} / ${localRoads.meta.n_safe}`
                  : "—"}
              </p>
            </div>
          </div>
          {(localRoads?.meta?.honesty || playback?.disclaimer) && (
            <p className="text-xs text-stone-500">
              {localRoads?.meta?.honesty || playback?.disclaimer}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
