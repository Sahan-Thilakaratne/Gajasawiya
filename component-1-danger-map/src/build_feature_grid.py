"""
Phase 2 — build 500 m feature grid for Anuradhapura.

Outputs:
  data/processed/feature_grid.parquet
  data/processed/feature_grid.csv
  data/processed/grid_cells.gpkg
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.merge import merge as rio_merge
from rasterio.warp import calculate_default_transform, reproject
from rasterio.enums import Resampling as ResamplingEnum
from rasterio.transform import from_bounds, xy as transform_xy
from rasterio.transform import rowcol
from shapely.geometry import box
from shapely.ops import unary_union
from shapely import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    CRS_GEOGRAPHIC,
    CRS_PROJECTED,
    DATA_PROCESSED,
    GRID_RESOLUTION_M,
    RAW_CLIMATE,
    RAW_DEM,
    RAW_WORLDCOVER,
    RAW_WORLDPOP,
    FILE_TAG,
    STUDY_AREA_GEOJSON,
)

WC_TREE = 10
WC_SHRUB = 20
WC_GRASS = 30
WC_CROP = 40
WC_BUILT = 50
WC_WATER = 80


def load_study_area() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(STUDY_AREA_GEOJSON)
    if gdf.crs is None:
        gdf = gdf.set_crs(CRS_GEOGRAPHIC)
    return gdf.to_crs(CRS_PROJECTED)


def make_fishnet(study: gpd.GeoDataFrame, cell_m: int) -> tuple[gpd.GeoDataFrame, dict]:
    minx, miny, maxx, maxy = study.total_bounds
    origin_x = float(np.floor(minx / cell_m) * cell_m)
    origin_y = float(np.floor(miny / cell_m) * cell_m)
    maxx = float(np.ceil(maxx / cell_m) * cell_m)
    maxy = float(np.ceil(maxy / cell_m) * cell_m)

    xs = np.arange(origin_x, maxx, cell_m)
    ys = np.arange(origin_y, maxy, cell_m)
    study_union = study.union_all() if hasattr(study, "union_all") else study.unary_union

    records = []
    for ix, x in enumerate(xs):
        for iy, y in enumerate(ys):
            poly = box(x, y, x + cell_m, y + cell_m)
            cx, cy = x + cell_m / 2, y + cell_m / 2
            from shapely.geometry import Point

            if not Point(cx, cy).within(study_union):
                continue
            records.append(
                {
                    "cell_id": f"C{ix:04d}_{iy:04d}",
                    "ix": ix,
                    "iy": iy,
                    "cx": cx,
                    "cy": cy,
                    "geometry": poly,
                }
            )

    grid = gpd.GeoDataFrame(records, geometry="geometry", crs=CRS_PROJECTED)
    meta = {
        "origin_x": origin_x,
        "origin_y": origin_y,
        "cell_m": cell_m,
        "nx": len(xs),
        "ny": len(ys),
    }
    print(f"Fishnet cells: {len(grid)}")
    return grid.reset_index(drop=True), meta


def mosaic_and_reproject(
    paths: list[Path],
    study: gpd.GeoDataFrame,
    out_path: Path,
    res_m: float,
    resampling=ResamplingEnum.nearest,
    dst_nodata=None,
) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    srcs = [rasterio.open(p) for p in paths]
    try:
        mosaic, transform = rio_merge(srcs)
        src_crs = srcs[0].crs
        src_nodata = srcs[0].nodata
        count = srcs[0].count
        dtype = srcs[0].dtypes[0]
    finally:
        for s in srcs:
            s.close()

    tmp = out_path.with_suffix(".src.tif")
    meta = {
        "driver": "GTiff",
        "height": mosaic.shape[1],
        "width": mosaic.shape[2],
        "count": count,
        "dtype": dtype,
        "crs": src_crs,
        "transform": transform,
        "compress": "lzw",
        "nodata": src_nodata,
    }
    with rasterio.open(tmp, "w", **meta) as dst:
        dst.write(mosaic)

    minx, miny, maxx, maxy = study.total_bounds
    pad = GRID_RESOLUTION_M
    dst_bounds = (minx - pad, miny - pad, maxx + pad, maxy + pad)
    width = int(np.ceil((dst_bounds[2] - dst_bounds[0]) / res_m))
    height = int(np.ceil((dst_bounds[3] - dst_bounds[1]) / res_m))
    transform_r = from_bounds(*dst_bounds, width=width, height=height)

    with rasterio.open(tmp) as src:
        kwargs = {
            "driver": "GTiff",
            "crs": CRS_PROJECTED,
            "transform": transform_r,
            "width": width,
            "height": height,
            "count": src.count,
            "dtype": src.dtypes[0],
            "compress": "lzw",
            "nodata": dst_nodata if dst_nodata is not None else src.nodata,
        }
        with rasterio.open(out_path, "w", **kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform_r,
                    dst_crs=CRS_PROJECTED,
                    resampling=resampling,
                    src_nodata=src.nodata,
                    dst_nodata=kwargs["nodata"],
                )
    tmp.unlink(missing_ok=True)
    print(f"Wrote {out_path} ({width}x{height} @ {res_m}m)")
    return out_path


def sample_at_centroids(raster_path: Path, grid: gpd.GeoDataFrame) -> np.ndarray:
    coords = list(zip(grid["cx"], grid["cy"]))
    with rasterio.open(raster_path) as src:
        vals = np.array([v[0] for v in src.sample(coords)], dtype=np.float64)
        nodata = src.nodata
        if nodata is not None:
            vals[vals == nodata] = np.nan
        vals[vals < -1e20] = np.nan
    return vals


def landcover_fractions_binned(
    raster_path: Path, grid: gpd.GeoDataFrame, grid_meta: dict
) -> pd.DataFrame:
    """One pass over WorldCover pixels → per-cell class fractions."""
    n = len(grid)
    # Map (ix, iy) -> row index in grid
    key_to_i = {(int(r.ix), int(r.iy)): i for i, r in grid.iterrows()}
    # iterrows is slow for building map — use vectors
    key_to_i = {
        (int(ix), int(iy)): i
        for i, (ix, iy) in enumerate(zip(grid["ix"].to_numpy(), grid["iy"].to_numpy()))
    }

    counts = {
        "tree": np.zeros(n, dtype=np.int32),
        "crop": np.zeros(n, dtype=np.int32),
        "built": np.zeros(n, dtype=np.int32),
        "water": np.zeros(n, dtype=np.int32),
        "shrub_grass": np.zeros(n, dtype=np.int32),
        "total": np.zeros(n, dtype=np.int32),
    }

    origin_x = grid_meta["origin_x"]
    origin_y = grid_meta["origin_y"]
    cell_m = grid_meta["cell_m"]

    with rasterio.open(raster_path) as src:
        for _, window in src.block_windows(1):
            data = src.read(1, window=window)
            rows, cols = np.where(data > 0)
            if rows.size == 0:
                continue
            # pixel centers in projected CRS
            # window offsets
            r0, c0 = int(window.row_off), int(window.col_off)
            xs, ys = transform_xy(
                src.transform,
                r0 + rows,
                c0 + cols,
                offset="center",
            )
            xs = np.asarray(xs)
            ys = np.asarray(ys)
            ix = np.floor((xs - origin_x) / cell_m).astype(np.int32)
            iy = np.floor((ys - origin_y) / cell_m).astype(np.int32)
            classes = data[rows, cols]

            for x_i, y_i, cls in zip(ix, iy, classes):
                idx = key_to_i.get((int(x_i), int(y_i)))
                if idx is None:
                    continue
                counts["total"][idx] += 1
                if cls == WC_TREE:
                    counts["tree"][idx] += 1
                elif cls == WC_CROP:
                    counts["crop"][idx] += 1
                elif cls == WC_BUILT:
                    counts["built"][idx] += 1
                elif cls == WC_WATER:
                    counts["water"][idx] += 1
                elif cls in (WC_SHRUB, WC_GRASS):
                    counts["shrub_grass"][idx] += 1

    total = np.maximum(counts["total"], 1)
    return pd.DataFrame(
        {
            "frac_tree": counts["tree"] / total,
            "frac_crop": counts["crop"] / total,
            "frac_built": counts["built"] / total,
            "frac_water": counts["water"] / total,
            "frac_shrub_grass": counts["shrub_grass"] / total,
        }
    )


def landcover_fractions_fast(
    raster_path: Path, grid: gpd.GeoDataFrame, grid_meta: dict
) -> pd.DataFrame:
    """Vectorized binning using searchsorted on cell keys."""
    n = len(grid)
    ix_g = grid["ix"].to_numpy(dtype=np.int32)
    iy_g = grid["iy"].to_numpy(dtype=np.int32)
    # pack key
    keys_g = ix_g.astype(np.int64) * 100000 + iy_g.astype(np.int64)
    order = np.argsort(keys_g)
    keys_sorted = keys_g[order]

    tree = np.zeros(n, dtype=np.int32)
    crop = np.zeros(n, dtype=np.int32)
    built = np.zeros(n, dtype=np.int32)
    water = np.zeros(n, dtype=np.int32)
    shrub = np.zeros(n, dtype=np.int32)
    total = np.zeros(n, dtype=np.int32)

    origin_x = grid_meta["origin_x"]
    origin_y = grid_meta["origin_y"]
    cell_m = float(grid_meta["cell_m"])

    with rasterio.open(raster_path) as src:
        for ji, (_block_id, window) in enumerate(src.block_windows(1)):
            data = src.read(1, window=window)
            mask = data > 0
            if not np.any(mask):
                continue
            rows, cols = np.nonzero(mask)
            r0 = int(window.row_off)
            c0 = int(window.col_off)
            xs, ys = transform_xy(src.transform, r0 + rows, c0 + cols, offset="center")
            xs = np.asarray(xs, dtype=np.float64)
            ys = np.asarray(ys, dtype=np.float64)
            ix = np.floor((xs - origin_x) / cell_m).astype(np.int64)
            iy = np.floor((ys - origin_y) / cell_m).astype(np.int64)
            keys = ix * 100000 + iy
            classes = data[rows, cols]

            pos = np.searchsorted(keys_sorted, keys)
            in_range = pos < len(keys_sorted)
            pos_safe = np.clip(pos, 0, max(len(keys_sorted) - 1, 0))
            valid = in_range & (keys_sorted[pos_safe] == keys)
            if not np.any(valid):
                continue
            pos = pos[valid]
            classes = classes[valid]
            gi = order[pos]

            total += np.bincount(gi, minlength=n).astype(np.int32)
            tree += np.bincount(gi, weights=(classes == WC_TREE), minlength=n).astype(np.int32)
            crop += np.bincount(gi, weights=(classes == WC_CROP), minlength=n).astype(np.int32)
            built += np.bincount(gi, weights=(classes == WC_BUILT), minlength=n).astype(np.int32)
            water += np.bincount(gi, weights=(classes == WC_WATER), minlength=n).astype(np.int32)
            shrub += np.bincount(
                gi, weights=((classes == WC_SHRUB) | (classes == WC_GRASS)), minlength=n
            ).astype(np.int32)

            if (ji + 1) % 50 == 0:
                print(f"  landcover blocks {ji+1}")

    denom = np.maximum(total, 1)
    return pd.DataFrame(
        {
            "frac_tree": tree / denom,
            "frac_crop": crop / denom,
            "frac_built": built / denom,
            "frac_water": water / denom,
            "frac_shrub_grass": shrub / denom,
        }
    )


def dem_stats(dem_path: Path, grid: gpd.GeoDataFrame) -> pd.DataFrame:
    """Elevation at centroid + local slope from 3x3 window."""
    elev = sample_at_centroids(dem_path, grid)
    slope = np.full(len(grid), np.nan)
    with rasterio.open(dem_path) as src:
        dem = src.read(1).astype(np.float64)
        nodata = src.nodata
        if nodata is not None:
            dem[dem == nodata] = np.nan
        px = abs(src.transform.a)
        py = abs(src.transform.e)
        gy, gx = np.gradient(dem, py, px)
        slope_arr = np.degrees(np.arctan(np.hypot(gx, gy)))
        for i, (x, y) in enumerate(zip(grid["cx"], grid["cy"])):
            try:
                r, c = rowcol(src.transform, x, y)
                if 0 <= r < slope_arr.shape[0] and 0 <= c < slope_arr.shape[1]:
                    slope[i] = slope_arr[r, c]
            except Exception:
                continue
    return pd.DataFrame({"elevation_m": elev, "slope_deg": slope})


def nearest_distance_m(points_x, points_y, targets: gpd.GeoDataFrame) -> np.ndarray:
    if targets.empty:
        return np.full(len(points_x), np.nan)
    # explode multiparts
    geoms = list(targets.geometry.values)
    tree = STRtree(geoms)
    from shapely.geometry import Point

    dists = np.empty(len(points_x), dtype=np.float64)
    for i, (x, y) in enumerate(zip(points_x, points_y)):
        pt = Point(x, y)
        idx = tree.nearest(pt)
        dists[i] = pt.distance(geoms[idx])
        if (i + 1) % 5000 == 0:
            print(f"  distance {i+1}/{len(points_x)}")
    return dists


def climate_idw(grid: gpd.GeoDataFrame, climate_json: Path) -> pd.DataFrame:
    payload = json.loads(climate_json.read_text(encoding="utf-8"))

    def ann_or_mean(d: dict) -> float:
        if not d:
            return np.nan
        if "ANN" in d:
            return float(d["ANN"])
        vals = [float(v) for k, v in d.items() if k != "ANN"]
        return float(np.mean(vals)) if vals else np.nan

    pts = []
    for p in payload.get("points") or []:
        props = ((p.get("response") or {}).get("properties") or {}).get("parameter") or {}
        pts.append(
            {
                "lon": p["lon"],
                "lat": p["lat"],
                "t2m": ann_or_mean(props.get("T2M") or {}),
                "precip": ann_or_mean(props.get("PRECTOTCORR") or {}),
            }
        )
    pdf = pd.DataFrame(pts)
    gpts = gpd.GeoDataFrame(
        pdf,
        geometry=gpd.points_from_xy(pdf["lon"], pdf["lat"]),
        crs=CRS_GEOGRAPHIC,
    ).to_crs(CRS_PROJECTED)

    src_xy = np.column_stack([gpts.geometry.x, gpts.geometry.y])
    src_t = gpts["t2m"].to_numpy()
    src_p = gpts["precip"].to_numpy()
    t_out = np.empty(len(grid))
    p_out = np.empty(len(grid))
    for i, (x, y) in enumerate(zip(grid["cx"], grid["cy"])):
        d2 = (src_xy[:, 0] - x) ** 2 + (src_xy[:, 1] - y) ** 2
        d2 = np.maximum(d2, 1.0)
        w = 1.0 / d2
        t_out[i] = float(np.nansum(w * src_t) / np.nansum(w))
        p_out[i] = float(np.nansum(w * src_p) / np.nansum(w))
    return pd.DataFrame({"temp_c": t_out, "precip_mm": p_out})


def protected_flag(grid: gpd.GeoDataFrame, protected: gpd.GeoDataFrame) -> np.ndarray:
    """1 if cell centroid is inside any protected polygon."""
    flag = np.zeros(len(grid), dtype=np.int8)
    if protected.empty:
        return flag
    prot = protected[protected.geometry.type.isin(["Polygon", "MultiPolygon"])].copy()
    if prot.empty:
        # buffer lines slightly
        prot = protected.copy()
        prot["geometry"] = prot.buffer(50)
    union = unary_union(prot.geometry.buffer(0))
    cents = gpd.GeoSeries(grid.geometry.centroid, crs=grid.crs)
    flag = cents.within(union).astype(np.int8).to_numpy()
    return flag


def forest_edge_flag(df: pd.DataFrame, tree_thr=0.2, human_thr=0.1) -> np.ndarray:
    human = np.maximum(df["frac_crop"].to_numpy(), df["frac_built"].to_numpy())
    return ((df["frac_tree"].to_numpy() >= tree_thr) & (human >= human_thr)).astype(np.int8)


def main() -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)

    print("=== Phase 2: feature grid ===")
    study = load_study_area()
    grid, grid_meta = make_fishnet(study, GRID_RESOLUTION_M)

    osm_gpkg = DATA_PROCESSED / "osm_layers.gpkg"
    if not osm_gpkg.exists():
        print("Converting OSM Overpass JSON -> GPKG...")
        from convert_osm import main as convert_main

        convert_main()

    roads = gpd.read_file(osm_gpkg, layer="roads")
    water = gpd.read_file(osm_gpkg, layer="water")
    settlements = gpd.read_file(osm_gpkg, layer="settlements")
    protected = gpd.read_file(osm_gpkg, layer="protected")

    dem_files = sorted(RAW_DEM.glob("Copernicus_DSM_COG_*.tif"))
    wc_files = sorted(RAW_WORLDCOVER.glob("ESA_WorldCover_*.tif"))
    pop_file = RAW_WORLDPOP / "lka_ppp_2020_UNadj.tif"

    dem_clip = DATA_PROCESSED / f"dem_{FILE_TAG}.tif"
    wc_clip = DATA_PROCESSED / f"worldcover_{FILE_TAG}.tif"
    pop_clip = DATA_PROCESSED / f"worldpop_{FILE_TAG}.tif"

    if not dem_clip.exists():
        print("Mosaic/reproject DEM...")
        mosaic_and_reproject(
            dem_files, study, dem_clip, res_m=30.0, resampling=ResamplingEnum.bilinear
        )
    if not wc_clip.exists():
        print("Mosaic/reproject WorldCover...")
        mosaic_and_reproject(
            wc_files,
            study,
            wc_clip,
            res_m=10.0,
            resampling=ResamplingEnum.nearest,
            dst_nodata=0,
        )
    if not pop_clip.exists():
        print("Reproject WorldPop...")
        mosaic_and_reproject(
            [pop_file], study, pop_clip, res_m=100.0, resampling=ResamplingEnum.bilinear
        )

    print("Land-cover fractions...")
    lc = landcover_fractions_fast(wc_clip, grid, grid_meta)

    print("Population at centroids...")
    pop = sample_at_centroids(pop_clip, grid)
    pop_density = pop * 100.0  # ~people/km² from 100 m people/pixel

    print("Elevation / slope...")
    terrain = dem_stats(dem_clip, grid)

    print("Distances...")
    dist_road = nearest_distance_m(grid["cx"], grid["cy"], roads)
    dist_water = nearest_distance_m(grid["cx"], grid["cy"], water)
    dist_settle = nearest_distance_m(grid["cx"], grid["cy"], settlements)

    print("Climate IDW...")
    climate = climate_idw(
        grid, RAW_CLIMATE / f"climatology_t2m_prectotcorr_{FILE_TAG}.json"
    )

    print("Protected areas...")
    prot_flag = protected_flag(grid, protected)

    df = pd.concat(
        [
            grid.drop(columns="geometry").reset_index(drop=True),
            lc.reset_index(drop=True),
            terrain.reset_index(drop=True),
            climate.reset_index(drop=True),
        ],
        axis=1,
    )
    df["pop_mean"] = pop
    df["pop_density_approx"] = pop_density
    df["dist_road_m"] = dist_road
    df["dist_water_m"] = dist_water
    df["dist_settlement_m"] = dist_settle
    df["protected"] = prot_flag
    df["forest_edge"] = forest_edge_flag(df)

    q95 = float(np.nanpercentile(df["pop_density_approx"].to_numpy(), 95))
    df["human_exposure_raw"] = (
        0.4 * df["frac_crop"].clip(0, 1)
        + 0.4 * df["frac_built"].clip(0, 1)
        + 0.2 * (df["pop_density_approx"] / (q95 + 1e-6)).clip(0, 1)
    )

    out_parquet = DATA_PROCESSED / "feature_grid.parquet"
    out_csv = DATA_PROCESSED / "feature_grid.csv"
    out_gpkg = DATA_PROCESSED / "grid_cells.gpkg"

    df.to_parquet(out_parquet, index=False)
    df.to_csv(out_csv, index=False)

    gdf_out = gpd.GeoDataFrame(df, geometry=grid.geometry.values, crs=CRS_PROJECTED)
    if out_gpkg.exists():
        out_gpkg.unlink()
    gdf_out.to_file(out_gpkg, layer="cells", driver="GPKG")

    meta_path = DATA_PROCESSED / "feature_grid_meta.json"
    meta_path.write_text(
        json.dumps(
            {
                "grid": grid_meta,
                "n_cells": len(df),
                "crs": CRS_PROJECTED,
                "resolution_m": GRID_RESOLUTION_M,
                "columns": list(df.columns),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"\nSaved {out_parquet} ({len(df)} cells)")
    print(f"Saved {out_csv}")
    print(f"Saved {out_gpkg}")
    print(df[["frac_tree", "frac_crop", "frac_built", "elevation_m", "dist_road_m", "forest_edge"]].describe())
    print(f"Forest-edge cells: {int(df['forest_edge'].sum())}")
    print("Phase 2 complete.")


if __name__ == "__main__":
    main()
