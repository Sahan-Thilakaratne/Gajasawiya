"""
Component 3 — Safe-road finder API (port 8002).

Primary demo endpoint: POST /api/v1/local_roads
  → red/green road segments near Comp-2 elephant wandering area.

Also keeps POST /api/v1/route for optional A→B shortest vs safer.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from config import API_PORT, CRS_PROJECTED, CRS_WGS84, DISTRICT  # noqa: E402
from local_roads import DEFAULT_BUFFER_M, local_road_risk  # noqa: E402
from run_route import compute_route  # noqa: E402

app = FastAPI(
    title="HEC Component 3 — Safe-road finder",
    version="0.2.0",
    description=(
        "Scores roads near the Comp-2 elephant area (risky=red, safe=green). "
        "Optional A→B risk-aware routing also available."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_to_proj = Transformer.from_crs(CRS_WGS84, CRS_PROJECTED, always_xy=True)


class LonLat(BaseModel):
    lon: float
    lat: float


class LocalRoadsRequest(BaseModel):
    elephant_lon: float
    elephant_lat: float
    elephant_radius_m: float = Field(500.0, ge=0)
    hour_of_day: int = Field(18, ge=0, le=23)
    buffer_m: float = Field(DEFAULT_BUFFER_M, ge=200, le=10000)
    path: Optional[list[LonLat]] = Field(
        None,
        description="Optional recent Comp-2 path points (WGS84) to expand the search",
    )
    max_features: int = Field(2500, ge=100, le=8000)


class RouteRequest(BaseModel):
    origin_lon: Optional[float] = Field(None, description="WGS84 longitude")
    origin_lat: Optional[float] = Field(None, description="WGS84 latitude")
    dest_lon: Optional[float] = Field(None, description="WGS84 longitude")
    dest_lat: Optional[float] = Field(None, description="WGS84 latitude")
    hour_of_day: int = Field(18, ge=0, le=23)
    elephant_lon: Optional[float] = None
    elephant_lat: Optional[float] = None
    elephant_radius_m: float = 0.0
    use_demo_od: bool = Field(
        False,
        description="If true (or origin/dest omitted), use built-in far-apart demo OD",
    )


@app.get("/health")
def health() -> dict[str, Any]:
    model = ROOT / "models" / "road_risk_model.joblib"
    return {
        "ok": True,
        "component": 3,
        "district": DISTRICT,
        "port": API_PORT,
        "model_present": model.exists(),
    }


@app.post("/api/v1/local_roads")
def local_roads(req: LocalRoadsRequest) -> dict[str, Any]:
    """Red/green roads near Comp-2 elephant estimate (+ optional path)."""
    try:
        ex, ey = _to_proj.transform(req.elephant_lon, req.elephant_lat)
        path_xy = None
        if req.path:
            # subsample long trails
            pts = req.path[:: max(1, len(req.path) // 40)]
            path_xy = [_to_proj.transform(p.lon, p.lat) for p in pts]
        return local_road_risk(
            elephant_xy=(ex, ey),
            elephant_radius_m=req.elephant_radius_m,
            hour_of_day=req.hour_of_day,
            buffer_m=req.buffer_m,
            path_xy=path_xy,
            max_features=req.max_features,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/v1/route")
def route(req: RouteRequest) -> dict[str, Any]:
    try:
        origin_xy = dest_xy = None
        if (
            not req.use_demo_od
            and req.origin_lon is not None
            and req.origin_lat is not None
            and req.dest_lon is not None
            and req.dest_lat is not None
        ):
            ox, oy = _to_proj.transform(req.origin_lon, req.origin_lat)
            dx, dy = _to_proj.transform(req.dest_lon, req.dest_lat)
            origin_xy, dest_xy = (ox, oy), (dx, dy)

        elephant_xy = None
        if req.elephant_lon is not None and req.elephant_lat is not None:
            elephant_xy = _to_proj.transform(req.elephant_lon, req.elephant_lat)

        return compute_route(
            origin_xy=origin_xy,
            dest_xy=dest_xy,
            hour_of_day=req.hour_of_day,
            elephant_xy=elephant_xy,
            elephant_radius_m=req.elephant_radius_m,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/")
def root() -> dict[str, str]:
    return {
        "docs": "/docs",
        "health": "/health",
        "local_roads": "POST /api/v1/local_roads",
        "route": "POST /api/v1/route",
    }
