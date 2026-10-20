"""
Component 1 — REST API for frontend / Component 4.

Run from project root:
  .\\.venv\\Scripts\\activate
  uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from predict_risk import (  # noqa: E402
    AVAILABLE_DISTRICTS,
    COMING_SOON_DISTRICTS,
    district_is_ready,
    predict_district,
)

HANDOFF = ROOT / "handoff"
OUTPUTS_MAPS = ROOT / "outputs" / "maps"
CACHE_DIR = ROOT / "outputs" / "api_cache"

app = FastAPI(
    title="HEC Component 1 — Danger Map API",
    description=(
        "Overlap risk = habitat_suitability × human_exposure. "
        "Anuradhapura and Polonnaruwa are ready. Research demo — not an official DWC feed."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if HANDOFF.exists():
    app.mount("/static/handoff", StaticFiles(directory=str(HANDOFF)), name="handoff")
if OUTPUTS_MAPS.exists():
    app.mount("/static/maps", StaticFiles(directory=str(OUTPUTS_MAPS)), name="maps")

_to_wgs84 = Transformer.from_crs("EPSG:5234", "EPSG:4326", always_xy=True)


class PredictRequest(BaseModel):
    district: str = Field(
        default="Anuradhapura",
        examples=["Anuradhapura", "Polonnaruwa"],
    )
    month: int | None = Field(
        None,
        ge=1,
        le=12,
        description="Calendar month 1–12 for NASA POWER rainfall (default: today)",
    )
    as_of: date | None = Field(
        None,
        description="Optional date; month is taken from this if month is omitted",
    )
    use_rainfall: bool = Field(
        True,
        description="Inject month climate + seasonal dry/wet risk shift",
    )
    top_n: int = Field(50, ge=1, le=5000, description="Top-N cells by risk in the JSON body")
    include_all_cells: bool = Field(
        False,
        description="If true, return every cell (large). Prefer risk_cells_geojson asset.",
    )
    min_risk: float = Field(0.0, ge=0.0, le=1.0)
    refresh: bool = Field(True, description="Re-run model inference when true")


def _df_to_cells(df: pd.DataFrame) -> list[dict[str, Any]]:
    lons, lats = _to_wgs84.transform(df["cx"].to_numpy(), df["cy"].to_numpy())
    rows = []
    for i, (_, r) in enumerate(df.iterrows()):
        rows.append(
            {
                "cell_id": str(r["cell_id"]),
                "lon": float(lons[i]),
                "lat": float(lats[i]),
                "risk_score": float(r["risk_score"]),
                "risk_score_0_100": float(r["risk_score_0_100"]),
                "habitat_suitability": float(r["habitat_suitability"]),
                "human_exposure": float(r["human_exposure"]),
                "explanation": str(r.get("explanation", "")),
                "why": str(r.get("why", "")),
                "tags": str(r.get("tags", "")),
                "forest_edge": int(r.get("forest_edge", 0) or 0),
            }
        )
    return rows


def _run_and_cache(
    district: str,
    month: int | None = None,
    as_of: date | None = None,
    use_rainfall: bool = True,
) -> tuple[pd.DataFrame, dict]:
    df, meta = predict_district(
        district,
        as_of=as_of,
        month=month,
        use_rainfall=use_rainfall,
    )
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mk = (meta.get("climate") or {}).get("month_key", "ANN")
    key = f"{district.lower()}_{mk}"
    df.to_parquet(CACHE_DIR / f"{key}_live.parquet", index=False)
    (CACHE_DIR / f"{key}_live_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    # also keep district-default cache for older clients
    df.to_parquet(CACHE_DIR / f"{district.lower()}_live.parquet", index=False)
    (CACHE_DIR / f"{district.lower()}_live_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    return df, meta


def _load_cached(district: str) -> tuple[pd.DataFrame, dict]:
    key = district.lower()
    pq = CACHE_DIR / f"{key}_live.parquet"
    meta_path = CACHE_DIR / f"{key}_live_meta.json"
    if not pq.exists() or not meta_path.exists():
        return _run_and_cache(district)
    return pd.read_parquet(pq), json.loads(meta_path.read_text(encoding="utf-8"))


def _bbox(df: pd.DataFrame) -> dict[str, float]:
    lons, lats = _to_wgs84.transform(df["cx"].to_numpy(), df["cy"].to_numpy())
    return {
        "min_lon": float(np.min(lons)),
        "min_lat": float(np.min(lats)),
        "max_lon": float(np.max(lons)),
        "max_lat": float(np.max(lats)),
    }


def _asset_urls(district: str) -> dict[str, str]:
    return {
        "boundary_geojson": f"/api/v1/boundary/{district}",
        "risk_cells_geojson": f"/api/v1/risk-geojson/{district}",
        "risk_raster_geotiff": f"/api/v1/risk-raster/{district}",
        "risk_preview_png": "/static/handoff/risk_preview.png",
        "risk_explanations_json": "/static/handoff/risk_explanations.json",
        "manifest": "/static/handoff/manifest.json",
        "methods_note": "/static/handoff/methods_note.md",
        "colour_breaks": "/static/handoff/colour_breaks.md",
        "openapi_docs": "/docs",
    }


def _predict_payload(
    district: str,
    top_n: int,
    min_risk: float,
    include_all_cells: bool,
    refresh: bool,
    month: int | None = None,
    as_of: date | None = None,
    use_rainfall: bool = True,
) -> dict:
    if not district_is_ready(district):
        raise HTTPException(
            status_code=400,
            detail=f"District not ready. Available: {list(AVAILABLE_DISTRICTS)}",
        )
    try:
        if refresh:
            df, meta = _run_and_cache(district, month=month, as_of=as_of, use_rainfall=use_rainfall)
        else:
            df, meta = _load_cached(district)
    except FileNotFoundError as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Prediction failed: {err}") from err

    filtered = df[df["risk_score"] >= min_risk]
    top = filtered.nlargest(top_n, "risk_score")
    payload: dict[str, Any] = {
        "district": district,
        "meta": meta,
        "bbox_wgs84": _bbox(df),
        "top_cells": _df_to_cells(top),
        "assets": _asset_urls(district),
        "n_cells_total": int(len(df)),
        "n_top_returned": int(len(top)),
        "note": (
            "top_cells come from live model inference with optional rainfall month. "
            "For the full polygon layer use assets.risk_cells_geojson."
        ),
    }
    if include_all_cells:
        payload["cells"] = _df_to_cells(filtered)
        payload["n_cells_returned"] = len(payload["cells"])
    return payload


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "component": 1, "service": "danger-map"}


@app.get("/api/v1/districts")
def districts() -> dict:
    ready = [
        {
            "id": name,
            "ready": True,
            "grid_resolution_m": 500,
            "crs_geographic": "EPSG:4326",
            "crs_projected": "EPSG:5234",
        }
        for name in AVAILABLE_DISTRICTS
    ]
    soon = [{"id": n, "ready": False} for n in COMING_SOON_DISTRICTS]
    return {
        "districts": ready + soon,
        "default": "Anuradhapura",
        "risk_formula": (
            "habitat_suitability * human_exposure * seasonal_rainfall_multiplier"
        ),
    }


@app.post("/api/v1/predict")
def predict_post(body: PredictRequest) -> dict:
    """Run district risk model (inference) for the UI."""
    return _predict_payload(
        body.district,
        body.top_n,
        body.min_risk,
        body.include_all_cells,
        body.refresh,
        month=body.month,
        as_of=body.as_of,
        use_rainfall=body.use_rainfall,
    )


@app.get("/api/v1/predict/{district}")
def predict_get(
    district: str,
    top_n: int = Query(50, ge=1, le=5000),
    min_risk: float = Query(0.0, ge=0.0, le=1.0),
    refresh: bool = Query(True),
    include_all_cells: bool = Query(False),
    month: int | None = Query(None, ge=1, le=12),
    use_rainfall: bool = Query(True),
) -> dict:
    return _predict_payload(
        district,
        top_n,
        min_risk,
        include_all_cells,
        refresh,
        month=month,
        use_rainfall=use_rainfall,
    )


@app.get("/api/v1/cells/{cell_id}")
def get_cell(cell_id: str, district: str = Query("Anuradhapura")) -> dict:
    if not district_is_ready(district):
        raise HTTPException(status_code=400, detail="District not ready")
    df, meta = _load_cached(district)
    hit = df[df["cell_id"] == cell_id]
    if hit.empty:
        # try fresh predict once
        df, meta = _run_and_cache(district)
        hit = df[df["cell_id"] == cell_id]
    if hit.empty:
        raise HTTPException(status_code=404, detail=f"Unknown cell_id: {cell_id}")
    return {"district": district, "cell": _df_to_cells(hit)[0], "meta": meta}


@app.get("/api/v1/boundary/{district}")
def boundary(district: str) -> FileResponse:
    if not district_is_ready(district):
        raise HTTPException(status_code=400, detail="District not ready")
    path = Path(AVAILABLE_DISTRICTS[district]["boundary"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Boundary file missing")
    return FileResponse(path, media_type="application/geo+json", filename="study_area.geojson")


def _district_map_dir(district: str) -> Path:
    """Anuradhapura uses legacy outputs/maps; other districts use outputs/<slug>/maps."""
    if district == "Anuradhapura":
        return OUTPUTS_MAPS
    return ROOT / "outputs" / district.lower() / "maps"


@app.get("/api/v1/risk-geojson/{district}")
def risk_geojson(district: str) -> FileResponse:
    if not district_is_ready(district):
        raise HTTPException(status_code=400, detail="District not ready")
    dmaps = _district_map_dir(district)
    candidates = [
        dmaps / "risk_cells.geojson",
        HANDOFF / "risk_cells.geojson" if district == "Anuradhapura" else None,
        OUTPUTS_MAPS / "risk_cells.geojson" if district == "Anuradhapura" else None,
    ]
    path = next((p for p in candidates if p is not None and p.exists()), None)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"risk_cells.geojson missing for {district}",
        )
    return FileResponse(path, media_type="application/geo+json", filename="risk_cells.geojson")


@app.get("/api/v1/risk-raster/{district}")
def risk_raster(district: str) -> FileResponse:
    if not district_is_ready(district):
        raise HTTPException(status_code=400, detail="District not ready")
    dmaps = _district_map_dir(district)
    candidates = [
        dmaps / "risk_surface.tif",
        HANDOFF / "risk_surface.tif" if district == "Anuradhapura" else None,
        OUTPUTS_MAPS / "risk_surface.tif" if district == "Anuradhapura" else None,
    ]
    path = next((p for p in candidates if p is not None and p.exists()), None)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"risk_surface.tif missing for {district}",
        )
    return FileResponse(path, media_type="image/tiff", filename="risk_surface.tif")


@app.get("/api/v1/assets/{district}")
def assets(district: str) -> dict:
    if not district_is_ready(district):
        raise HTTPException(status_code=400, detail="District not ready")
    return {"district": district, "assets": _asset_urls(district)}
