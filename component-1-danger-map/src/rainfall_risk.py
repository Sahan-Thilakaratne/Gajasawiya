"""
Date/month rainfall for Comp-1 risk maps.

Uses NASA POWER monthly climatology (already downloaded) — NOT synthetic elephants.
At inference:
  1) Inject month-specific precip/temp into the feature grid
  2) Run the trained XGBoost habitat model
  3) Apply a documented dry/wet risk modulation (water vs crop-edge emphasis)

Honesty: climatology = typical month (2001–2020), not a live weather forecast.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

MONTH_KEYS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
]


def month_key(d: date | None = None, month: int | None = None) -> str:
    m = int(month) if month is not None else int((d or date.today()).month)
    if not 1 <= m <= 12:
        raise ValueError(f"month must be 1–12, got {m}")
    return MONTH_KEYS[m - 1]


def load_power_climatology(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Missing NASA POWER file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def climate_for_month(
    climate_json: Path,
    grid: pd.DataFrame,
    month: int,
    *,
    crs_projected: str = "EPSG:5234",
    crs_geographic: str = "EPSG:4326",
) -> pd.DataFrame:
    """
    IDW-interpolate NASA POWER point climatology for one calendar month
    onto Comp-1 cell centres. Returns temp_c, precip_mm, precip_ann_mm.
    """
    import geopandas as gpd

    payload = load_power_climatology(climate_json)
    key = month_key(month=month)

    pts = []
    for p in payload.get("points") or []:
        props = ((p.get("response") or {}).get("properties") or {}).get("parameter") or {}
        precip = props.get("PRECTOTCORR") or {}
        temp = props.get("T2M") or {}
        pts.append(
            {
                "lon": float(p["lon"]),
                "lat": float(p["lat"]),
                "temp_c": float(temp.get(key, temp.get("ANN", np.nan))),
                "precip_mm": float(precip.get(key, precip.get("ANN", np.nan))),
                "precip_ann_mm": float(precip.get("ANN", np.nan)),
            }
        )
    pdf = pd.DataFrame(pts)
    gpts = gpd.GeoDataFrame(
        pdf,
        geometry=gpd.points_from_xy(pdf["lon"], pdf["lat"]),
        crs=crs_geographic,
    ).to_crs(crs_projected)

    src_xy = np.column_stack([gpts.geometry.x.to_numpy(), gpts.geometry.y.to_numpy()])
    src_t = gpts["temp_c"].to_numpy(dtype=float)
    src_p = gpts["precip_mm"].to_numpy(dtype=float)
    src_a = gpts["precip_ann_mm"].to_numpy(dtype=float)

    t_out = np.empty(len(grid), dtype=float)
    p_out = np.empty(len(grid), dtype=float)
    a_out = np.empty(len(grid), dtype=float)
    cx = grid["cx"].to_numpy(dtype=float)
    cy = grid["cy"].to_numpy(dtype=float)
    for i, (x, y) in enumerate(zip(cx, cy)):
        d2 = (src_xy[:, 0] - x) ** 2 + (src_xy[:, 1] - y) ** 2
        d2 = np.maximum(d2, 1.0)
        w = 1.0 / d2
        sw = float(np.nansum(w))
        t_out[i] = float(np.nansum(w * src_t) / sw)
        p_out[i] = float(np.nansum(w * src_p) / sw)
        a_out[i] = float(np.nansum(w * src_a) / sw)

    return pd.DataFrame(
        {
            "temp_c": t_out,
            "precip_mm": p_out,
            "precip_ann_mm": a_out,
            "precip_anomaly": (p_out / np.maximum(a_out, 1e-6)) - 1.0,
        }
    )


def seasonal_risk_multiplier(df: pd.DataFrame) -> np.ndarray:
    """
    Documented ecological modulation (Anuradhapura / dry-zone HEC pattern):

    - Drier than annual average → elephants pull toward water & farm–forest edges
      → boost risk near water / forest_edge / settlements at the edge.
    - Wetter than average → crop / lowland use rises
      → boost risk on crop and forest–crop edges.

    Multiplier centred near 1.0 (typically ~0.75–1.45).
    """
    anomaly = pd.to_numeric(df.get("precip_anomaly", 0), errors="coerce").fillna(0.0).to_numpy()
    dry = np.clip(-anomaly, 0.0, 1.5)
    wet = np.clip(anomaly, 0.0, 1.5)

    dist_w = pd.to_numeric(df.get("dist_water_m", 5000), errors="coerce").fillna(5000).to_numpy()
    dist_s = pd.to_numeric(df.get("dist_settlement_m", 5000), errors="coerce").fillna(5000).to_numpy()
    frac_crop = pd.to_numeric(df.get("frac_crop", 0), errors="coerce").fillna(0).clip(0, 1).to_numpy()
    frac_tree = pd.to_numeric(df.get("frac_tree", 0), errors="coerce").fillna(0).clip(0, 1).to_numpy()
    forest_edge = pd.to_numeric(df.get("forest_edge", 0), errors="coerce").fillna(0).to_numpy()

    water_prox = np.exp(-dist_w / 2000.0)
    settle_prox = np.exp(-dist_s / 2500.0)
    edge = np.clip(forest_edge + frac_tree * frac_crop, 0, 1)

    dry_boost = dry * (0.45 * water_prox + 0.35 * edge + 0.20 * settle_prox * edge)
    wet_boost = wet * (0.50 * frac_crop + 0.50 * edge)

    # Scale so effects are visible but not crazy
    mult = 1.0 + 0.55 * dry_boost + 0.50 * wet_boost
    return np.clip(mult, 0.55, 1.75)


def apply_climate_to_grid(
    grid: pd.DataFrame,
    climate_json: Path,
    month: int,
) -> tuple[pd.DataFrame, dict]:
    """Copy grid, overwrite temp_c/precip_mm for month, attach anomaly columns."""
    out = grid.copy()
    clim = climate_for_month(climate_json, out, month)
    out["temp_c"] = clim["temp_c"].to_numpy()
    out["precip_mm"] = clim["precip_mm"].to_numpy()
    out["precip_ann_mm"] = clim["precip_ann_mm"].to_numpy()
    out["precip_anomaly"] = clim["precip_anomaly"].to_numpy()
    meta = {
        "month": int(month),
        "month_key": month_key(month=month),
        "mean_precip_mm_day": float(np.nanmean(out["precip_mm"])),
        "mean_temp_c": float(np.nanmean(out["temp_c"])),
        "mean_precip_anomaly": float(np.nanmean(out["precip_anomaly"])),
        "climate_source": "NASA POWER monthly climatology (2001–2020)",
        "climate_file": str(climate_json),
    }
    return out, meta
