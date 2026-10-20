"""
Phase 0.2 — Download Anuradhapura District boundary as GeoJSON.

Uses OpenStreetMap Nominatim (public). Cite OSM / ODbL in the report.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Allow running as: python src/download_study_area.py
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (  # noqa: E402
    CRS_GEOGRAPHIC,
    DATA_PROCESSED,
    DISTRICT_NAME,
    NOMINATIM_QUERY,
    STUDY_AREA_GEOJSON,
)


def fetch_nominatim_polygon(query: str) -> dict:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "geojson",
            "polygon_geojson": 1,
            "limit": 1,
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "HEC-DangerMap-StudentProject/1.0 (research; educational)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pick_best_feature(fc: dict) -> dict:
    features = fc.get("features") or []
    if not features:
        raise RuntimeError(
            f"No Nominatim result for query. Check spelling / network: {NOMINATIM_QUERY}"
        )

    # Prefer polygon / multipolygon over point
    for f in features:
        geom = (f.get("geometry") or {}).get("type", "")
        if geom in ("Polygon", "MultiPolygon"):
            return f

    raise RuntimeError(
        "Nominatim returned a result but no polygon geometry. "
        "Try again later or download a GADM/geoBoundaries admin boundary manually."
    )


def wrap_feature_collection(feature: dict) -> dict:
    props = dict(feature.get("properties") or {})
    props.update(
        {
            "district": DISTRICT_NAME,
            "source": "OpenStreetMap Nominatim",
            "licence": "ODbL (OpenStreetMap contributors)",
            "crs_note": f"Coordinates in {CRS_GEOGRAPHIC} (WGS84)",
            "query": NOMINATIM_QUERY,
        }
    )
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": props,
                "geometry": feature["geometry"],
            }
        ],
    }


def main() -> None:
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    print(f"Fetching boundary: {NOMINATIM_QUERY}")
    time.sleep(1)  # be polite to Nominatim
    raw = fetch_nominatim_polygon(NOMINATIM_QUERY)
    feature = pick_best_feature(raw)
    out = wrap_feature_collection(feature)
    STUDY_AREA_GEOJSON.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {STUDY_AREA_GEOJSON}")
    print(f"Geometry type: {feature['geometry']['type']}")
    print("Phase 0.2 done — study area boundary ready.")


if __name__ == "__main__":
    main()
