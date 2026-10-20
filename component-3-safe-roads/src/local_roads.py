"""
Local road risk near Comp-2 elephant wandering area.

Colouring is proximity-first for the demo:
  - Near elephant circle / recent path → tend RED
  - Farther in the buffer → GREEN unless Comp-1 land risk is extreme

Model segment_risk still informs fringe/far decisions and tooltips.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import LineString, mapping
from shapely.ops import transform as shp_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    DATA_PROCESSED,
    FORCE_RED_UNDER_CIRCLE,
    FRINGE_EXTRA_M,
    LOCAL_BUFFER_M,
    MODEL_FAR_RED,
    MODEL_FRINGE_RED,
    MODEL_NEAR_RED,
    PATH_NEAR_M,
)
from advice import build_advice
from features import load_comp1_grid
from predict_risk import score_edges
from road_explain import explain_road

DEFAULT_BUFFER_M = LOCAL_BUFFER_M

_SEGMENTS: pd.DataFrame | None = None
_to_wgs = Transformer.from_crs("EPSG:5234", "EPSG:4326", always_xy=True)


def _load_segments() -> pd.DataFrame:
    global _SEGMENTS
    if _SEGMENTS is not None:
        return _SEGMENTS
    path = DATA_PROCESSED / "road_segments.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path} — run build_road_graph.py")
    df = pd.read_parquet(path)
    if "geometry" in df.columns and len(df) and not hasattr(df["geometry"].iloc[0], "geom_type"):
        df["geometry"] = df["geometry"].apply(
            lambda g: wkb.loads(g) if isinstance(g, (bytes, bytearray)) else g
        )
    _SEGMENTS = df
    return _SEGMENTS


def _project_line_wgs84(geom: LineString) -> dict:
    def _xy(x, y, z=None):
        lon, lat = _to_wgs.transform(x, y)
        return (lon, lat)

    return mapping(shp_transform(_xy, geom))


def _min_path_dist(
    cx: np.ndarray,
    cy: np.ndarray,
    path_xy: list[tuple[float, float]] | None,
) -> np.ndarray:
    if not path_xy:
        return np.full(len(cx), np.inf, dtype=float)
    pts = np.asarray(path_xy, dtype=float)
    # subsample long trails
    if len(pts) > 80:
        pts = pts[:: max(1, len(pts) // 80)]
    # pairwise min distance (n_edges x n_path) — path is small
    dmin = np.full(len(cx), np.inf, dtype=float)
    for px, py in pts:
        dmin = np.minimum(dmin, np.hypot(cx - px, cy - py))
    return dmin


def classify_proximity_risk(
    *,
    model_risk: float,
    elephant_dist_m: float,
    path_dist_m: float,
    elephant_radius_m: float,
) -> tuple[str, str, str]:
    """
    Returns (risk_class, color, reason_code).

    Near animal / path → red easily; far → green unless land risk extreme.
    """
    radius = max(float(elephant_radius_m), 1.0)
    near_dist = min(float(elephant_dist_m), float(path_dist_m))
    under_circle = float(elephant_dist_m) <= radius
    near_path = float(path_dist_m) <= PATH_NEAR_M
    near_zone = under_circle or near_path or near_dist <= radius
    fringe_zone = (not near_zone) and (near_dist <= radius + FRINGE_EXTRA_M)

    if near_zone:
        if FORCE_RED_UNDER_CIRCLE and under_circle:
            return "risky", "#c0392b", "under_circle"
        if near_path and model_risk >= MODEL_NEAR_RED * 0.5:
            return "risky", "#c0392b", "near_path"
        if model_risk >= MODEL_NEAR_RED or near_path:
            return "risky", "#c0392b", "near_elephant"
        # very low model score but still next to path → amber-red caution
        if near_path or under_circle:
            return "risky", "#c0392b", "proximity_caution"
        return "safe", "#1e8449", "near_but_low_model"

    if fringe_zone:
        if model_risk >= MODEL_FRINGE_RED:
            return "risky", "#c0392b", "fringe_land_risk"
        return "safe", "#1e8449", "fringe_ok"

    # Outer buffer: only extreme corridor risk
    if model_risk >= MODEL_FAR_RED:
        return "risky", "#c0392b", "far_extreme_land"
    return "safe", "#1e8449", "far_safe"


def local_road_risk(
    *,
    elephant_xy: tuple[float, float],
    elephant_radius_m: float = 500.0,
    hour_of_day: int = 18,
    buffer_m: float = DEFAULT_BUFFER_M,
    path_xy: list[tuple[float, float]] | None = None,
    max_features: int = 2500,
) -> dict[str, Any]:
    segs = _load_segments()
    ex, ey = elephant_xy
    reach = float(elephant_radius_m) + float(buffer_m)

    cx = segs["cx"].to_numpy(dtype=float)
    cy = segs["cy"].to_numpy(dtype=float)
    dist_e = np.hypot(cx - ex, cy - ey)
    dist_path = _min_path_dist(cx, cy, path_xy)
    near_any = np.minimum(dist_e, dist_path)

    # Search: circle+buffer OR near recent path corridor
    path_band = max(float(buffer_m), PATH_NEAR_M + 200.0)
    mask = (dist_e <= reach) | (dist_path <= path_band)

    local = segs.loc[mask].copy()
    if local.empty:
        advice = build_advice(
            elephant_xy=elephant_xy,
            elephant_radius_m=float(elephant_radius_m),
            hour_of_day=int(hour_of_day),
            scored_risky=pd.DataFrame(),
            n_risky=0,
            n_safe=0,
        )
        return {
            "type": "FeatureCollection",
            "features": [],
            "meta": {
                "n_roads": 0,
                "n_risky": 0,
                "n_safe": 0,
                "search_radius_m": reach,
                "hour_of_day": hour_of_day,
                "advice": advice,
                "colour_mode": "proximity_first",
                "honesty": "No roads found near elephant estimate.",
            },
        }

    # Prefer segments closest to elephant/path for the map cap
    if len(local) > max_features:
        local = (
            local.assign(_d=near_any[mask])
            .nsmallest(max_features, "_d")
            .drop(columns=["_d"])
        )

    scored = score_edges(
        local.drop(columns=["geometry"], errors="ignore"),
        hour_of_day=hour_of_day,
        elephant_xy=elephant_xy,
        elephant_radius_m=elephant_radius_m,
        grid=load_comp1_grid(),
        already_enriched=False,
    )
    geom_map = local.set_index("edge_id")["geometry"]
    scored["geometry"] = scored["edge_id"].map(geom_map)
    if "name" in local.columns:
        scored["name"] = scored["edge_id"].map(local.set_index("edge_id")["name"])
    else:
        scored["name"] = None

    scored_cx = scored["cx"].to_numpy(dtype=float)
    scored_cy = scored["cy"].to_numpy(dtype=float)
    scored_path = _min_path_dist(scored_cx, scored_cy, path_xy)

    features: list[dict] = []
    n_risky = n_safe = 0
    risky_rows: list[dict] = []
    reason_counts: dict[str, int] = {}

    for i, (_, row) in enumerate(scored.iterrows()):
        risk = float(row["segment_risk"])
        geom = row.get("geometry")
        if geom is None or geom.is_empty:
            continue
        e_dist = float(row.get("elephant_dist_m", 1e9))
        p_dist = float(scored_path[i]) if i < len(scored_path) else 1e9
        risk_class, color, reason = classify_proximity_risk(
            model_risk=risk,
            elephant_dist_m=e_dist,
            path_dist_m=p_dist,
            elephant_radius_m=elephant_radius_m,
        )
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
        if risk_class == "risky":
            n_risky += 1
            risky_rows.append(row.to_dict())
        else:
            n_safe += 1
        if not isinstance(geom, LineString):
            try:
                geom = LineString(geom)
            except Exception:
                continue
        road_name = row.get("name")
        if road_name is not None and (isinstance(road_name, float) and np.isnan(road_name)):
            road_name = None
        under_circle = e_dist <= max(float(elephant_radius_m), 1.0)
        path_dist_out = round(p_dist, 1) if np.isfinite(p_dist) else None
        explanation = explain_road(
            row,
            risk_class=risk_class,
            display_reason=reason,
            elephant_radius_m=float(elephant_radius_m),
            path_dist_m=path_dist_out,
            hour_of_day=int(hour_of_day),
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "edge_id": row["edge_id"],
                    "segment_risk": round(risk, 4),
                    "display_reason": reason,
                    "risk_class": risk_class,
                    "color": color,
                    "length_m": round(float(row["length_m"]), 1),
                    "highway": str(row.get("highway") or ""),
                    "name": str(road_name) if road_name else None,
                    "under_circle": bool(under_circle),
                    "elephant_dist_m": round(e_dist, 1),
                    "path_dist_m": path_dist_out,
                    "land_risk": round(float(row.get("risk_mean") or 0.0), 4),
                    "explanation": explanation,
                },
                "geometry": _project_line_wgs84(geom),
            }
        )

    risky_df = pd.DataFrame(risky_rows) if risky_rows else pd.DataFrame()
    advice = build_advice(
        elephant_xy=elephant_xy,
        elephant_radius_m=float(elephant_radius_m),
        hour_of_day=int(hour_of_day),
        scored_risky=risky_df,
        n_risky=n_risky,
        n_safe=n_safe,
    )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "n_roads": len(features),
            "n_risky": n_risky,
            "n_safe": n_safe,
            "search_radius_m": reach,
            "elephant_radius_m": float(elephant_radius_m),
            "buffer_m": float(buffer_m),
            "hour_of_day": hour_of_day,
            "colour_mode": "proximity_first",
            "colour_rules": {
                "path_near_m": PATH_NEAR_M,
                "fringe_extra_m": FRINGE_EXTRA_M,
                "model_near_red": MODEL_NEAR_RED,
                "model_fringe_red": MODEL_FRINGE_RED,
                "model_far_red": MODEL_FAR_RED,
                "force_red_under_circle": FORCE_RED_UNDER_CIRCLE,
            },
            "reason_counts": reason_counts,
            "advice": advice,
            "honesty": (
                "Road colours are proximity-first to the Comp-2 elephant circle/path, "
                "with the corridor model used mainly for fringe/far stretches — "
                "not official road closures."
            ),
        },
    }
