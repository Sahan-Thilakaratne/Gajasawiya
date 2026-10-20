"""Convert Overpass JSON dumps to GeoPackage layers (Phase 2)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, polygonize, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CRS_GEOGRAPHIC, CRS_PROJECTED, DATA_PROCESSED, FILE_TAG, RAW_OSM


def _coords_from_element(el: dict) -> list[tuple[float, float]]:
    geom = el.get("geometry") or []
    return [(float(p["lon"]), float(p["lat"])) for p in geom if "lon" in p and "lat" in p]


def overpass_to_geoms(path: Path, prefer: str = "line") -> gpd.GeoDataFrame:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows: list[dict] = []
    for el in data.get("elements") or []:
        etype = el.get("type")
        tags = el.get("tags") or {}
        if etype == "node":
            lon, lat = el.get("lon"), el.get("lat")
            if lon is None or lat is None:
                continue
            rows.append(
                {
                    "osm_id": el.get("id"),
                    "osm_type": "node",
                    "name": tags.get("name"),
                    "highway": tags.get("highway"),
                    "waterway": tags.get("waterway"),
                    "place": tags.get("place"),
                    "landuse": tags.get("landuse"),
                    "boundary": tags.get("boundary"),
                    "leisure": tags.get("leisure"),
                    "geometry": Point(float(lon), float(lat)),
                }
            )
        elif etype == "way":
            coords = _coords_from_element(el)
            if len(coords) < 2:
                continue
            closed = len(coords) >= 4 and coords[0] == coords[-1]
            if prefer == "polygon" and closed:
                geom = Polygon(coords)
            elif prefer == "polygon" and not closed:
                # treat as line for now
                geom = LineString(coords)
            else:
                geom = LineString(coords)
                if prefer == "auto" and closed:
                    geom = Polygon(coords)
            if geom.is_empty:
                continue
            rows.append(
                {
                    "osm_id": el.get("id"),
                    "osm_type": "way",
                    "name": tags.get("name"),
                    "highway": tags.get("highway"),
                    "waterway": tags.get("waterway"),
                    "place": tags.get("place"),
                    "landuse": tags.get("landuse"),
                    "boundary": tags.get("boundary"),
                    "leisure": tags.get("leisure"),
                    "natural": tags.get("natural"),
                    "geometry": geom,
                }
            )
        elif etype == "relation":
            # Collect member ways' geometries if present (Overpass out geom)
            # Relations in our dump may include full geometry on members via "members"
            members = el.get("members") or []
            rings: list[LineString] = []
            for m in members:
                if m.get("type") != "way":
                    continue
                coords = [
                    (float(p["lon"]), float(p["lat"]))
                    for p in (m.get("geometry") or [])
                    if "lon" in p and "lat" in p
                ]
                if len(coords) >= 2:
                    rings.append(LineString(coords))
            if not rings and el.get("geometry"):
                coords = _coords_from_element(el)
                if len(coords) >= 2:
                    rings.append(LineString(coords))
            if not rings:
                continue
            merged = unary_union(rings)
            polys = list(polygonize(merged))
            if polys:
                geom = unary_union(polys)
            else:
                geom = merged
            if geom.is_empty:
                continue
            rows.append(
                {
                    "osm_id": el.get("id"),
                    "osm_type": "relation",
                    "name": tags.get("name"),
                    "highway": tags.get("highway"),
                    "waterway": tags.get("waterway"),
                    "place": tags.get("place"),
                    "landuse": tags.get("landuse"),
                    "boundary": tags.get("boundary"),
                    "leisure": tags.get("leisure"),
                    "natural": tags.get("natural"),
                    "geometry": geom,
                }
            )

    if not rows:
        return gpd.GeoDataFrame(geometry=[], crs=CRS_GEOGRAPHIC)
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=CRS_GEOGRAPHIC)
    return gdf


def main() -> None:
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    out = DATA_PROCESSED / "osm_layers.gpkg"
    if out.exists():
        out.unlink()

    specs = [
        (f"roads_{FILE_TAG}_overpass.json", "roads", "line"),
        (f"water_{FILE_TAG}_overpass.json", "water", "auto"),
        (f"settlements_{FILE_TAG}_overpass.json", "settlements", "auto"),
        (f"protected_areas_osm_{FILE_TAG}_overpass.json", "protected", "polygon"),
    ]
    for fname, layer, prefer in specs:
        path = RAW_OSM / fname
        print(f"Converting {fname} -> {layer}")
        gdf = overpass_to_geoms(path, prefer=prefer)
        # Drop invalid
        gdf = gdf[gdf.geometry.notnull() & ~gdf.geometry.is_empty].copy()
        gdf = gdf.set_crs(CRS_GEOGRAPHIC)
        gdf_proj = gdf.to_crs(CRS_PROJECTED)
        print(f"  {len(gdf_proj)} features")
        gdf_proj.to_file(out, layer=layer, driver="GPKG")
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
