"""Shared feature helpers for Comp-3 inference."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from config import (
    COMP1_FEATURE_GRID,
    COMP1_RISK_PARQUET,
    MODELS_DIR,
)

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


def diurnal_activity(hour: int) -> float:
    if hour in (5, 6, 7, 17, 18, 19):
        return 1.0
    if hour in (20, 21, 22, 4):
        return 0.7
    return 0.25


def load_feature_columns() -> list[str]:
    path = MODELS_DIR / "feature_columns.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    meta = Path(__file__).resolve().parents[1] / "data" / "processed" / "segment_dataset_meta.json"
    return json.loads(meta.read_text(encoding="utf-8"))["feature_columns"]


def load_comp1_grid() -> pd.DataFrame:
    risk = pd.read_parquet(COMP1_RISK_PARQUET)
    if not COMP1_FEATURE_GRID.exists():
        return risk
    feat = pd.read_parquet(COMP1_FEATURE_GRID)
    cols_r = [
        c
        for c in risk.columns
        if c
        in {
            "cell_id",
            "cx",
            "cy",
            "risk_score",
            "habitat_suitability",
            "human_exposure",
            "forest_edge",
        }
    ]
    base = risk[cols_r].copy()
    extra = [
        c
        for c in [
            "frac_tree",
            "frac_crop",
            "frac_built",
            "dist_settlement_m",
            "dist_water_m",
            "dist_road_m",
            "pop_density_approx",
            "elevation_m",
            "habitat_suitability",
            "human_exposure",
            "forest_edge",
        ]
        if c in feat.columns and c not in base.columns
    ]
    if extra:
        base = base.merge(feat[["cell_id"] + extra], on="cell_id", how="left")
    return base


def attach_grid_features(edges: pd.DataFrame, grid: pd.DataFrame | None = None) -> pd.DataFrame:
    if grid is None:
        grid = load_comp1_grid()
    edges = edges.reset_index(drop=True)
    gxy = np.column_stack(
        [
            pd.to_numeric(grid["cx"], errors="coerce").to_numpy(),
            pd.to_numeric(grid["cy"], errors="coerce").to_numpy(),
        ]
    )
    tree = cKDTree(gxy)
    ex = edges["cx"].to_numpy(dtype=float)
    ey = edges["cy"].to_numpy(dtype=float)
    _, idx = tree.query(np.column_stack([ex, ey]), k=1)
    near = grid.iloc[idx].reset_index(drop=True)

    def gcol(name: str, default: float = 0.0) -> pd.Series:
        if name in near.columns:
            return pd.to_numeric(near[name], errors="coerce").fillna(default)
        return pd.Series(default, index=edges.index, dtype=float)

    out = edges.copy()
    out["risk_mean"] = gcol("risk_score")
    out["risk_max"] = gcol("risk_score")
    out["habitat_suitability"] = gcol("habitat_suitability")
    out["human_exposure"] = gcol("human_exposure")
    out["frac_tree"] = gcol("frac_tree")
    out["frac_crop"] = gcol("frac_crop")
    out["frac_built"] = gcol("frac_built")
    out["forest_edge"] = gcol("forest_edge")
    out["dist_settlement_m"] = gcol("dist_settlement_m", 5000.0)
    out["dist_water_m"] = gcol("dist_water_m", 5000.0)
    out["dist_road_m"] = gcol("dist_road_m", 0.0)
    out["pop_density_approx"] = gcol("pop_density_approx")
    out["elevation_m"] = gcol("elevation_m")
    out["highway_code"] = (
        out["highway"].astype(str).str.lower().map(HIGHWAY_CODES).fillna(1).astype(int)
    )
    return out


def add_dynamic_features(
    edges: pd.DataFrame,
    *,
    hour_of_day: int = 12,
    elephant_xy: tuple[float, float] | None = None,
    elephant_radius_m: float = 0.0,
) -> pd.DataFrame:
    out = edges.copy()
    out["hour_of_day"] = int(hour_of_day)
    out["diurnal_activity"] = diurnal_activity(int(hour_of_day))
    if elephant_xy is None:
        out["elephant_dist_m"] = 8000.0
        out["elephant_circle_overlap"] = 0
    else:
        ex, ey = elephant_xy
        dist = np.hypot(out["cx"].to_numpy(dtype=float) - ex, out["cy"].to_numpy(dtype=float) - ey)
        out["elephant_dist_m"] = dist
        out["elephant_circle_overlap"] = (dist <= max(float(elephant_radius_m), 1.0)).astype(int)
    return out


def feature_matrix(edges: pd.DataFrame, feature_cols: list[str] | None = None) -> pd.DataFrame:
    cols = feature_cols or load_feature_columns()
    X = pd.DataFrame(index=edges.index)
    for c in cols:
        if c in edges.columns:
            X[c] = pd.to_numeric(edges[c], errors="coerce").fillna(0.0)
        else:
            X[c] = 0.0
    return X[cols]
