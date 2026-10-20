"""
Build Anuradhapura road graph from Comp-1 OSM roads.

Graph edges follow consecutive OSM vertices (good connectivity).
ML segments are ~MAX_SEGMENT_M chops along each way (for the dataset).

Outputs (data/processed/):
  - road_nodes.parquet
  - road_edges.parquet      (graph micro-edges — routing)
  - road_segments.parquet   (chopped segments — ML)
  - road_graph.gpickle
  - road_graph_meta.json
  - road_segments.geojson   (WGS84)
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import pandas as pd
from shapely.geometry import LineString
from shapely.ops import substring

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    COMP1_OSM_GPKG,
    CRS_PROJECTED,
    CRS_WGS84,
    DATA_PROCESSED,
    KEEP_HIGHWAY,
    MAX_SEGMENT_M,
    MIN_SEGMENT_M,
    NODE_ROUND_M,
)


def _node_key(x: float, y: float) -> tuple[int, int]:
    return (int(round(x / NODE_ROUND_M)), int(round(y / NODE_ROUND_M)))


def _chop_line(geom: LineString, max_m: float) -> list[LineString]:
    length = float(geom.length)
    if length < MIN_SEGMENT_M:
        return []
    if length <= max_m:
        return [geom]
    n = max(int(length // max_m) + 1, 2)
    step = length / n
    parts: list[LineString] = []
    for i in range(n):
        a, b = i * step, min((i + 1) * step, length)
        piece = substring(geom, a, b)
        if piece.geom_type == "LineString" and not piece.is_empty and piece.length >= MIN_SEGMENT_M:
            parts.append(piece)
    return parts


def load_roads() -> gpd.GeoDataFrame:
    if not COMP1_OSM_GPKG.exists():
        raise FileNotFoundError(f"Missing {COMP1_OSM_GPKG} — run Comp-1 convert_osm.py")
    roads = gpd.read_file(COMP1_OSM_GPKG, layer="roads")
    if roads.crs is None:
        roads = roads.set_crs(CRS_PROJECTED)
    else:
        roads = roads.to_crs(CRS_PROJECTED)
    hw = roads["highway"].fillna("").astype(str).str.lower()
    roads = roads[hw.isin(KEEP_HIGHWAY)].copy()
    roads = roads[roads.geometry.notnull() & ~roads.geometry.is_empty]
    roads = roads.explode(index_parts=False).reset_index(drop=True)
    roads = roads[roads.geometry.geom_type == "LineString"].copy()
    return roads


def build_graph_and_segments(
    roads: gpd.GeoDataFrame,
) -> tuple[nx.MultiGraph, pd.DataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame]:
    G = nx.MultiGraph()
    node_xy: dict[tuple[int, int], tuple[float, float]] = {}
    micro_rows: list[dict] = []
    seg_rows: list[dict] = []
    micro_id = 0
    seg_id = 0

    for _, row in roads.iterrows():
        geom: LineString = row.geometry
        if geom is None or geom.is_empty:
            continue
        highway = str(row.get("highway") or "")
        osm_id = row.get("osm_id")
        name = row.get("name")
        coords = list(geom.coords)
        if len(coords) < 2:
            continue

        # --- routing micro-edges along full vertex chain ---
        for i in range(len(coords) - 1):
            x0, y0 = float(coords[i][0]), float(coords[i][1])
            x1, y1 = float(coords[i + 1][0]), float(coords[i + 1][1])
            k0, k1 = _node_key(x0, y0), _node_key(x1, y1)
            if k0 == k1:
                continue
            node_xy.setdefault(k0, (x0, y0))
            node_xy.setdefault(k1, (x1, y1))
            seg = LineString([(node_xy[k0][0], node_xy[k0][1]), (node_xy[k1][0], node_xy[k1][1])])
            length = float(seg.length)
            if length < 1.0:
                continue
            eid = f"M{micro_id:07d}"
            micro_id += 1
            mid = seg.interpolate(0.5, normalized=True)
            G.add_node(k0, x=node_xy[k0][0], y=node_xy[k0][1])
            G.add_node(k1, x=node_xy[k1][0], y=node_xy[k1][1])
            G.add_edge(
                k0,
                k1,
                key=eid,
                edge_id=eid,
                length_m=length,
                highway=highway,
                osm_id=osm_id,
            )
            micro_rows.append(
                {
                    "edge_id": eid,
                    "u": f"{k0[0]}_{k0[1]}",
                    "v": f"{k1[0]}_{k1[1]}",
                    "length_m": length,
                    "highway": highway,
                    "osm_id": osm_id,
                    "cx": float(mid.x),
                    "cy": float(mid.y),
                    "geometry": seg,
                }
            )

        # --- ML segments (chopped) ---
        for part in _chop_line(geom, MAX_SEGMENT_M):
            mid = part.interpolate(0.5, normalized=True)
            sid = f"S{seg_id:06d}"
            seg_id += 1
            seg_rows.append(
                {
                    "edge_id": sid,
                    "length_m": float(part.length),
                    "highway": highway,
                    "osm_id": osm_id,
                    "name": name,
                    "cx": float(mid.x),
                    "cy": float(mid.y),
                    "geometry": part,
                }
            )

    nodes = pd.DataFrame(
        [
            {"node_id": f"{k[0]}_{k[1]}", "kx": k[0], "ky": k[1], "x": xy[0], "y": xy[1]}
            for k, xy in node_xy.items()
        ]
    )
    micros = gpd.GeoDataFrame(micro_rows, geometry="geometry", crs=CRS_PROJECTED)
    segments = gpd.GeoDataFrame(seg_rows, geometry="geometry", crs=CRS_PROJECTED)
    return G, nodes, micros, segments


def largest_component_stats(G: nx.MultiGraph) -> dict:
    if G.number_of_nodes() == 0:
        return {"n_components": 0, "largest_nodes": 0, "largest_edges": 0}
    comps = list(nx.connected_components(G))
    largest = max(comps, key=len)
    sub = G.subgraph(largest)
    return {
        "n_components": len(comps),
        "largest_nodes": sub.number_of_nodes(),
        "largest_edges": sub.number_of_edges(),
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
    }


def main() -> None:
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    print("Loading roads…")
    roads = load_roads()
    print(f"  {len(roads)} ways after highway filter")

    print("Building graph + ML segments…")
    G, nodes, micros, segments = build_graph_and_segments(roads)
    stats = largest_component_stats(G)
    print(f"  micro-edges={stats['total_edges']} nodes={stats['total_nodes']}")
    print(f"  components={stats['n_components']} largest_nodes={stats['largest_nodes']}")
    print(f"  ML segments={len(segments)}")

    nodes_path = DATA_PROCESSED / "road_nodes.parquet"
    edges_path = DATA_PROCESSED / "road_edges.parquet"
    segs_path = DATA_PROCESSED / "road_segments.parquet"
    graph_path = DATA_PROCESSED / "road_graph.gpickle"
    meta_path = DATA_PROCESSED / "road_graph_meta.json"
    geojson_path = DATA_PROCESSED / "road_segments.geojson"

    nodes.to_parquet(nodes_path, index=False)
    micros.to_parquet(edges_path, index=False)
    segments.to_parquet(segs_path, index=False)
    with graph_path.open("wb") as f:
        pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)

    segs_wgs = segments.to_crs(CRS_WGS84)
    if len(segs_wgs) > 60000:
        segs_wgs = segs_wgs.sample(60000, random_state=42)
    segs_wgs.to_file(geojson_path, driver="GeoJSON")

    meta = {
        "district": "Anuradhapura",
        "crs": CRS_PROJECTED,
        "max_segment_m": MAX_SEGMENT_M,
        "node_round_m": NODE_ROUND_M,
        "keep_highway": sorted(KEEP_HIGHWAY),
        "stats": stats,
        "n_ml_segments": len(segments),
        "files": {
            "nodes": nodes_path.name,
            "routing_edges": edges_path.name,
            "ml_segments": segs_path.name,
            "graph": graph_path.name,
            "geojson": geojson_path.name,
        },
        "note": "Routing uses road_edges (micro); ML dataset uses road_segments (chopped).",
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved {nodes_path}")
    print(f"Saved {edges_path}")
    print(f"Saved {segs_path}")
    print(f"Saved {graph_path}")


if __name__ == "__main__":
    main()
