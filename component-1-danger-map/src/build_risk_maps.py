"""
Phase 6 — map outputs for the Anuradhapura danger map.

Outputs:
  outputs/maps/risk_surface.tif
  outputs/maps/risk_preview.png
  outputs/maps/risk_map.html
  outputs/maps/risk_cells.geojson
  outputs/maps/risk_cells.gpkg
  outputs/reports/phase6_colour_breaks.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio
from matplotlib import colors
from matplotlib.patches import Patch
from pyproj import Transformer
from rasterio.transform import from_origin
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    CRS_GEOGRAPHIC,
    CRS_PROJECTED,
    DATA_PROCESSED,
    GRID_RESOLUTION_M,
    OUTPUTS_MAPS,
    OUTPUTS_REPORTS,
    STUDY_AREA_GEOJSON,
)

# Green → yellow → orange → red
RISK_CMAP = colors.LinearSegmentedColormap.from_list(
    "hec_risk",
    ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"],
)
NODATA = -9999.0


def load_meta() -> dict:
    meta = json.loads((DATA_PROCESSED / "feature_grid_meta.json").read_text(encoding="utf-8"))
    return meta["grid"]


def load_risk() -> pd.DataFrame:
    path = OUTPUTS_MAPS / "risk_with_explanations.parquet"
    if not path.exists():
        path = OUTPUTS_MAPS / "risk_scores.parquet"
    return pd.read_parquet(path)


def write_geotiff(df: pd.DataFrame, gmeta: dict, out_path: Path) -> tuple[np.ndarray, object]:
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])
    cell = float(gmeta.get("cell_m", GRID_RESOLUTION_M))
    nx = int(gmeta["nx"])
    ny = int(gmeta["ny"])

    # Raster row 0 = north (top). iy=0 is south in our fishnet.
    arr = np.full((ny, nx), NODATA, dtype=np.float32)
    for ix, iy, score in zip(df["ix"].to_numpy(), df["iy"].to_numpy(), df["risk_score"].to_numpy()):
        row = ny - 1 - int(iy)
        col = int(ix)
        if 0 <= row < ny and 0 <= col < nx:
            arr[row, col] = float(score) if np.isfinite(score) else NODATA

    # from_origin: upper-left corner
    west = origin_x
    north = origin_y + ny * cell
    transform = from_origin(west, north, cell, cell)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        height=ny,
        width=nx,
        count=1,
        dtype="float32",
        crs=CRS_PROJECTED,
        transform=transform,
        nodata=NODATA,
        compress="lzw",
    ) as dst:
        dst.write(arr, 1)
        dst.update_tags(
            risk_formula="habitat_suitability * human_exposure",
            district="Anuradhapura",
            units="risk_score_0_to_1",
        )
    print(f"Wrote {out_path} ({nx}x{ny})")
    return arr, transform


def write_static_png(arr: np.ndarray, gmeta: dict, df: pd.DataFrame, out_path: Path) -> None:
    cell = float(gmeta.get("cell_m", GRID_RESOLUTION_M))
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])
    nx = int(gmeta["nx"])
    ny = int(gmeta["ny"])
    extent = [origin_x, origin_x + nx * cell, origin_y, origin_y + ny * cell]

    masked = np.ma.masked_equal(arr, NODATA)
    # Use percentile stretch for visibility (raw scores are skewed)
    finite = masked.compressed()
    vmax = float(np.percentile(finite, 98)) if finite.size else 1.0
    vmax = max(vmax, 1e-6)

    study = gpd.read_file(STUDY_AREA_GEOJSON).to_crs(CRS_PROJECTED)

    fig, ax = plt.subplots(figsize=(9, 10))
    im = ax.imshow(
        masked,
        extent=extent,
        origin="upper",
        cmap=RISK_CMAP,
        vmin=0,
        vmax=vmax,
        interpolation="nearest",
        aspect="equal",
    )
    study.boundary.plot(ax=ax, color="#222222", linewidth=1.2)
    ax.set_title("Anuradhapura HEC overlap risk\n(habitat × human exposure)")
    ax.set_xlabel("Easting (EPSG:5234)")
    ax.set_ylabel("Northing (EPSG:5234)")
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label(f"risk_score (display stretch 0–{vmax:.2f})")

    # Colour breaks note on figure
    breaks = [0, vmax * 0.25, vmax * 0.5, vmax * 0.75, vmax]
    legend_elems = [
        Patch(facecolor=RISK_CMAP(t), edgecolor="none", label=lab)
        for t, lab in zip(
            [0.1, 0.35, 0.55, 0.75, 0.95],
            ["Low", "Low–med", "Medium", "High", "Very high"],
        )
    ]
    ax.legend(handles=legend_elems, loc="lower right", framealpha=0.9, title="Legend")

    # Mark a few top-risk centroids
    top = df.nlargest(8, "risk_score")
    ax.scatter(top["cx"], top["cy"], s=28, facecolors="none", edgecolors="black", linewidths=1.2, zorder=5)

    plt.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)
    print(f"Wrote {out_path}")

    # Colour breaks doc
    OUTPUTS_REPORTS.mkdir(parents=True, exist_ok=True)
    md = OUTPUTS_REPORTS / "phase6_colour_breaks.md"
    md.write_text(
        "\n".join(
            [
                "# Phase 6 — colour scale",
                "",
                "Palette: **green → yellow → orange → red** (`hec_risk`).",
                "",
                "| Class | Approx. display range | Meaning |",
                "|---|---|---|",
                f"| Low | 0 – {breaks[1]:.3f} | Little overlap of elephants and people |",
                f"| Low–med | {breaks[1]:.3f} – {breaks[2]:.3f} | Some habitat or exposure |",
                f"| Medium | {breaks[2]:.3f} – {breaks[3]:.3f} | Rising overlap |",
                f"| High | {breaks[3]:.3f} – {breaks[4]:.3f} | Strong overlap |",
                f"| Very high | near {breaks[4]:.3f}+ | Farm / village / forest-edge hotspots |",
                "",
                "Raw `risk_score` is `habitat_suitability × human_exposure` (0–1).",
                f"The PNG uses a 0–p98 stretch (vmax={vmax:.4f}) so spatial pattern is visible.",
                "`risk_score_0_100` in the tables is min–max normalised across the district.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def write_vector(df: pd.DataFrame, gmeta: dict) -> gpd.GeoDataFrame:
    cell = float(gmeta.get("cell_m", GRID_RESOLUTION_M))
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])

    geoms = [
        box(
            origin_x + int(ix) * cell,
            origin_y + int(iy) * cell,
            origin_x + (int(ix) + 1) * cell,
            origin_y + (int(iy) + 1) * cell,
        )
        for ix, iy in zip(df["ix"], df["iy"])
    ]
    gdf = gpd.GeoDataFrame(df.copy(), geometry=geoms, crs=CRS_PROJECTED)

    gpkg = OUTPUTS_MAPS / "risk_cells.gpkg"
    if gpkg.exists():
        gpkg.unlink()
    # Keep useful columns only for file size
    cols = [
        c
        for c in [
            "cell_id",
            "risk_score",
            "risk_score_0_100",
            "habitat_suitability",
            "human_exposure",
            "explanation",
            "why",
            "tags",
            "forest_edge",
            "geometry",
        ]
        if c in gdf.columns or c == "geometry"
    ]
    gdf[cols].to_file(gpkg, layer="risk_cells", driver="GPKG")
    print(f"Wrote {gpkg}")

    # GeoJSON in WGS84 for web / Component 4
    gdf4326 = gdf[cols].to_crs(CRS_GEOGRAPHIC)
    geojson_path = OUTPUTS_MAPS / "risk_cells.geojson"
    gdf4326.to_file(geojson_path, driver="GeoJSON")
    print(f"Wrote {geojson_path}")
    return gdf4326


def write_folium(df: pd.DataFrame, gmeta: dict, png_path: Path, out_html: Path) -> None:
    import folium
    from folium.raster_layers import ImageOverlay

    cell = float(gmeta.get("cell_m", GRID_RESOLUTION_M))
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])
    nx = int(gmeta["nx"])
    ny = int(gmeta["ny"])

    # Bounds of raster in projected → WGS84 corners
    transformer = Transformer.from_crs(CRS_PROJECTED, CRS_GEOGRAPHIC, always_xy=True)
    corners = [
        (origin_x, origin_y),
        (origin_x + nx * cell, origin_y),
        (origin_x + nx * cell, origin_y + ny * cell),
        (origin_x, origin_y + ny * cell),
    ]
    lons, lats = zip(*[transformer.transform(x, y) for x, y in corners])
    south, north = min(lats), max(lats)
    west, east = min(lons), max(lons)
    center = [(south + north) / 2, (west + east) / 2]

    # Build a WGS84-ish preview image already saved; use ImageOverlay with bounds
    # Folium wants [[south, west], [north, east]]
    m = folium.Map(location=center, zoom_start=9, tiles="OpenStreetMap")

    # Coloured PNG overlay — regenerate a simple geographic PNG for overlay alignment
    overlay_png = OUTPUTS_MAPS / "risk_overlay_wgs84.png"
    _write_overlay_png(df, gmeta, overlay_png)

    ImageOverlay(
        name="HEC risk",
        image=str(overlay_png),
        bounds=[[south, west], [north, east]],
        opacity=0.65,
        interactive=True,
        cross_origin=False,
        zindex=1,
    ).add_to(m)

    # District outline
    study = gpd.read_file(STUDY_AREA_GEOJSON)
    if study.crs is None:
        study = study.set_crs(CRS_GEOGRAPHIC)
    study = study.to_crs(CRS_GEOGRAPHIC)
    folium.GeoJson(
        study.__geo_interface__,
        name="Anuradhapura",
        style_function=lambda _: {
            "color": "#222222",
            "weight": 2,
            "fillOpacity": 0,
        },
    ).add_to(m)

    # Top risk points with popups (explanations)
    top = df.nlargest(40, "risk_score").copy()
    to_ll = Transformer.from_crs(CRS_PROJECTED, CRS_GEOGRAPHIC, always_xy=True)
    for _, r in top.iterrows():
        lon, lat = to_ll.transform(float(r["cx"]), float(r["cy"]))
        expl = r.get("explanation", "")
        why = r.get("why", "")
        html = (
            f"<b>{r['cell_id']}</b><br>"
            f"Risk: {float(r['risk_score']):.3f}<br>"
            f"<b>{expl}</b><br>"
            f"<small>{why}</small>"
        )
        folium.CircleMarker(
            location=[lat, lon],
            radius=5,
            color="#111111",
            fill=True,
            fill_color="#d73027",
            fill_opacity=0.9,
            popup=folium.Popup(html, max_width=320),
            tooltip=f"{r['cell_id']}: {expl}",
        ).add_to(m)

    folium.LayerControl().add_to(m)
    title_html = """
    <div style="position:fixed;top:12px;left:50px;z-index:9999;
                background:white;padding:8px 12px;border:1px solid #333;
                border-radius:4px;font-family:sans-serif;font-size:14px;">
      <b>Anuradhapura HEC danger map</b><br>
      <span style="font-size:12px;">Overlap risk = habitat × people · click red dots for why</span>
    </div>
    """
    m.get_root().html.add_child(folium.Element(title_html))
    m.save(str(out_html))
    print(f"Wrote {out_html}")


def _write_overlay_png(df: pd.DataFrame, gmeta: dict, out_path: Path) -> None:
    """RGBA PNG of risk grid for Folium ImageOverlay (same index order as geotiff)."""
    origin_x = float(gmeta["origin_x"])
    origin_y = float(gmeta["origin_y"])
    cell = float(gmeta.get("cell_m", GRID_RESOLUTION_M))
    nx = int(gmeta["nx"])
    ny = int(gmeta["ny"])
    arr = np.full((ny, nx), np.nan, dtype=np.float32)
    for ix, iy, score in zip(df["ix"], df["iy"], df["risk_score"]):
        row = ny - 1 - int(iy)
        col = int(ix)
        if 0 <= row < ny and 0 <= col < nx:
            arr[row, col] = float(score)

    finite = arr[np.isfinite(arr)]
    vmax = float(np.percentile(finite, 98)) if finite.size else 1.0
    vmax = max(vmax, 1e-6)
    norm = colors.Normalize(vmin=0, vmax=vmax)
    rgba = RISK_CMAP(norm(np.nan_to_num(arr, nan=0.0)))
    rgba[..., 3] = np.where(np.isfinite(arr), 0.85, 0.0)
    # Save without axes
    fig = plt.figure(figsize=(nx / 40, ny / 40), dpi=40)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(rgba, origin="upper", interpolation="nearest")
    ax.set_axis_off()
    fig.savefig(out_path, dpi=40, transparent=True, pad_inches=0)
    plt.close(fig)
    # unused vars kept for clarity of extent
    _ = (origin_x, origin_y, cell)


def main() -> None:
    print("=== Phase 6: map outputs ===")
    OUTPUTS_MAPS.mkdir(parents=True, exist_ok=True)
    gmeta = load_meta()
    df = load_risk()
    print(f"Cells: {len(df)}")

    tif = OUTPUTS_MAPS / "risk_surface.tif"
    arr, _ = write_geotiff(df, gmeta, tif)

    png = OUTPUTS_MAPS / "risk_preview.png"
    write_static_png(arr, gmeta, df, png)

    write_vector(df, gmeta)

    html = OUTPUTS_MAPS / "risk_map.html"
    write_folium(df, gmeta, png, html)

    print("Phase 6 complete.")
    print("Open:", html)


if __name__ == "__main__":
    main()
