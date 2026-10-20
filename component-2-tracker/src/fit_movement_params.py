"""
Fit elephant movement parameters from Movebank GPS CSV.

Reads Kruger (or any Movebank-format) tracks from data/raw/movebank/,
estimates speed / turning / rest stats, writes data/processed/movement_params.json.

Honesty: foreign GPS → movement *statistics* transferred to Anuradhapura simulation.
Not DWC Sri Lankan collar data.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    DATA_PROCESSED,
    DATA_RAW,
    MOVEMENT_PARAMS_PATH,
    MOVEBANK_CITATION_DOI,
    MOVEBANK_STUDY_NAME,
)

MOVEBANK_DIR = DATA_RAW / "movebank" / MOVEBANK_STUDY_NAME
FIT_REPORT = DATA_PROCESSED / "movebank_fit_report.json"

# Prefer steps near Comp-2 sim cadence (15 min); allow 5–60 min
DT_MIN, DT_MAX = 4.0, 65.0
REST_SPEED_M_S = 0.05
MAX_PLAUSIBLE_SPEED = 3.0  # m/s hard reject (GPS glitches)


def find_gps_csv() -> Path:
    if not MOVEBANK_DIR.exists():
        raise FileNotFoundError(
            f"Missing {MOVEBANK_DIR}\nRun: python src/download_movebank.py"
        )
    candidates = sorted(MOVEBANK_DIR.glob("*.csv"))
    # Prefer main study file over reference-data
    main = [p for p in candidates if "reference" not in p.name.lower()]
    if not main:
        raise FileNotFoundError(f"No GPS CSV in {MOVEBANK_DIR}")
    # Largest non-reference file is usually the track table
    return max(main, key=lambda p: p.stat().st_size)


def _col(df: pd.DataFrame, *names: str) -> str | None:
    lower = {c.lower(): c for c in df.columns}
    for n in names:
        if n.lower() in lower:
            return lower[n.lower()]
    return None


def load_tracks(path: Path, max_rows: int | None = 400_000) -> pd.DataFrame:
    print(f"Loading {path} ...")
    df = pd.read_csv(path, low_memory=False, nrows=max_rows)
    lon_c = _col(df, "location-long", "location_long", "longitude", "long")
    lat_c = _col(df, "location-lat", "location_lat", "latitude", "lat")
    t_c = _col(df, "timestamp", "datetime", "date_time")
    id_c = _col(
        df,
        "individual-local-identifier",
        "tag-local-identifier",
        "individual_local_identifier",
        "tag_local_identifier",
        "animal_id",
        "id",
    )
    if not lon_c or not lat_c or not t_c:
        raise ValueError(f"CSV missing lon/lat/timestamp columns: {list(df.columns)[:20]}")

    out = pd.DataFrame(
        {
            "lon": pd.to_numeric(df[lon_c], errors="coerce"),
            "lat": pd.to_numeric(df[lat_c], errors="coerce"),
            "timestamp": pd.to_datetime(df[t_c], errors="coerce", utc=True),
            "animal_id": df[id_c].astype(str) if id_c else "unknown",
        }
    )
    out = out.dropna(subset=["lon", "lat", "timestamp"])
    out = out[(out["lat"].between(-35, -20)) & (out["lon"].between(20, 40))]  # Kruger-ish
    out = out.sort_values(["animal_id", "timestamp"]).reset_index(drop=True)
    print(f"Usable fixes: {len(out):,}  animals: {out['animal_id'].nunique()}")
    return out


def compute_steps(tracks: pd.DataFrame) -> pd.DataFrame:
    """Per-animal successive steps in metres (local UTM)."""
    # Kruger ~ UTM 36S
    tr = Transformer.from_crs("EPSG:4326", "EPSG:32736", always_xy=True)
    rows = []
    for aid, g in tracks.groupby("animal_id", sort=False):
        if len(g) < 3:
            continue
        lon = g["lon"].to_numpy()
        lat = g["lat"].to_numpy()
        ts = g["timestamp"].to_numpy()
        x, y = tr.transform(lon, lat)
        dx = np.diff(x)
        dy = np.diff(y)
        dt_s = np.diff(ts).astype("timedelta64[s]").astype(float)
        dist = np.hypot(dx, dy)
        heading = np.arctan2(dy, dx)
        turn = np.diff(heading)
        turn = (turn + np.pi) % (2 * np.pi) - np.pi
        # align lengths: turn has n-2; speed/dist have n-1
        for i in range(len(dist)):
            if dt_s[i] <= 0:
                continue
            dt_min = dt_s[i] / 60.0
            if not (DT_MIN <= dt_min <= DT_MAX):
                continue
            speed = dist[i] / dt_s[i]
            if speed > MAX_PLAUSIBLE_SPEED:
                continue
            turn_i = float(turn[i - 1]) if i >= 1 and i - 1 < len(turn) else 0.0
            rows.append(
                {
                    "animal_id": aid,
                    "dt_s": float(dt_s[i]),
                    "dt_min": float(dt_min),
                    "dist_m": float(dist[i]),
                    "speed_m_s": float(speed),
                    "turn_rad": turn_i,
                }
            )
    steps = pd.DataFrame(rows)
    print(f"Valid steps ({DT_MIN:.0f}–{DT_MAX:.0f} min): {len(steps):,}")
    return steps


def von_mises_kappa(angles: np.ndarray) -> float:
    """Approximate concentration from mean resultant length."""
    if len(angles) < 10:
        return 2.0
    R = np.hypot(np.mean(np.cos(angles)), np.mean(np.sin(angles)))
    R = float(np.clip(R, 1e-6, 0.999))
    # Banerjee approx
    kappa = R * (2 - R**2) / (1 - R**2)
    return float(np.clip(kappa, 0.3, 20.0))


def fit_params(steps: pd.DataFrame) -> dict:
    moving = steps[steps["speed_m_s"] >= REST_SPEED_M_S]
    resting = steps[steps["speed_m_s"] < REST_SPEED_M_S]
    speeds = moving["speed_m_s"].to_numpy()
    turns = moving["turn_rad"].to_numpy() if len(moving) else steps["turn_rad"].to_numpy()

    mean_v = float(np.median(speeds)) if len(speeds) else 0.35
    std_v = float(np.std(speeds)) if len(speeds) > 1 else 0.15
    p05 = float(np.percentile(speeds, 5)) if len(speeds) else 0.05
    p95 = float(np.percentile(speeds, 95)) if len(speeds) else 1.2
    kappa = von_mises_kappa(turns)
    p_rest = float(len(resting) / max(len(steps), 1))

    params = {
        "source": "movebank_fitted",
        "note": (
            "Fitted from Movebank Kruger elephant GPS (CC0). "
            "Statistics transferred to Anuradhapura simulation — NOT Sri Lankan DWC data."
        ),
        "citation_doi": MOVEBANK_CITATION_DOI,
        "study_name": MOVEBANK_STUDY_NAME,
        "mean_speed_m_s": round(mean_v, 4),
        "speed_std_m_s": round(std_v, 4),
        "min_speed_m_s": round(max(0.02, min(p05, mean_v * 0.3)), 4),
        "max_speed_m_s": round(min(MAX_PLAUSIBLE_SPEED, max(p95, mean_v * 1.5)), 4),
        "turning_kappa": round(kappa, 3),
        "rest_probability": round(float(np.clip(p_rest, 0.02, 0.45)), 4),
        "dt_minutes_reference": 15,
        "fit_n_steps": int(len(steps)),
        "fit_n_moving": int(len(moving)),
        "fit_n_animals": int(steps["animal_id"].nunique()) if len(steps) else 0,
        "fit_median_dt_min": round(float(steps["dt_min"].median()), 2) if len(steps) else None,
    }
    return params


def main() -> None:
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    csv_path = find_gps_csv()
    tracks = load_tracks(csv_path)
    steps = compute_steps(tracks)
    if len(steps) < 100:
        raise SystemExit(f"Too few steps to fit ({len(steps)}). Check CSV contents.")

    params = fit_params(steps)
    MOVEMENT_PARAMS_PATH.write_text(json.dumps(params, indent=2), encoding="utf-8")
    print(f"Wrote {MOVEMENT_PARAMS_PATH}")

    report = {
        "csv": str(csv_path),
        "params": params,
        "speed_percentiles_moving": {
            "p10": float(np.percentile(steps.loc[steps.speed_m_s >= REST_SPEED_M_S, "speed_m_s"], 10)),
            "p50": float(np.percentile(steps.loc[steps.speed_m_s >= REST_SPEED_M_S, "speed_m_s"], 50)),
            "p90": float(np.percentile(steps.loc[steps.speed_m_s >= REST_SPEED_M_S, "speed_m_s"], 90)),
        },
    }
    FIT_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {FIT_REPORT}")
    print(json.dumps(params, indent=2))


if __name__ == "__main__":
    main()
