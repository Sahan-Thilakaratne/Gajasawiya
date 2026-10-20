"""Geometry helpers that do not require GeoPandas (Phase 1 downloads)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from config import STUDY_AREA_GEOJSON


def load_study_area() -> dict:
    return json.loads(STUDY_AREA_GEOJSON.read_text(encoding="utf-8"))


def _rings_from_geometry(geom: dict) -> list[list[tuple[float, float]]]:
    """Return outer rings only (enough for bbox + point-in-polygon)."""
    gtype = geom.get("type")
    coords = geom.get("coordinates") or []
    rings: list[list[tuple[float, float]]] = []
    if gtype == "Polygon":
        if coords:
            rings.append([(float(x), float(y)) for x, y in coords[0]])
    elif gtype == "MultiPolygon":
        for poly in coords:
            if poly:
                rings.append([(float(x), float(y)) for x, y in poly[0]])
    else:
        raise ValueError(f"Unsupported geometry type: {gtype}")
    return rings


def study_area_rings() -> list[list[tuple[float, float]]]:
    fc = load_study_area()
    geom = fc["features"][0]["geometry"]
    return _rings_from_geometry(geom)


def bbox_from_rings(rings: Iterable[list[tuple[float, float]]]) -> dict[str, float]:
    xs: list[float] = []
    ys: list[float] = []
    for ring in rings:
        for x, y in ring:
            xs.append(x)
            ys.append(y)
    return {
        "min_lon": min(xs),
        "min_lat": min(ys),
        "max_lon": max(xs),
        "max_lat": max(ys),
    }


def study_area_bbox(pad: float = 0.02) -> dict[str, float]:
    """WGS84 bbox with a small pad so edge cells still get raster coverage."""
    b = bbox_from_rings(study_area_rings())
    return {
        "min_lon": b["min_lon"] - pad,
        "min_lat": b["min_lat"] - pad,
        "max_lon": b["max_lon"] + pad,
        "max_lat": b["max_lat"] + pad,
    }


def point_in_ring(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    """Ray casting; ring is (lon, lat)."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-16) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_study_area(lon: float, lat: float) -> bool:
    return any(point_in_ring(lon, lat, ring) for ring in study_area_rings())


def save_bbox_json(path: Path) -> dict[str, float]:
    bbox = study_area_bbox()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bbox, indent=2), encoding="utf-8")
    return bbox
