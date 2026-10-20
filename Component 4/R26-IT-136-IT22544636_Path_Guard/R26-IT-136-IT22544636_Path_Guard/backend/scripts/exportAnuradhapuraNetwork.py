"""
Export Comp-3 road subgraph for Comp-4 (Anuradhapura / Comp-2 sim corridor).

Builds a connected graph along the elephant sim path using nearby OSM edges
plus short corridor links where the rural graph is disconnected.

Run from repo root:
  python "Component 4/.../backend/scripts/exportAnuradhapuraNetwork.py"
"""
from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[5]
COMP3 = ROOT / "component-3-safe-roads"
COMP2_PLAYBACK = ROOT / "component-2-tracker" / "outputs" / "tracks" / "playback.json"
EDGES_GEOJSON = COMP3 / "data" / "processed" / "road_edges.geojson"
OUT = Path(__file__).resolve().parents[1] / "data" / "anuradhapura_network.json"

PATH_BUFFER_M = 2200
CHAIN_STEP = 8
NODE_ROUND_M = 5.0
FALLBACK_CX, FALLBACK_CY = 210500.0, 397500.0
_to_wgs = Transformer.from_crs("EPSG:5234", "EPSG:4326", always_xy=True)


def node_id_to_lng_lat(node_id: str) -> tuple[float, float]:
    kx, ky = map(int, node_id.split("_"))
    return _to_wgs.transform(kx * NODE_ROUND_M, ky * NODE_ROUND_M)


def node_id_to_xy(node_id: str) -> tuple[float, float]:
    kx, ky = map(int, node_id.split("_"))
    return kx * NODE_ROUND_M, ky * NODE_ROUND_M


def nearest_node(x: float, y: float, nodes: set[str]) -> str:
    best = None
    best_d = float("inf")
    for nid in nodes:
        nx, ny = node_id_to_xy(nid)
        d = math.hypot(nx - x, ny - y)
        if d < best_d:
            best_d = d
            best = nid
    return best or next(iter(nodes))


def bfs_path(adj: dict[str, list[str]], start: str, end: str) -> list[str]:
    if start == end:
        return [start]
    q = deque([start])
    prev: dict[str, str | None] = {start: None}
    while q:
        u = q.popleft()
        if u == end:
            path: list[str] = []
            cur: str | None = end
            while cur is not None:
                path.append(cur)
                cur = prev[cur]
            return list(reversed(path))
        for v in adj.get(u, []):
            if v not in prev:
                prev[v] = u
                q.append(v)
    return []


def load_sim_path(playback_path: Path | None = None) -> list[tuple[float, float]]:
    path = playback_path or COMP2_PLAYBACK
    if not path.exists():
        return [(FALLBACK_CX, FALLBACK_CY)]
    pb = json.loads(path.read_text(encoding="utf-8"))
    frames = pb.get("frames") or []
    to_5234 = Transformer.from_crs("EPSG:4326", "EPSG:5234", always_xy=True)
    pts: list[tuple[float, float]] = []
    for f in frames:
        if f.get("x_est") is not None and f.get("y_est") is not None:
            pts.append((float(f["x_est"]), float(f["y_est"])))
        elif f.get("lat_est") is not None and f.get("lon_est") is not None:
            x, y = to_5234.transform(float(f["lon_est"]), float(f["lat_est"]))
            pts.append((float(x), float(y)))
    if not pts:
        return [(FALLBACK_CX, FALLBACK_CY)]
    if len(pts) > CHAIN_STEP * 30:
        pts = pts[::CHAIN_STEP]
    return pts


def min_dist_to_path(cx: float, cy: float, path_pts: list[tuple[float, float]]) -> float:
    return min(math.hypot(cx - px, cy - py) for px, py in path_pts)


def sim_centroid(path_pts: list[tuple[float, float]]) -> tuple[float, float]:
    xs = [p[0] for p in path_pts]
    ys = [p[1] for p in path_pts]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Export Comp-4 road subgraph for current sim")
    parser.add_argument(
        "--playback-file",
        type=Path,
        default=None,
        help="Playback JSON with frames (x_est/y_est or lat_est/lon_est)",
    )
    args = parser.parse_args()

    if not EDGES_GEOJSON.exists():
        raise SystemExit(f"Missing {EDGES_GEOJSON} — run Comp-3 build_road_graph.py")

    path_pts = load_sim_path(args.playback_file)
    sim_cx, sim_cy = sim_centroid(path_pts)

    fc = json.loads(EDGES_GEOJSON.read_text(encoding="utf-8"))
    features = fc.get("features") or []

    edge_by_pair: dict[tuple[str, str], tuple[float, str]] = {}
    buffer_adj: dict[str, list[str]] = {}
    buffer_nodes: set[str] = set()

    for feat in features:
        props = feat.get("properties") or {}
        u = str(props.get("u") or "")
        v = str(props.get("v") or "")
        if not u or not v:
            continue
        cx = float(props.get("cx", 0))
        cy = float(props.get("cy", 0))
        if min_dist_to_path(cx, cy, path_pts) > PATH_BUFFER_M:
            continue
        length = float(props.get("length_m", 0) or 0)
        name = str(props.get("name") or props.get("highway") or "OSM road")
        pair = (u, v) if u <= v else (v, u)
        edge_by_pair[pair] = (length, name)
        buffer_nodes.add(u)
        buffer_nodes.add(v)
        buffer_adj.setdefault(u, []).append(v)
        buffer_adj.setdefault(v, []).append(u)

    if not buffer_nodes:
        raise SystemExit("No road edges within path buffer — widen PATH_BUFFER_M")

    keys: set[str] = set(buffer_nodes)
    edges_out: dict[tuple[str, str], tuple[float, str]] = dict(edge_by_pair)
    corridor_links = 0

    # Chain nearest nodes along sim; bridge gaps with corridor links
    prev_nid = nearest_node(path_pts[0][0], path_pts[0][1], buffer_nodes)
    for px, py in path_pts[1:]:
        cur_nid = nearest_node(px, py, buffer_nodes)
        segment = bfs_path(buffer_adj, prev_nid, cur_nid)
        if segment:
            for i in range(len(segment) - 1):
                a, b = segment[i], segment[i + 1]
                pair = (a, b) if a <= b else (b, a)
                if pair not in edges_out:
                    ax, ay = node_id_to_xy(a)
                    bx, by = node_id_to_xy(b)
                    edges_out[pair] = (math.hypot(bx - ax, by - ay), "OSM road")
        else:
            pair = (prev_nid, cur_nid) if prev_nid <= cur_nid else (cur_nid, prev_nid)
            if pair not in edges_out:
                ax, ay = node_id_to_xy(prev_nid)
                bx, by = node_id_to_xy(cur_nid)
                edges_out[pair] = (math.hypot(bx - ax, by - ay), "Corridor link")
                corridor_links += 1
                buffer_adj.setdefault(prev_nid, []).append(cur_nid)
                buffer_adj.setdefault(cur_nid, []).append(prev_nid)
        prev_nid = cur_nid

    roads = []
    edge_map: dict[str, dict[str, dict]] = {nid: {} for nid in keys}

    for nid in sorted(keys):
        lng, lat = node_id_to_lng_lat(nid)
        roads.append(
            {
                "node_id": nid,
                "name": f"Junction {nid}",
                "coordinates": {"type": "Point", "coordinates": [lng, lat]},
                "edges": [],
            }
        )

    for (u, v), (length, name) in edges_out.items():
        if u not in keys or v not in keys:
            continue
        if length <= 0:
            ux, uy = node_id_to_lng_lat(u)
            vx, vy = node_id_to_lng_lat(v)
            length = math.hypot((vx - ux) * 111320, (vy - uy) * 110540)
        edge_map[u][v] = {
            "target_node": v,
            "distance": round(length, 1),
            "road_name": name,
        }
        edge_map[v][u] = {
            "target_node": u,
            "distance": round(length, 1),
            "road_name": name,
        }

    for road in roads:
        road["edges"] = list(edge_map[road["node_id"]].values())

    start_nid = nearest_node(path_pts[0][0], path_pts[0][1], keys)
    end_nid = nearest_node(path_pts[-1][0], path_pts[-1][1], keys)
    backbone_len = len(bfs_path(buffer_adj, start_nid, end_nid))

    payload = {
        "district": "Anuradhapura",
        "source": "component-3-safe-roads/road_edges.geojson",
        "sim_centroid_epsg5234": [sim_cx, sim_cy],
        "path_buffer_m": PATH_BUFFER_M,
        "corridor_links": corridor_links,
        "backbone_hops": backbone_len,
        "edge_count": len(edges_out),
        "node_count": len(roads),
        "roads": roads,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Wrote {len(roads)} nodes, {len(edges_out)} edges "
        f"({corridor_links} corridor links, backbone {backbone_len} hops) -> {OUT}"
    )


if __name__ == "__main__":
    main()
