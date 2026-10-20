# Data sources — Component 1

Record every download here: URL, date, licence, local filename.

## Study area

| Field | Value |
|-------|-------|
| District | **Anuradhapura** (confirmed Phase 0) |
| Boundary file | `data/processed/study_area.geojson` |
| BBox file | `data/processed/study_area_bbox.json` |
| Grid resolution | **500 m** |
| Projected CRS | **EPSG:5234** (Sri Lanka Grid 1999 — metres) |
| Geographic CRS | **EPSG:4326** (WGS84 — downloads / web maps) |
| Boundary source | OpenStreetMap via Nominatim (`src/download_study_area.py`) |
| Boundary licence | ODbL — © OpenStreetMap contributors |
| Compute note | Feature engineering can run locally; **model training OK on Google Colab** |

Shared settings live in `src/config.py`.

---

## Required datasets (Phase 1 status)

### Elephant occurrences — **done**

| Source | GBIF + iNaturalist |
|--------|-------------------|
| Query | *Elephas maximus* |
| GBIF taxonKey | **5219461** (from species/match) |
| Local path | `data/raw/elephant_occurrences/` |
| Clipped | `data/processed/elephant_occurrences_anuradhapura.csv` (**164** GBIF points in district) |
| iNaturalist | 737 in bbox; **245** inside district polygon |
| Licence | GBIF Terms of Use; iNaturalist (varies by observation) |
| Notes | Cite GBIF DOI in thesis if you create an official download; API pull is fine for prototype |

### Land cover — **done**

| Source | ESA WorldCover 2021 10 m (AWS open data) |
|--------|------------------------------------------|
| Tiles | `N06E078`, `N06E081` |
| Local path | `data/raw/worldcover/` |
| Licence | CC BY 4.0 |

### OpenStreetMap (roads, water, settlements, parks) — **done**

| Source | Overpass API (district bbox, not full Geofabrik PBF) |
|--------|------------------------------------------------------|
| Local path | `data/raw/osm/*_anuradhapura_overpass.json` |
| Counts | roads 23 186; water 10 067; settlements 1 204; protected areas 25 |
| Licence | ODbL — © OpenStreetMap contributors |

### Population — **done**

| Source | WorldPop 2020 UN-adjusted population (100 m) |
|--------|-----------------------------------------------|
| File | `data/raw/worldpop/lka_ppp_2020_UNadj.tif` |
| Licence | CC BY 4.0 |
| Notes | National Sri Lanka raster — clip in Phase 2 |

### Climate — **done**

| Source | NASA POWER monthly climatology (point grid 0.5°) |
|--------|--------------------------------------------------|
| File | `data/raw/nasa_power/climatology_t2m_prectotcorr_anuradhapura.json` |
| Parameters | T2M, PRECTOTCORR — **9** grid points |
| Licence | Public domain |

### Elevation — **done**

| Source | Copernicus GLO-30 DEM (AWS) |
|--------|-----------------------------|
| Tiles | N07–N08 × E079–E081 (6 GeoTIFFs) |
| Local path | `data/raw/dem/` |
| Licence | Copernicus DEM — cite in report |
| Notes | Derive slope in Phase 2 |

### Protected areas — **done (OSM fallback)**

| Source | OSM protected_area / national_park via Overpass |
|--------|--------------------------------------------------|
| File | `data/raw/osm/protected_areas_osm_anuradhapura_overpass.json` |
| Official WDPA | DNS failed for cloudfront country zip; optional later via [Protected Planet](https://www.protectedplanet.net/) account |
| Notes | OSM layer is enough for Phase 2 prototype |

---

## Optional (validation only)

- Published HEC intensity tables (Fernando et al.) — district/DS-division secondary data, fully cited.

---

## How to re-download

```powershell
cd component-1-danger-map
.\.venv\Scripts\activate
$env:PYTHONUNBUFFERED=1
python src/download_phase1.py
# or partial: python src/download_phase1.py --only gbif,inat,osm,nasa,worldpop,dem,worldcover,wdpa
```

---

## Download log

| Date | Dataset | Filename | Notes |
|------|---------|----------|-------|
| 2026-08-23 | District boundary (Nominatim / OSM) | `data/processed/study_area.geojson` | Polonnaruwa District, Polygon, ODbL |
| 2026-10-18 | District bbox | `data\processed\polonnaruwa\study_area_bbox.json` | {"min_lon": 80.72936200000001, "min_lat": 7.6312367000000005, "max_lon": 81.3632729, "max_lat": 8.365315299999999} |
| 2026-10-18 | GBIF elephant occurrences | `data\raw\elephant_occurrences\gbif_elephas_maximus_sri_lanka.json` | 1918 georeferenced records nationwide |
| 2026-10-18 | GBIF elephant occurrences (clipped) | `data\processed\polonnaruwa\elephant_occurrences_polonnaruwa.csv` | 371 records inside district |
| 2026-10-18 | iNaturalist elephant occurrences | `data\raw\elephant_occurrences\inaturalist_elephas_maximus_bbox.json` | 543 records in district bbox |
| 2026-10-18 | OSM roads | `data\raw\osm\polonnaruwa\roads_polonnaruwa_overpass.json` | 6327 elements in bbox |
| 2026-10-18 | OSM water | `data\raw\osm\polonnaruwa\water_polonnaruwa_overpass.json` | 2084 elements in bbox |
| 2026-10-18 | OSM settlements | `data\raw\osm\polonnaruwa\settlements_polonnaruwa_overpass.json` | 194 elements in bbox |
| 2026-10-18 | OSM protected_areas_osm | `data\raw\osm\polonnaruwa\protected_areas_osm_polonnaruwa_overpass.json` | 8 elements in bbox |
| 2026-10-18 | NASA POWER climatology | `data\raw\nasa_power\climatology_t2m_prectotcorr_polonnaruwa.json` | T2M + PRECTOTCORR monthly climatology, 4 grid points |
| 2026-10-18 | WorldPop population | `data\raw\worldpop\lka_ppp_2020_UNadj.tif` | Sri Lanka national raster; clip in Phase 2 |
| 2026-10-18 | Copernicus GLO-30 DEM | `data\raw\dem\Copernicus_DSM_COG_10_N07_00_E080_00_DEM.tif` | 30 m; clip and derive slope in Phase 2 |
| 2026-10-18 | Copernicus GLO-30 DEM | `data\raw\dem\Copernicus_DSM_COG_10_N07_00_E081_00_DEM.tif` | 30 m; clip and derive slope in Phase 2 |
| 2026-10-18 | Copernicus GLO-30 DEM | `data\raw\dem\Copernicus_DSM_COG_10_N08_00_E080_00_DEM.tif` | 30 m; clip and derive slope in Phase 2 |
| 2026-10-18 | Copernicus GLO-30 DEM | `data\raw\dem\Copernicus_DSM_COG_10_N08_00_E081_00_DEM.tif` | 30 m; clip and derive slope in Phase 2 |
| 2026-10-18 | ESA WorldCover 2021 10m | `data\raw\worldcover\ESA_WorldCover_10m_2021_v200_N06E078_Map.tif` | N06E078 |
| 2026-10-18 | ESA WorldCover 2021 10m | `data\raw\worldcover\ESA_WorldCover_10m_2021_v200_N06E081_Map.tif` | N06E081 |
| 2026-10-18 | WDPA Sri Lanka | `data\raw\wdpa\README.txt` | official zip skipped; use data/raw/osm/protected_areas_osm_* |
