"""
Phase 1 — download open datasets for the Anuradhapura danger map.

Saves raw files under data/raw/. Vector point layers are also clipped to
the district polygon under data/processed/. Rasters are downloaded as
tiles covering the district bbox (polygon clip happens in Phase 2).
"""

from __future__ import annotations

import csv
import json
import math
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (
    DATA_PROCESSED,
    DATA_RAW,
    DISTRICT_NAME,
    FILE_TAG,
    PROJECT_ROOT,
    RAW_OSM,
)
from geo_utils import point_in_study_area, save_bbox_json, study_area_bbox
from http_utils import download_file, get_json, post_text

TODAY = date.today().isoformat()
BBOX_PATH = DATA_PROCESSED / "study_area_bbox.json"
MANIFEST_PATH = DATA_RAW / f"phase1_manifest_{FILE_TAG}.json"

# GBIF taxon key for Asian elephant (Elephas maximus) — from species/match API
GBIF_TAXON_KEY = 5219461
INAT_TAXON_ID = 43694  # Asian Elephant

WORLDCOVER_BASE = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/"
    "v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
)

WORLDPOP_URLS = [
    # 100 m UN-adjusted population count (people / pixel) — Sri Lanka
    "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/LKA/lka_ppp_2020_UNadj.tif",
    "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/LKA/lka_ppp_2020.tif",
    # fallback: 1 km density
    "https://data.worldpop.org/GIS/Population_Density/Global_2000_2020/2020/LKA/lka_pd_2020_1km.tif",
]

WDPA_URLS = [
    "https://d1gam3xoknrk4.cloudfront.net/current/WDPA_WDOECM_latest_Public_LKA_shp.zip",
    "https://d1gam3xoknrk4.cloudfront.net/current/polygons/WDPA_WDOECM_poly_latest_LKA.zip",
]

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]


def _log(rows: list[dict], **row) -> None:
    row.setdefault("date", TODAY)
    rows.append(row)
    print(f"[ok] {row.get('dataset')} -> {row.get('filename')}")


def worldcover_tiles(bbox: dict[str, float]) -> list[str]:
    """3° WorldCover tile IDs covering bbox (SW corner naming)."""

    def floor3(v: float) -> int:
        return int(math.floor(v / 3.0) * 3)

    lat0 = floor3(bbox["min_lat"])
    lat1 = floor3(bbox["max_lat"])
    lon0 = floor3(bbox["min_lon"])
    lon1 = floor3(bbox["max_lon"])
    tiles = []
    lat = lat0
    while lat <= lat1:
        lon = lon0
        while lon <= lon1:
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            tiles.append(f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}")
            lon += 3
        lat += 3
    return tiles


def copernicus_dem_tiles(bbox: dict[str, float]) -> list[str]:
    """1° Copernicus GLO-30 COG tile names covering bbox."""
    lat0 = int(math.floor(bbox["min_lat"]))
    lat1 = int(math.floor(bbox["max_lat"]))
    lon0 = int(math.floor(bbox["min_lon"]))
    lon1 = int(math.floor(bbox["max_lon"]))
    urls = []
    for lat in range(lat0, lat1 + 1):
        for lon in range(lon0, lon1 + 1):
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            name = (
                f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_"
                f"{ew}{abs(lon):03d}_00_DEM"
            )
            urls.append(
                f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
            )
    return urls


def download_gbif(bbox: dict, log: list[dict]) -> None:
    out_dir = DATA_RAW / "elephant_occurrences"
    out_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    offset = 0
    limit = 300
    while True:
        params = {
            "taxonKey": GBIF_TAXON_KEY,
            "country": "LK",
            "hasCoordinate": "true",
            "hasGeospatialIssue": "false",
            "limit": limit,
            "offset": offset,
        }
        url = "https://api.gbif.org/v1/occurrence/search?" + urlencode(params)
        data = get_json(url, timeout=90)
        batch = data.get("results") or []
        records.extend(batch)
        print(f"  GBIF offset {offset}: +{len(batch)} (total {len(records)})")
        if offset + limit >= int(data.get("count") or 0) or not batch:
            break
        offset += limit
        time.sleep(0.4)

    slim = []
    for r in records:
        lon, lat = r.get("decimalLongitude"), r.get("decimalLatitude")
        if lon is None or lat is None:
            continue
        slim.append(
            {
                "source": "GBIF",
                "gbif_id": r.get("key"),
                "dataset_key": r.get("datasetKey"),
                "lon": lon,
                "lat": lat,
                "year": r.get("year"),
                "basis_of_record": r.get("basisOfRecord"),
                "in_district": point_in_study_area(float(lon), float(lat)),
            }
        )

    raw_path = out_dir / "gbif_elephas_maximus_sri_lanka.json"
    raw_path.write_text(json.dumps(slim, indent=2), encoding="utf-8")
    _write_points_csv(out_dir / "gbif_elephas_maximus_sri_lanka.csv", slim)
    _log(
        log,
        dataset="GBIF elephant occurrences",
        filename=str(raw_path.relative_to(PROJECT_ROOT)),
        url="https://api.gbif.org/v1/occurrence/search (Elephas maximus, LK)",
        licence="GBIF Terms of Use — cite DOI after official download if used in thesis",
        notes=f"{len(slim)} georeferenced records nationwide",
    )

    clipped = [p for p in slim if p["in_district"]]
    clip_path = DATA_PROCESSED / f"elephant_occurrences_{FILE_TAG}.csv"
    _write_points_csv(clip_path, clipped)
    _log(
        log,
        dataset="GBIF elephant occurrences (clipped)",
        filename=str(clip_path.relative_to(PROJECT_ROOT)),
        url=f"clipped to {DISTRICT_NAME} polygon",
        licence="GBIF Terms of Use",
        notes=f"{len(clipped)} records inside district",
    )


def download_inaturalist(bbox: dict, log: list[dict]) -> None:
    out_dir = DATA_RAW / "elephant_occurrences"
    out_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    page = 1
    while page <= 20:
        params = {
            "taxon_name": "Elephas maximus",
            "swlat": f"{bbox['min_lat']:.5f}",
            "swlng": f"{bbox['min_lon']:.5f}",
            "nelat": f"{bbox['max_lat']:.5f}",
            "nelng": f"{bbox['max_lon']:.5f}",
            "geo": "true",
            "per_page": 200,
            "page": page,
        }
        url = "https://api.inaturalist.org/v1/observations?" + urlencode(params)
        data = get_json(url, timeout=90)
        batch = data.get("results") or []
        records.extend(batch)
        total = data.get("total_results")
        print(f"  iNaturalist page {page}: +{len(batch)} (total_results={total})")
        if len(batch) < 200:
            break
        page += 1
        time.sleep(1.0)

    slim = []
    for r in records:
        loc = r.get("location") or ""
        if not loc or "," not in loc:
            continue
        lat_s, lon_s = loc.split(",", 1)
        lon, lat = float(lon_s), float(lat_s)
        slim.append(
            {
                "source": "iNaturalist",
                "id": r.get("id"),
                "lon": lon,
                "lat": lat,
                "observed_on": r.get("observed_on"),
                "in_district": point_in_study_area(lon, lat),
            }
        )

    path = out_dir / "inaturalist_elephas_maximus_bbox.json"
    path.write_text(json.dumps(slim, indent=2), encoding="utf-8")
    _write_points_csv(out_dir / "inaturalist_elephas_maximus_bbox.csv", slim)
    _log(
        log,
        dataset="iNaturalist elephant occurrences",
        filename=str(path.relative_to(PROJECT_ROOT)),
        url="https://api.inaturalist.org/v1/observations",
        licence="iNaturalist (varies by observation; public API)",
        notes=f"{len(slim)} records in district bbox",
    )


def download_worldcover(bbox: dict, log: list[dict]) -> None:
    out_dir = DATA_RAW / "worldcover"
    tiles = worldcover_tiles(bbox)
    print(f"  WorldCover tiles: {tiles}")
    for tile in tiles:
        url = WORLDCOVER_BASE.format(tile=tile)
        dest = out_dir / f"ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        if dest.exists() and dest.stat().st_size > 1_000_000:
            print(f"  skip existing {dest.name}")
        else:
            download_file(url, dest)
        _log(
            log,
            dataset="ESA WorldCover 2021 10m",
            filename=str(dest.relative_to(PROJECT_ROOT)),
            url=url,
            licence="CC BY 4.0 (ESA WorldCover)",
            notes=tile,
        )


def _overpass_query(ql: str) -> dict:
    last_err: Exception | None = None
    for endpoint in OVERPASS_URLS:
        try:
            raw = post_text(endpoint, "data=" + ql, timeout=300)
            return json.loads(raw.decode("utf-8"))
        except Exception as err:  # noqa: BLE001
            last_err = err
            print(f"  Overpass {endpoint} failed: {err}")
            time.sleep(2)
    raise RuntimeError("All Overpass endpoints failed") from last_err


def download_osm(bbox: dict, log: list[dict]) -> None:
    """Roads, water, settlements via Overpass (district bbox, not full island PBF)."""
    out_dir = RAW_OSM
    out_dir.mkdir(parents=True, exist_ok=True)
    s, w, n, e = bbox["min_lat"], bbox["min_lon"], bbox["max_lat"], bbox["max_lon"]
    bb = f"{s},{w},{n},{e}"

    queries = {
        "roads": f"""
[out:json][timeout:180];
way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential"]({bb});
out geom;
""",
        "water": f"""
[out:json][timeout:180];
(
  way["waterway"]({bb});
  way["natural"="water"]({bb});
  relation["natural"="water"]({bb});
  way["landuse"="reservoir"]({bb});
);
out geom;
""",
        "settlements": f"""
[out:json][timeout:180];
(
  node["place"~"city|town|village|hamlet"]({bb});
  way["place"~"city|town|village|hamlet"]({bb});
  way["landuse"="residential"]({bb});
);
out geom;
""",
        "protected_areas_osm": f"""
[out:json][timeout:240];
(
  relation["boundary"="protected_area"]({bb});
  way["boundary"="protected_area"]({bb});
  relation["boundary"="national_park"]({bb});
  way["boundary"="national_park"]({bb});
);
out geom;
""",
    }

    for name, ql in queries.items():
        dest_raw = out_dir / f"{name}_{FILE_TAG}_overpass.json"
        if dest_raw.exists() and dest_raw.stat().st_size > 1000 and name != "protected_areas_osm":
            # roads/water/settlements already fetched successfully
            n_el = "existing"
            print(f"  skip existing {dest_raw.name}")
            _log(
                log,
                dataset=f"OSM {name}",
                filename=str(dest_raw.relative_to(PROJECT_ROOT)),
                url="Overpass API (OpenStreetMap)",
                licence="ODbL — © OpenStreetMap contributors",
                notes=f"reused existing file ({n_el})",
            )
            continue
        print(f"  Overpass: {name}")
        data = _overpass_query(ql)
        dest_raw.write_text(json.dumps(data), encoding="utf-8")
        n_el = len(data.get("elements") or [])
        _log(
            log,
            dataset=f"OSM {name}",
            filename=str(dest_raw.relative_to(PROJECT_ROOT)),
            url="Overpass API (OpenStreetMap)",
            licence="ODbL — © OpenStreetMap contributors",
            notes=f"{n_el} elements in bbox",
        )
        time.sleep(2)


def download_worldpop(log: list[dict]) -> None:
    out_dir = DATA_RAW / "worldpop"
    last_err: Exception | None = None
    for url in WORLDPOP_URLS:
        dest = out_dir / Path(url).name
        try:
            if dest.exists() and dest.stat().st_size > 100_000:
                print(f"  skip existing {dest.name}")
            else:
                download_file(url, dest)
            _log(
                log,
                dataset="WorldPop population",
                filename=str(dest.relative_to(PROJECT_ROOT)),
                url=url,
                licence="CC BY 4.0 (WorldPop)",
                notes="Sri Lanka national raster; clip in Phase 2",
            )
            return
        except Exception as err:  # noqa: BLE001
            last_err = err
            print(f"  WorldPop URL failed: {url} ({err})")
    raise RuntimeError("WorldPop download failed") from last_err


def download_nasa_power(bbox: dict, log: list[dict]) -> None:
    """Point climatology on a coarse grid (regional API is unreliable)."""
    out_dir = DATA_RAW / "nasa_power"
    out_dir.mkdir(parents=True, exist_ok=True)

    lats = []
    lons = []
    lat = bbox["min_lat"]
    while lat <= bbox["max_lat"] + 1e-9:
        lats.append(round(lat, 4))
        lat += 0.5
    lon = bbox["min_lon"]
    while lon <= bbox["max_lon"] + 1e-9:
        lons.append(round(lon, 4))
        lon += 0.5

    points = []
    for la in lats:
        for lo in lons:
            params = {
                "parameters": "T2M,PRECTOTCORR",
                "community": "AG",
                "longitude": f"{lo:.4f}",
                "latitude": f"{la:.4f}",
                "format": "JSON",
            }
            url = (
                "https://power.larc.nasa.gov/api/temporal/climatology/point?"
                + urlencode(params)
            )
            print(f"  NASA POWER point ({lo}, {la})")
            data = get_json(url, timeout=120)
            points.append({"lon": lo, "lat": la, "response": data})
            time.sleep(0.5)

    dest = out_dir / f"climatology_t2m_prectotcorr_{FILE_TAG}.json"
    payload = {
        "parameter": "T2M,PRECTOTCORR",
        "grid_step_deg": 0.5,
        "bbox": bbox,
        "points": points,
    }
    dest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _log(
        log,
        dataset="NASA POWER climatology",
        filename=str(dest.relative_to(PROJECT_ROOT)),
        url="https://power.larc.nasa.gov/api/temporal/climatology/point",
        licence="Public domain (NASA POWER)",
        notes=f"T2M + PRECTOTCORR monthly climatology, {len(points)} grid points",
    )


def download_dem(bbox: dict, log: list[dict]) -> None:
    out_dir = DATA_RAW / "dem"
    for url in copernicus_dem_tiles(bbox):
        dest = out_dir / Path(url).name
        if dest.exists() and dest.stat().st_size > 100_000:
            print(f"  skip existing {dest.name}")
        else:
            download_file(url, dest)
        _log(
            log,
            dataset="Copernicus GLO-30 DEM",
            filename=str(dest.relative_to(PROJECT_ROOT)),
            url=url,
            licence="Copernicus DEM — open access with citation",
            notes="30 m; clip and derive slope in Phase 2",
        )


def download_wdpa(log: list[dict]) -> None:
    out_dir = DATA_RAW / "wdpa"
    last_err: Exception | None = None
    for url in WDPA_URLS:
        dest = out_dir / Path(url).name
        try:
            download_file(url, dest, timeout=180)
            if dest.stat().st_size < 1000:
                dest.unlink(missing_ok=True)
                raise RuntimeError("tiny file — not a shapefile zip")
            _log(
                log,
                dataset="WDPA Sri Lanka",
                filename=str(dest.relative_to(PROJECT_ROOT)),
                url=url,
                licence="WDPA / Protected Planet terms",
                notes="country extract if URL still valid",
            )
            return
        except Exception as err:  # noqa: BLE001
            last_err = err
            print(f"  WDPA URL failed ({err})")
    print(
        "  WDPA zip not available without Protected Planet token. "
        "OSM protected_areas query is the fallback (already downloaded)."
    )
    note = DATA_RAW / "wdpa" / "README.txt"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text(
        "Official WDPA country zip requires a Protected Planet account/token.\n"
        "Phase 1 uses OSM protected-area polygons from Overpass as the working layer.\n"
        "Optional later: register at https://www.protectedplanet.net/ and download LKA.\n",
        encoding="utf-8",
    )
    _log(
        log,
        dataset="WDPA Sri Lanka",
        filename=str(note.relative_to(PROJECT_ROOT)),
        url="https://www.protectedplanet.net/",
        licence="n/a — fallback documented",
        notes="official zip skipped; use data/raw/osm/protected_areas_osm_*",
    )
    _ = last_err


def _write_points_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("source,lon,lat\n", encoding="utf-8")
        return
    keys = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


def write_docs_log(log: list[dict]) -> None:
    docs = PROJECT_ROOT / "docs" / "data-sources.md"
    text = docs.read_text(encoding="utf-8")
    marker = "## Download log"
    idx = text.find(marker)
    if idx < 0:
        return
    header = text[: idx + len(marker)]
    table = [
        "",
        "",
        "| Date | Dataset | Filename | Notes |",
        "|------|---------|----------|-------|",
    ]
    for row in log:
        notes = (row.get("notes") or "").replace("|", "/")
        table.append(
            f"| {row.get('date','')} | {row.get('dataset','')} | "
            f"`{row.get('filename','')}` | {notes} |"
        )
    table.append("")
    docs.write_text(header + "\n".join(table), encoding="utf-8")


def main(only: set[str] | None = None) -> None:
    DATA_RAW.mkdir(parents=True, exist_ok=True)
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    bbox = save_bbox_json(BBOX_PATH)
    print("=== Phase 1 downloads ===")
    print(f"District: {DISTRICT_NAME}")
    print(f"BBox: {bbox}")

    log: list[dict] = [
        {
            "date": "2026-08-23",
            "dataset": "District boundary (Nominatim / OSM)",
            "filename": "data/processed/study_area.geojson",
            "url": "https://nominatim.openstreetmap.org/",
            "licence": "ODbL",
            "notes": f"{DISTRICT_NAME} District, Polygon, ODbL",
        },
        {
            "date": TODAY,
            "dataset": "District bbox",
            "filename": str(BBOX_PATH.relative_to(PROJECT_ROOT)),
            "url": "derived from study_area.geojson",
            "licence": "ODbL",
            "notes": json.dumps(bbox),
        },
    ]

    steps = [
        ("gbif", "1.1 GBIF", lambda: download_gbif(bbox, log)),
        ("inat", "1.1 iNaturalist", lambda: download_inaturalist(bbox, log)),
        ("osm", "1.3 OSM", lambda: download_osm(bbox, log)),
        ("nasa", "1.5 NASA POWER", lambda: download_nasa_power(bbox, log)),
        ("worldpop", "1.4 WorldPop", lambda: download_worldpop(log)),
        ("dem", "1.6 Copernicus DEM", lambda: download_dem(bbox, log)),
        ("worldcover", "1.2 WorldCover", lambda: download_worldcover(bbox, log)),
        ("wdpa", "1.7 WDPA", lambda: download_wdpa(log)),
    ]

    failed: list[str] = []
    for key, name, fn in steps:
        if only is not None and key not in only:
            continue
        print(f"\n--- {name} ---")
        try:
            fn()
        except Exception as err:  # noqa: BLE001
            print(f"[FAIL] {name}: {err}")
            failed.append(f"{name}: {err}")
            log.append(
                {
                    "date": TODAY,
                    "dataset": name,
                    "filename": "",
                    "url": "",
                    "licence": "",
                    "notes": f"FAILED: {err}",
                }
            )

    # Merge with previous manifest when doing a partial rerun
    if only is not None and MANIFEST_PATH.exists():
        try:
            prev = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            keep = [
                r
                for r in prev
                if not any(
                    (r.get("dataset") or "").startswith(n.split()[0])
                    or n in (r.get("dataset") or "")
                    for _, n, _ in steps
                    if _ in only
                )
            ]
            # simpler: keep prev rows whose dataset is not rewritten this run
            rewritten = {r.get("dataset") for r in log}
            keep = [r for r in prev if r.get("dataset") not in rewritten]
            log = keep + log
        except Exception:  # noqa: BLE001
            pass

    MANIFEST_PATH.write_text(json.dumps(log, indent=2), encoding="utf-8")
    write_docs_log(log)
    print(f"\nManifest: {MANIFEST_PATH}")
    if failed:
        print("Some steps failed:")
        for item in failed:
            print(" -", item)
        sys.exit(1)
    print("Phase 1 complete.")


if __name__ == "__main__":
    only_arg = None
    if len(sys.argv) > 1 and sys.argv[1] == "--only":
        only_arg = set(sys.argv[2].split(","))
    main(only=only_arg)
