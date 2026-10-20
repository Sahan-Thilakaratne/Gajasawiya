"""Load Colab model and score road edges → segment_risk."""
from __future__ import annotations

import sys
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_PROCESSED, LAMBDA_SEGMENT_RISK, MODELS_DIR
from features import (
    add_dynamic_features,
    attach_grid_features,
    feature_matrix,
    load_comp1_grid,
    load_feature_columns,
)

_MODEL = None
_STATIC_EDGES: pd.DataFrame | None = None
_GRID = None


def load_model():
    global _MODEL
    if _MODEL is None:
        path = MODELS_DIR / "road_risk_model.joblib"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path} — copy Colab export into models/")
        _MODEL = joblib.load(path)
    return _MODEL


def _static_edges() -> pd.DataFrame:
    """Routing edges with Comp-1 grid features attached (cached)."""
    global _STATIC_EDGES, _GRID
    cache = DATA_PROCESSED / "road_edges_static.parquet"
    if _STATIC_EDGES is not None:
        return _STATIC_EDGES
    if cache.exists():
        _STATIC_EDGES = pd.read_parquet(cache)
        return _STATIC_EDGES
    edges = pd.read_parquet(DATA_PROCESSED / "road_edges.parquet")
    if _GRID is None:
        _GRID = load_comp1_grid()
    enriched = attach_grid_features(edges.drop(columns=["geometry"], errors="ignore"), grid=_GRID)
    enriched.to_parquet(cache, index=False)
    _STATIC_EDGES = enriched
    return _STATIC_EDGES


def score_edges(
    edges: pd.DataFrame,
    *,
    hour_of_day: int = 12,
    elephant_xy: tuple[float, float] | None = None,
    elephant_radius_m: float = 0.0,
    model=None,
    grid: pd.DataFrame | None = None,
    already_enriched: bool = False,
) -> pd.DataFrame:
    """Return edges with segment_risk and safer_cost_m columns."""
    if model is None:
        model = load_model()
    feats = load_feature_columns()
    if already_enriched:
        enriched = edges
    else:
        enriched = attach_grid_features(edges, grid=grid)
    enriched = add_dynamic_features(
        enriched,
        hour_of_day=hour_of_day,
        elephant_xy=elephant_xy,
        elephant_radius_m=elephant_radius_m,
    )
    X = feature_matrix(enriched, feats)
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)[:, 1]
    else:
        proba = model.predict(X)
    out = enriched.copy()
    out["segment_risk"] = proba.astype(float)
    out["safer_cost_m"] = out["length_m"].astype(float) * (
        1.0 + float(LAMBDA_SEGMENT_RISK) * out["segment_risk"]
    )
    return out


def score_routing_edges(
    *,
    hour_of_day: int = 12,
    elephant_xy: tuple[float, float] | None = None,
    elephant_radius_m: float = 0.0,
    save: bool = False,
) -> pd.DataFrame:
    """Score every routing micro-edge (matches live feature set; uses static cache)."""
    base = _static_edges()
    scored = score_edges(
        base,
        hour_of_day=hour_of_day,
        elephant_xy=elephant_xy,
        elephant_radius_m=elephant_radius_m,
        already_enriched=True,
    )
    if save:
        out = DATA_PROCESSED / "road_edges_scored.parquet"
        scored.to_parquet(out, index=False)
        print(f"Saved {out} ({len(scored)} edges)")
    return scored


def main() -> None:
    scored = score_routing_edges(hour_of_day=18, save=True)
    print(scored["segment_risk"].describe())
    print("mean risk", float(scored["segment_risk"].mean()))


if __name__ == "__main__":
    main()
