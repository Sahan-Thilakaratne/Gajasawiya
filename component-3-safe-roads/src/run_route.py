"""
Risk-aware routing: shortest (length) vs safer (model segment_risk costs).
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import LineString, mapping

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    CRS_PROJECTED,
    CRS_WGS84,
    DATA_PROCESSED,
    HIGH_RISK_PRED,
    LAMBDA_SEGMENT_RISK,
    OUTPUTS_ROUTES,
)
from predict_risk import score_routing_edges


def _node_key_from_id(node_id: str) -> tuple[int, int]:
    a, b = node_id.split("_", 1)
    return (int(a), int(b))


def load_graph() -> nx.MultiGraph:
    path = DATA_PROCESSED / "road_graph.gpickle"
    with path.open("rb") as f:
        return pickle.load(f)


def load_nodes() -> pd.DataFrame:
    return pd.read_parquet(DATA_PROCESSED / "road_nodes.parquet")


def snap_to_node(x: float, y: float, nodes: pd.DataFrame) -> tuple[tuple[int, int], float]:
    xy = np.column_stack([nodes["x"].to_numpy(), nodes["y"].to_numpy()])
    tree = cKDTree(xy)
    dist, idx = tree.query([x, y])
    row = nodes.iloc[int(idx)]
    key = (int(row["kx"]), int(row["ky"]))
    return key, float(dist)


def apply_weights(G: nx.MultiGraph, scored: pd.DataFrame) -> nx.MultiGraph:
    """Attach length_m, segment_risk, safer_cost_m onto graph edges by edge_id."""
    by_id = scored.set_index("edge_id")
    H = G.copy()
    missing = 0
    for u, v, k, data in H.edges(keys=True, data=True):
        eid = data.get("edge_id") or k
        if eid not in by_id.index:
            missing += 1
            length = float(data.get("length_m", 1.0))
            data["segment_risk"] = 0.0
            data["safer_cost_m"] = length
            data["length_m"] = length
            continue
        row = by_id.loc[eid]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        data["length_m"] = float(row["length_m"])
        data["segment_risk"] = float(row["segment_risk"])
        data["safer_cost_m"] = float(row["safer_cost_m"])
    if missing:
        print(f"  warning: {missing} graph edges missing scores (treated as risk=0)")
    return H


def _path_metrics(G: nx.MultiGraph, path: list, weight: str) -> dict[str, Any]:
    length = 0.0
    risk_len = 0.0
    high_len = 0.0
    risks: list[float] = []
    coords: list[tuple[float, float]] = []
    for a, b in zip(path[:-1], path[1:]):
        # pick edge with min weight among parallel edges
        best = None
        best_w = float("inf")
        for _, data in G[a][b].items():
            w = float(data.get(weight, data.get("length_m", 1.0)))
            if w < best_w:
                best_w = w
                best = data
        assert best is not None
        length += float(best["length_m"])
        r = float(best.get("segment_risk", 0.0))
        risks.append(r)
        risk_len += float(best["length_m"]) * r
        if r >= HIGH_RISK_PRED:
            high_len += float(best["length_m"])
        ua = (G.nodes[a]["x"], G.nodes[a]["y"])
        ub = (G.nodes[b]["x"], G.nodes[b]["y"])
        if not coords:
            coords.append(ua)
        coords.append(ub)
    mean_risk = float(np.mean(risks)) if risks else 0.0
    return {
        "length_m": length,
        "mean_segment_risk": mean_risk,
        "exposure": risk_len,  # length-weighted risk integral
        "high_risk_length_m": high_len,
        "n_edges": len(risks),
        "coords_5234": coords,
    }


def route_pair(
    G: nx.MultiGraph,
    origin: tuple[int, int],
    dest: tuple[int, int],
) -> dict[str, Any]:
    try:
        path_short = nx.shortest_path(G, origin, dest, weight="length_m")
        path_safe = nx.shortest_path(G, origin, dest, weight="safer_cost_m")
    except nx.NetworkXNoPath as e:
        raise ValueError("No path between origin and destination on road graph") from e

    short = _path_metrics(G, path_short, "length_m")
    safer = _path_metrics(G, path_safe, "safer_cost_m")
    detour = (safer["length_m"] / short["length_m"]) if short["length_m"] > 0 else 1.0
    return {
        "shortest": short,
        "safer": safer,
        "comparison": {
            "detour_ratio": detour,
            "length_delta_m": safer["length_m"] - short["length_m"],
            "exposure_delta": safer["exposure"] - short["exposure"],
            "safer_lower_exposure": safer["exposure"] <= short["exposure"],
            "lambda": LAMBDA_SEGMENT_RISK,
        },
    }


def to_wgs84_line(coords_5234: list[tuple[float, float]]) -> dict:
    transformer = Transformer.from_crs(CRS_PROJECTED, CRS_WGS84, always_xy=True)
    lonlat = [transformer.transform(x, y) for x, y in coords_5234]
    line = LineString(lonlat)
    return mapping(line)


def pick_demo_od(nodes: pd.DataFrame, G: nx.MultiGraph) -> tuple[tuple[int, int], tuple[int, int]]:
    """
    Pick OD in the largest component that yields a safer detour when possible.
    Tries a few far-ish pairs; falls back to min/max x+y.
    """
    largest = max(nx.connected_components(G), key=len)
    keys = pd.Series(list(zip(nodes["kx"].astype(int), nodes["ky"].astype(int))))
    sub = nodes.loc[keys.isin(largest)].copy()
    if len(sub) > 25000:
        sub = sub.sample(25000, random_state=42)

    score = sub["x"] + sub["y"]
    candidates: list[tuple[tuple[int, int], tuple[int, int]]] = []
    o0 = sub.loc[score.idxmin()]
    d0 = sub.loc[score.idxmax()]
    candidates.append(((int(o0["kx"]), int(o0["ky"])), (int(d0["kx"]), int(d0["ky"]))))

    # A few mid-span pairs (quartiles of x)
    try:
        xs = sub["x"]
        for q_lo, q_hi in ((0.2, 0.8), (0.3, 0.7), (0.15, 0.6)):
            lo = sub.iloc[(xs - xs.quantile(q_lo)).abs().argmin()]
            hi = sub.iloc[(xs - xs.quantile(q_hi)).abs().argmin()]
            # push apart in y as well
            band_lo = sub.nsmallest(500, "y")
            band_hi = sub.nlargest(500, "y")
            a = band_lo.iloc[len(band_lo) // 2]
            b = band_hi.iloc[len(band_hi) // 2]
            candidates.append(((int(a["kx"]), int(a["ky"])), (int(b["kx"]), int(b["ky"]))))
            candidates.append(((int(lo["kx"]), int(lo["ky"])), (int(hi["kx"]), int(hi["ky"]))))
    except Exception:
        pass

    best = candidates[0]
    best_delta = 0.0
    for origin, dest in candidates:
        if origin == dest or not nx.has_path(G, origin, dest):
            continue
        try:
            r = route_pair(G, origin, dest)
        except Exception:
            continue
        # prefer pairs where safer exposure is meaningfully lower
        delta = r["shortest"]["exposure"] - r["safer"]["exposure"]
        if delta > best_delta and r["comparison"]["detour_ratio"] > 1.001:
            best_delta = delta
            best = (origin, dest)
            if delta > 50:
                break
    return best


def compute_route(
    *,
    origin_xy: tuple[float, float] | None = None,
    dest_xy: tuple[float, float] | None = None,
    hour_of_day: int = 18,
    elephant_xy: tuple[float, float] | None = None,
    elephant_radius_m: float = 0.0,
) -> dict[str, Any]:
    print("Loading graph + scoring edges…")
    G0 = load_graph()
    nodes = load_nodes()
    scored = score_routing_edges(
        hour_of_day=hour_of_day,
        elephant_xy=elephant_xy,
        elephant_radius_m=elephant_radius_m,
        save=False,
    )
    G = apply_weights(G0, scored)

    if origin_xy is None or dest_xy is None:
        origin, dest = pick_demo_od(nodes, G)
        o_dist = d_dist = 0.0
        print(f"  demo OD nodes {origin} -> {dest}")
    else:
        origin, o_dist = snap_to_node(origin_xy[0], origin_xy[1], nodes)
        dest, d_dist = snap_to_node(dest_xy[0], dest_xy[1], nodes)
        print(f"  snapped OD {origin} ({o_dist:.0f}m) -> {dest} ({d_dist:.0f}m)")

    # ensure same component
    if not nx.has_path(G, origin, dest):
        # fall back to demo within largest component
        print("  no path for snapped OD — using demo OD in largest component")
        origin, dest = pick_demo_od(nodes, G)

    result = route_pair(G, origin, dest)
    result["meta"] = {
        "hour_of_day": hour_of_day,
        "origin_node": list(origin),
        "dest_node": list(dest),
        "elephant": {
            "xy": list(elephant_xy) if elephant_xy else None,
            "radius_m": elephant_radius_m,
        },
        "honesty": (
            "segment_risk from trained road-corridor model (proxy labels); "
            "not live DWC closures."
        ),
    }
    result["shortest"]["geometry"] = to_wgs84_line(result["shortest"]["coords_5234"])
    result["safer"]["geometry"] = to_wgs84_line(result["safer"]["coords_5234"])
    # drop bulky coords from JSON-friendly copy
    for key in ("shortest", "safer"):
        result[key] = {
            k: v for k, v in result[key].items() if k != "coords_5234"
        }
    return result


def main() -> None:
    OUTPUTS_ROUTES.mkdir(parents=True, exist_ok=True)
    result = compute_route(hour_of_day=18)
    out = OUTPUTS_ROUTES / "comparison.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result["comparison"], indent=2))
    print(f"shortest_m={result['shortest']['length_m']:.0f} "
          f"safer_m={result['safer']['length_m']:.0f} "
          f"short_exposure={result['shortest']['exposure']:.1f} "
          f"safer_exposure={result['safer']['exposure']:.1f}")
    print(f"Saved {out}")

    # GeoJSON for quick map check
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"kind": "shortest", **{k: result["shortest"][k] for k in result["shortest"] if k != "geometry"}},
                "geometry": result["shortest"]["geometry"],
            },
            {
                "type": "Feature",
                "properties": {"kind": "safer", **{k: result["safer"][k] for k in result["safer"] if k != "geometry"}},
                "geometry": result["safer"]["geometry"],
            },
        ],
    }
    geo_path = OUTPUTS_ROUTES / "comparison.geojson"
    geo_path.write_text(json.dumps(fc), encoding="utf-8")
    print(f"Saved {geo_path}")


if __name__ == "__main__":
    main()
