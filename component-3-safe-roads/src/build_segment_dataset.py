"""
Build road-segment training dataset for Colab.

Target y (proxy label — not official DWC incidents):
  y = 1 if segment looks like a conflict-exposed corridor:
       mean Comp-1 risk_score >= LABEL_RISK_MIN
       AND (mean human_exposure >= LABEL_HUMAN_EXPOSURE_MIN
            OR mean dist_settlement_m <= LABEL_DIST_SETTLEMENT_M
            OR mean forest_edge >= LABEL_FOREST_EDGE_FRAC)

Static features from Comp-1 risk/feature grids sampled at segment midpoint
(+ optional densified mean along the line).

Also writes augmented rows with hour_of_day + elephant_dist_m synthetic
columns so Colab can train a model that reacts at demo time.

Outputs:
  data/processed/segment_dataset.parquet
  data/processed/segment_dataset_meta.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    AUGMENT_HOURS,
    COMP1_FEATURE_GRID,
    COMP1_RISK_PARQUET,
    DATA_PROCESSED,
    ELEPHANT_DIST_BINS_M,
    LABEL_DIST_SETTLEMENT_M,
    LABEL_FOREST_EDGE_FRAC,
    LABEL_HUMAN_EXPOSURE_MIN,
    LABEL_RISK_MIN,
    LABEL_RISK_PERCENTILE,
    MODELS_DIR,
)


FEATURE_COLS_STATIC = [
    "length_m",
    "risk_mean",
    "risk_max",
    "habitat_suitability",
    "human_exposure",
    "frac_tree",
    "frac_crop",
    "frac_built",
    "forest_edge",
    "dist_settlement_m",
    "dist_water_m",
    "dist_road_m",
    "pop_density_approx",
    "elevation_m",
    "highway_code",
]

HIGHWAY_CODES = {
    "motorway": 6,
    "trunk": 5,
    "primary": 4,
    "secondary": 3,
    "tertiary": 2,
    "unclassified": 1,
    "residential": 1,
    "living_street": 1,
    "road": 1,
    "primary_link": 4,
    "secondary_link": 3,
    "tertiary_link": 2,
    "trunk_link": 5,
    "motorway_link": 6,
}


def _load_edges() -> pd.DataFrame:
    """Prefer chopped ML segments; fall back to routing edges."""
    segs = DATA_PROCESSED / "road_segments.parquet"
    path = segs if segs.exists() else DATA_PROCESSED / "road_edges.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Run build_road_graph.py first — missing {path}")
    print(f"  using {path.name}")
    return pd.read_parquet(path)


def _load_grid() -> pd.DataFrame:
    risk = pd.read_parquet(COMP1_RISK_PARQUET)
    # merge richer features if available
    if COMP1_FEATURE_GRID.exists():
        feat = pd.read_parquet(COMP1_FEATURE_GRID)
        keep = [
            c
            for c in [
                "cell_id",
                "cx",
                "cy",
                "frac_tree",
                "frac_crop",
                "frac_built",
                "forest_edge",
                "dist_settlement_m",
                "dist_water_m",
                "dist_road_m",
                "pop_density_approx",
                "elevation_m",
                "habitat_suitability",
                "human_exposure",
                "risk_score",
            ]
            if c in feat.columns or c in risk.columns
        ]
        # risk may already have risk_score / habitat / human
        cols_r = [c for c in risk.columns if c in {"cell_id", "cx", "cy", "risk_score", "habitat_suitability", "human_exposure", "forest_edge"}]
        base = risk[cols_r].copy()
        extra = [c for c in keep if c not in base.columns and c in feat.columns]
        if extra:
            base = base.merge(feat[["cell_id"] + extra], on="cell_id", how="left")
        return base
    return risk


def _nearest_cells(edges: pd.DataFrame, grid: pd.DataFrame) -> pd.DataFrame:
    gxy = np.column_stack(
        [
            pd.to_numeric(grid["cx"], errors="coerce").to_numpy(),
            pd.to_numeric(grid["cy"], errors="coerce").to_numpy(),
        ]
    )
    tree = cKDTree(gxy)
    ex = edges["cx"].to_numpy()
    ey = edges["cy"].to_numpy()
    dist, idx = tree.query(np.column_stack([ex, ey]), k=1)
    near = grid.iloc[idx].reset_index(drop=True)
    near = near.add_prefix("g_")
    out = edges.reset_index(drop=True).join(near)
    out["grid_dist_m"] = dist
    return out


def _make_static(df: pd.DataFrame) -> pd.DataFrame:
    def col(*names, default=np.nan):
        for n in names:
            if n in df.columns:
                return pd.to_numeric(df[n], errors="coerce")
        return pd.Series(default, index=df.index, dtype=float)

    out = pd.DataFrame(
        {
            "edge_id": df["edge_id"],
            "u": df.get("u"),
            "v": df.get("v"),
            "cx": df["cx"],
            "cy": df["cy"],
            "length_m": pd.to_numeric(df["length_m"], errors="coerce"),
            "highway": df.get("highway", ""),
            "risk_mean": col("g_risk_score", "risk_score"),
            "risk_max": col("g_risk_score", "risk_score"),  # single sample; densify later if needed
            "habitat_suitability": col("g_habitat_suitability", "habitat_suitability"),
            "human_exposure": col("g_human_exposure", "human_exposure"),
            "frac_tree": col("g_frac_tree", "frac_tree", default=0.0),
            "frac_crop": col("g_frac_crop", "frac_crop", default=0.0),
            "frac_built": col("g_frac_built", "frac_built", default=0.0),
            "forest_edge": col("g_forest_edge", "forest_edge", default=0.0),
            "dist_settlement_m": col("g_dist_settlement_m", "dist_settlement_m", default=5000.0),
            "dist_water_m": col("g_dist_water_m", "dist_water_m", default=5000.0),
            "dist_road_m": col("g_dist_road_m", "dist_road_m", default=0.0),
            "pop_density_approx": col("g_pop_density_approx", "pop_density_approx", default=0.0),
            "elevation_m": col("g_elevation_m", "elevation_m", default=0.0),
            "grid_dist_m": df.get("grid_dist_m", 0.0),
            "cell_id": df.get("g_cell_id"),
        }
    )
    out["highway_code"] = (
        out["highway"].astype(str).str.lower().map(HIGHWAY_CODES).fillna(1).astype(int)
    )

    # Proxy label: top-percentile Comp-1 risk on roads AND people/farm edge
    risk_cut = float(out["risk_mean"].quantile(LABEL_RISK_PERCENTILE / 100.0))
    risk_cut = max(risk_cut, LABEL_RISK_MIN)
    risk_ok = out["risk_mean"] >= risk_cut
    human_ok = (
        (out["human_exposure"] >= LABEL_HUMAN_EXPOSURE_MIN)
        | (out["dist_settlement_m"] <= LABEL_DIST_SETTLEMENT_M)
        | (out["forest_edge"] >= LABEL_FOREST_EDGE_FRAC)
        | (out["frac_crop"] >= 0.12)
    )
    out["y"] = (risk_ok & human_ok).astype(int)
    out["label_risk_cutoff"] = risk_cut
    out["label_rule"] = "top_risk_percentile_and_human_edge_proxy"
    return out


def _diurnal_factor(hour: int) -> float:
    # elephants often more active dusk/dawn — soft prior for features
    if hour in (5, 6, 7, 17, 18, 19):
        return 1.0
    if hour in (20, 21, 22, 4):
        return 0.7
    return 0.25


def _augment(static: pd.DataFrame) -> pd.DataFrame:
    """Expand each segment with a few (hour, elephant_dist) scenarios for Colab."""
    rows = []
    base = static
    if len(base) > 40000:
        base = base.sample(40000, random_state=42)

    rng = np.random.default_rng(42)
    for hour in AUGMENT_HOURS:
        for edist in ELEPHANT_DIST_BINS_M:
            chunk = base.copy()
            chunk["hour_of_day"] = hour
            chunk["diurnal_activity"] = _diurnal_factor(hour)
            jitter = rng.uniform(0.85, 1.15, size=len(chunk))
            chunk["elephant_dist_m"] = edist * jitter
            chunk["elephant_circle_overlap"] = (chunk["elephant_dist_m"] < 400).astype(int)
            # Dynamic positives: circle on moderately risky corridor
            force = (chunk["elephant_circle_overlap"] == 1) & (chunk["risk_mean"] >= 0.02)
            chunk.loc[force, "y"] = 1
            rows.append(chunk)

    # Baseline: midday, elephant far
    base2 = static.copy()
    base2["hour_of_day"] = 12
    base2["diurnal_activity"] = _diurnal_factor(12)
    base2["elephant_dist_m"] = 8000.0
    base2["elephant_circle_overlap"] = 0
    rows.append(base2)

    return pd.concat(rows, ignore_index=True)


def main() -> None:
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading edges + Comp-1 grid…")
    edges = _load_edges()
    grid = _load_grid()
    print(f"  edges={len(edges)} grid_cells={len(grid)}")

    joined = _nearest_cells(edges, grid)
    static = _make_static(joined)
    pos = int(static["y"].sum())
    print(f"  static labels: positives={pos} ({100 * pos / max(len(static), 1):.1f}%)")

    print("Augmenting with hour / elephant-distance scenarios…")
    full = _augment(static)
    pos2 = int(full["y"].sum())
    print(f"  dataset rows={len(full)} positives={pos2} ({100 * pos2 / max(len(full), 1):.1f}%)")

    # spatial split key: grid cell iy/ix if present else cy buckets
    full["spatial_fold"] = (pd.to_numeric(full["cy"], errors="coerce") // 5000).astype("Int64")

    out_path = DATA_PROCESSED / "segment_dataset.parquet"
    meta_path = DATA_PROCESSED / "segment_dataset_meta.json"
    static_path = DATA_PROCESSED / "segment_features_static.parquet"

    static.to_parquet(static_path, index=False)
    full.to_parquet(out_path, index=False)

    feature_cols = FEATURE_COLS_STATIC + [
        "hour_of_day",
        "diurnal_activity",
        "elephant_dist_m",
        "elephant_circle_overlap",
    ]
    meta = {
        "target": "y",
        "target_meaning": "P(conflict-exposed road corridor) — proxy label",
        "label_rule": {
            "risk_percentile": LABEL_RISK_PERCENTILE,
            "risk_floor": LABEL_RISK_MIN,
            "and_any_of": {
                "human_exposure_min": LABEL_HUMAN_EXPOSURE_MIN,
                "dist_settlement_m_max": LABEL_DIST_SETTLEMENT_M,
                "forest_edge_min": LABEL_FOREST_EDGE_FRAC,
                "frac_crop_min": 0.12,
            },
            "dynamic_nudge": "elephant_circle_overlap & risk_mean>=0.02 → y=1",
        },
        "feature_columns": feature_cols,
        "n_rows": len(full),
        "n_positives": pos2,
        "n_static_segments": len(static),
        "honesty": (
            "Labels are research proxies from Comp-1 overlap risk and settlement/farm edge, "
            "plus synthetic elephant proximity — not official crash or DWC incident records."
        ),
        "files": {
            "dataset": out_path.name,
            "static": static_path.name,
        },
        "colab": {
            "model_out": "road_risk_model.joblib",
            "features_out": "feature_columns.json",
            "suggested_model": "XGBClassifier or HistGradientBoostingClassifier",
            "split": "Group by spatial_fold or cell_id — avoid random i.i.d. leak",
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved {out_path}")
    print(f"Saved {static_path}")
    print(f"Saved {meta_path}")
    print("Next: upload segment_dataset.parquet to Colab — see docs/colab_notes.md")


if __name__ == "__main__":
    main()
