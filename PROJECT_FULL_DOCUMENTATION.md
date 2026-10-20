# HEC Ali — Full Project Documentation

**Audience:** someone who knows nothing about this project.  
**Purpose:** one place that covers the full idea, every component, data sources, training, models, outputs, APIs, ports, and how the pieces connect.  
**Source of truth:** this repo root (promoted from the old `New Changes` tree). Do **not** develop against `_old_archive/`.

| Item | Detail |
|------|--------|
| Project name | Ali / Gaja Saviya — Human–Elephant Conflict (HEC) early-warning stack |
| Demo district (primary) | **Anuradhapura**, Sri Lanka |
| Secondary district (Comp-1) | **Polonnaruwa** (danger map ready; Comp-2/3 still Anuradhapura-centric) |
| Nature of demo | Software-only research demonstration — **simulated** elephant movement, not live DWC collars |
| Document date | Compiled from the live codebase |

---

## Table of contents

1. [What this project is (plain English)](#1-what-this-project-is-plain-english)
2. [System architecture & ports](#2-system-architecture--ports)
3. [End-to-end user story (demo flow)](#3-end-to-end-user-story-demo-flow)
4. [Component 1 — Danger Map](#4-component-1--danger-map)
5. [Component 2 — Sparse Tracker](#5-component-2--sparse-tracker)
6. [Component 3 — Safe Roads](#6-component-3--safe-roads)
7. [Component 4 — Path Guard](#7-component-4--path-guard)
8. [Auth service](#8-auth-service)
9. [Frontend (Next.js UI)](#9-frontend-nextjs-ui)
10. [How to run everything](#10-how-to-run-everything)
11. [Honesty / limitations](#11-honesty--limitations)
12. [File & doc index](#12-file--doc-index)

---

## 1. What this project is (plain English)

### 1.1 The problem

In rural Sri Lanka, wild elephants come near villages and farms. People get hurt, crops are destroyed, and elephants are killed. This is **human–elephant conflict (HEC)**.

Most warnings come **too late** — when someone has already seen an elephant in a field or on a road.

### 1.2 The idea

Build a **phone/computer warning system** that:

1. Colours land by **where elephants and people are likely to clash** (not merely “where there is forest”).
2. **Follows a (simulated) elephant** even when GPS updates arrive only once an hour.
3. Colours **nearby roads** red/green and can suggest a **safer route** around danger.
4. Shows everything on one **map screen**, with Path Guard adding threat-aware A→B routing and sighting verification.

It is **only software**. There are no cameras, microphones, or electric fences deployed by this student team. There are no GPS collars on real Sri Lankan elephants. The moving animal in the demo is a **carefully built simulation** driven by open GIS data and foreign Movebank movement statistics.

### 1.3 One-sentence summary

> We map where people and elephants are likely to clash, follow a simulated elephant when location updates are rare, colour/avoid risky roads, and show alerts and safer paths — using public data and honest computer simulation.

### 1.4 How “risk” is defined (core formula)

Comp-1’s land risk (the foundation everything else sits on):

```
habitat_suitability = P(elephant presence | ecological features)   # XGBoost
human_exposure      = f(cropland, built-up, population)
risk_score          = habitat × exposure × seasonal_rainfall_multiplier  # rainfall optional
```

High risk = elephants are likely **and** people live/farm nearby.

### 1.5 Component map (proposal names → folders)

| Everyday name | Research role | Folder | Port |
|---------------|---------------|--------|------|
| Danger map | RQ1 spatial risk surface | `component-1-danger-map/` | **8003** |
| Sparse tracker | Fill gaps between hourly GPS | `component-2-tracker/` | **8001** |
| Safe-road finder | Local roads + optional safer A→B | `component-3-safe-roads/` | **8002** |
| Path Guard | Threat hub + risk Dijkstra + ML sightings | `Component 4/.../Path_Guard/` | **5001** + ML **8004** |
| Auth | Accounts / OTP / profile | `auth-service/` | **8005** |
| Screen | Integrated Next.js UI | `frontend/` | **3000** |

Related proposal docs in the repo root: `HEC_Project_Simple_Explanation.md`, `HEC_Topic_and_Components_Brief.md`, `HEC_University_Project_Proposal.md`, `HEC_Research_Unit_Proposal.md`.

---

## 2. System architecture & ports

```
                    ┌─────────────────────────────┐
                    │   Next.js frontend (:3000)   │
                    │   /  and  /path-guard         │
                    └──────────────┬──────────────┘
                                   │ HTTP (+ Socket.io to :5001)
         ┌─────────────┬───────────┼───────────┬──────────────┐
         ▼             ▼           ▼           ▼              ▼
   Comp-1 :8003   Comp-2 :8001  Comp-3 :8002  Comp-4 :5001   Auth :8005
   Danger Map     Tracker       Safe Roads    Path Guard     SQLite
         │             │           │              │
         │  disk files │           │              │
         └──────►──────┴────►──────┘              ▼
         feature_grid / risk_grid / OSM      ML :8004
                                              (trust RF)
```

| Service | Path | Port | Entry |
|---------|------|------|-------|
| Comp-1 Danger Map | `component-1-danger-map/` | **8003** | `api.main:app` |
| Comp-2 Tracker | `component-2-tracker/` | **8001** | `api.main:app` |
| Comp-3 Safe Roads | `component-3-safe-roads/` | **8002** | `api.main:app` |
| Auth | `auth-service/` | **8005** | `api.main:app` |
| Comp-4 Path Guard ML | `Component 4/.../ml-microservice/` | **8004** | `app.main:app` |
| Comp-4 Path Guard API | `Component 4/.../backend/` | **5001** | `src/server.js` + Socket.io |
| Next.js UI | `frontend/` | **3000** | `npm run dev` |

**Important:** Comp-1 is **8003**, not 8000 (8000 is often taken on this machine).

**Orchestrator:** `run_servers.py` at repo root — starts all Python APIs from one shared `.venv`, plus Comp-4 Node with `ML_SERVICE_URL=http://127.0.0.1:8004`.

**Shared Python deps:** root `requirements.txt` (Comp-1–3 + Comp-4 ML). Comp-4 Node needs `npm install` inside its `backend/` folder once.

**Disk coupling (not HTTP):** Comp-2 and Comp-3 read Comp-1 parquet / GeoPackage files from disk. The frontend passes Comp-2 elephant position into Comp-3 and Comp-4 over HTTP.

---

## 3. End-to-end user story (demo flow)

Open **http://localhost:3000** with all servers running.

1. **Comp-1** — Choose district (Anuradhapura / Polonnaruwa) and month; optionally apply rainfall. API returns risk cells. Map shows hotspots; user picks a high-risk cell.
2. **Comp-2** — `POST /api/v1/simulate` with that `cell_id`. A 48-hour synthetic elephant path is simulated; hourly noisy “collar” pings; EKF fills gaps; playback animates true vs estimate + uncertainty circle + alerts.
3. **Comp-3** — For the current elephant estimate (and trail), `POST /api/v1/local_roads` colours nearby roads **red** (risky) / **green** (safer) and returns advice text.
4. **Comp-4** — Sync Anuradhapura road subgraph from Comp-2/3 context; post elephant as an acoustic-style threat; user picks origin/destination inside the wander zone; Dijkstra returns **safe path** (green) vs **shortest** (grey dashed); orange threat circles on the map.

Standalone Path Guard lab: **http://localhost:3000/path-guard** (Malabe demo coords, Socket.io live threats, sighting ML verify).

---

## 4. Component 1 — Danger Map

**Path:** `component-1-danger-map/`  
**Everyday name:** Where are people and elephants likely to clash?  
**API port:** **8003**  
**Status:** Phases 0–8 complete for Anuradhapura; Polonnaruwa prepared + pooled model trained and API-ready.

### 4.1 Purpose

Produce a **500 m** grid of HEC overlap risk for a district. Hand scored grids to Comp-2/3/4 and the frontend. Explain in plain English *why* a cell is red (farm + village + forest edge, etc.).

Does **not** do live tracking, road routing, or official DWC warnings.

### 4.2 Directory layout

```
component-1-danger-map/
├── api/main.py                 # FastAPI
├── src/                        # Phase scripts (download, grid, labels, predict, maps, validate, handoff)
├── scripts/                    # Orchestrators (download_all, build_risk_map, prepare_district_for_colab)
├── notebooks/
│   ├── phase4_train_risk_model.ipynb   # Canonical Colab training
│   └── phase4_colab_run.ipynb
├── docs/                       # data-sources, methods_note, FRONTEND_API, colab notes
├── data/raw/                   # Downloaded open data
├── data/processed/             # AN flat; polonnaruwa/ subfolder
├── outputs/                    # Models, maps, reports, api_cache, colab_packs
├── phase4_outputs/             # Local copy of Colab Phase-4 artifacts
└── handoff/                    # Pack for Comp-3/4 (Anuradhapura)
```

### 4.3 Data sources (where data is gathered)

| Dataset | Source | How obtained | Licence / note |
|---------|--------|--------------|----------------|
| District boundary | OSM Nominatim | `src/download_study_area.py` | ODbL |
| Elephant occurrences | GBIF (*Elephas maximus*, taxonKey 5219461) | `api.gbif.org` via Phase 1 | GBIF ToU |
| Elephant occurrences | iNaturalist | `api.inaturalist.org` | Varies |
| Land cover | ESA WorldCover 2021 10 m | AWS S3 `esa-worldcover` | CC BY 4.0 |
| Roads / water / settlements / parks | OSM Overpass | Overpass API | ODbL |
| Population | WorldPop 2020 UN-adj | `data.worldpop.org` | CC BY 4.0 |
| Climate | NASA POWER climatology (T2M, PRECTOTCORR) | `power.larc.nasa.gov` | Public domain |
| Elevation | Copernicus GLO-30 DEM | AWS `copernicus-dem-30m` | Cite Copernicus |
| Protected areas | OSM parks (WDPA zip skipped) | Overpass; see `data/raw/wdpa/README.txt` | ODbL |

Re-download: `python scripts/download_all.py` or `python src/download_phase1.py`.  
Full licence log: `docs/data-sources.md`.  
Manifests: `data/raw/phase1_manifest.json`, `data/raw/phase1_manifest_polonnaruwa.json`.

### 4.4 Raw data files (`data/raw/`)

| Path | Format | Contents |
|------|--------|----------|
| `elephant_occurrences/gbif_elephas_maximus_sri_lanka.json` / `.csv` | JSON/CSV | Nationwide GBIF dump |
| `elephant_occurrences/inaturalist_elephas_maximus_bbox.json` / `.csv` | JSON/CSV | iNat in district bbox |
| `worldcover/ESA_WorldCover_10m_2021_v200_N06E078_Map.tif` (+ N06E081) | GeoTIFF | Land-cover tiles |
| `worldpop/lka_ppp_2020_UNadj.tif` | GeoTIFF | Sri Lanka population ~100 m |
| `dem/Copernicus_DSM_COG_10_N07…E079…` … `N08…E081…` | GeoTIFF | 6 DEM tiles |
| `nasa_power/climatology_t2m_prectotcorr_anuradhapura.json` | JSON | 9 POWER points, monthly climate |
| `nasa_power/climatology_t2m_prectotcorr_polonnaruwa.json` | JSON | 4 POWER points |
| `osm/roads_anuradhapura_overpass.json` (+ water, settlements, protected) | JSON | OSM extracts |
| `osm/polonnaruwa/*.json` | JSON | Polonnaruwa OSM extracts |
| `wdpa/README.txt` | Text | WDPA skipped; use OSM |
| `phase1_manifest*.json` | JSON | Download logs |

### 4.5 Processed data

**Anuradhapura** — `data/processed/` (flat layout):

| File | Contents |
|------|----------|
| `study_area.geojson`, `study_area_bbox.json` | District polygon / bbox ≈ 79.93–81.01 E, 7.80–8.94 N |
| `elephant_occurrences_anuradhapura.csv` | GBIF clipped (**164** pts) |
| `osm_layers.gpkg` | Converted OSM layers |
| `dem_anuradhapura.tif`, `worldcover_anuradhapura.tif`, `worldpop_anuradhapura.tif` | Clipped rasters |
| `grid_cells.gpkg` | 500 m fishnet |
| `feature_grid.parquet` / `.csv` + `feature_grid_meta.json` | **28 817** cells (`nx=229`, `ny=245`) |
| `feature_grid_labeled.parquet`, `occurrences_snapped.csv`, `cell_labels.csv` | Labels |
| `training_set.parquet` / `.csv` | **2 618** rows (238 presence + 2380 background) |
| `phase3_summary.json` | Label counts |

**Polonnaruwa** — `data/processed/polonnaruwa/` (same schema):

| File | Notes |
|------|-------|
| Occurrences CSV | **371** GBIF in district |
| Feature grid | **13 756** cells (`nx=132`, `ny=155`) |
| Training set (district Phase 3) | 440 presence + 4400 background |
| `phase3_summary.json` | 844 occurrence records → 440 presence cells |

**Feature columns (both districts):**  
`cell_id`, `ix`, `iy`, `cx`, `cy`,  
`frac_tree`, `frac_crop`, `frac_built`, `frac_water`, `frac_shrub_grass`,  
`elevation_m`, `slope_deg`, `temp_c`, `precip_mm`,  
`pop_mean`, `pop_density_approx`,  
`dist_road_m`, `dist_water_m`, `dist_settlement_m`,  
`protected`, `forest_edge`, `human_exposure_raw`

- Centroids in **EPSG:5234**; grid **500 m**
- Forest edge: tree ≥20% and crop/built ≥10%

### 4.6 Pipeline phases (0–8)

| Phase | What | Scripts | Key outputs |
|-------|------|---------|-------------|
| 0 Setup | District, CRS | `setup_phase0.py`, `download_study_area.py` | `study_area.geojson` |
| 1 Collect | Download open data | `download_phase1.py`, `scripts/download_all.py` | `data/raw/**` |
| 2 Feature grid | Fishnet + sample rasters + distances + climate IDW | `convert_osm.py`, `build_feature_grid.py` | `feature_grid.parquet` |
| 3 Labels | Snap occurrences; background 10× | `label_presence_background.py` | `training_set.parquet` |
| 4 Train | Spatial CV + final XGBoost; score grid | **Colab** `notebooks/phase4_train_risk_model.ipynb` | `xgb_habitat_model.joblib`, risk scores |
| 5 Explain | Rule tags + “why” sentences | `explain_risk.py` | `risk_explanations.json` |
| 6 Maps | GeoTIFF / PNG / Folium / GeoJSON | `build_risk_maps.py` | `outputs/maps/*` |
| 7 Validate | Re-CV, sanity, sensitivity | `validate_risk_map.py` | `phase7_*` |
| 8 Handoff | Pack for Comp-3/4 | `export_handoff.py` | `handoff/` |

Orchestrators:

- `python scripts/download_all.py` → Phase 0–1  
- `python scripts/build_risk_map.py` → Phase 2–3, 5–8 (skips 4 if model+scores exist)  
- `HEC_DISTRICT=polonnaruwa python scripts/prepare_district_for_colab.py polonnaruwa` → PO prep + Colab zips  

District switch: env `HEC_DISTRICT=anuradhapura|polonnaruwa` (default Anuradhapura).

### 4.7 Training (Phase 4 — Colab)

1. Build `training_set` locally (Phase 3).  
2. Upload Colab pack (`docs/colab-notes.md` / `docs/colab_polonnaruwa.md`).  
3. Run `notebooks/phase4_train_risk_model.ipynb`:
   - 5-fold **GroupKFold** on spatial blocks (`ix//20`, `iy//20` ≈ 10 km); pooled runs prefix groups by `district`
   - Fit final `XGBClassifier` on all training rows
   - Predict habitat on full `feature_grid`
   - `risk = habitat × human_exposure` (exposure from `human_exposure_raw` percentiles 2–98)
4. Download `phase4_outputs.zip`; place into `outputs/` or `outputs/polonnaruwa/`.

**Labels / splits:**

| | Anuradhapura | Polonnaruwa (district) | Pooled AN+PO |
|--|--------------|------------------------|--------------|
| Presence | 238 | 440 | 678 |
| Background | 2 380 (10×, seed 42) | 4 400 | 6 780 |
| Train rows | 2 618 | 4 840 | **7 458** |

No random holdout — spatial GroupKFold only; final model fits all train rows.

**16 XGBoost features:**

```
frac_tree, frac_crop, frac_built, frac_water, frac_shrub_grass,
elevation_m, slope_deg, temp_c, precip_mm,
pop_mean, pop_density_approx,
dist_road_m, dist_water_m, dist_settlement_m,
protected, forest_edge
```

**Hyperparameters:**

```python
XGBClassifier(
  n_estimators=300, max_depth=4, learning_rate=0.05,
  subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
  objective='binary:logistic', eval_metric='auc',
  scale_pos_weight=(n_neg / n_pos),  # ~10
  random_state=42, n_jobs=-1,
)
BLOCK = 20
GroupKFold(n_splits=5)
```

Joblib bundle keys: `model`, `feature_cols`, `scale_pos_weight`, `block`.

**Documented CV metrics:**

| Model | Mean AUC | OOF AUC | OOF AP |
|-------|----------|---------|--------|
| Anuradhapura Phase 4 | 0.838 ± 0.042 | 0.847 | 0.322 |
| Anuradhapura Phase 7 recheck | 0.841 ± 0.036 | 0.850 | 0.332 |
| Pooled AN+PO → score PO | 0.845 ± 0.016 | 0.849 | 0.313 |

### 4.8 Model artifacts

| Artifact | Path | Predicts |
|----------|------|----------|
| AN habitat model | `outputs/xgb_habitat_model.joblib` | `P(presence)` = habitat suitability |
| PO / pooled model | `outputs/polonnaruwa/xgb_habitat_model.joblib` | Habitat on PO grid |
| Optional pooled copy | `outputs/xgb_habitat_model_pooled.joblib` | Shared if registered |
| Colab scratch | `phase4_outputs/xgb_habitat_model.joblib` | Intermediate |

**Not ML but part of risk:**

- `human_exposure` — crop / built / pop mix (normalized)
- `seasonal_rainfall_multiplier` — rule-based dry/wet boost (`src/rainfall_risk.py`), typically ~0.55–1.75

### 4.9 Model / pipeline outputs

**Anuradhapura maps** (`outputs/maps/`):  
`risk_scores.*`, `risk_with_explanations.*`, `risk_explanations.json`, `risk_surface.tif`, `risk_cells.geojson`/`.gpkg`, preview PNGs, `risk_map.html`.

**Reports** (`outputs/reports/`):  
`phase4_summary.json`, `spatial_cv_metrics.csv`, `cv_roc_pr.png`, `feature_importance.*`, `shap_summary.png`, `phase3_occurrence_bias.md`, `phase5_*`, `phase6_colour_breaks.md`, `phase7_validation_report.md`, `phase7_metrics.json`, sensitivity files.

**Polonnaruwa** (`outputs/polonnaruwa/`): model + `maps/` + `reports/` + `manifest.json`.

**API cache** (`outputs/api_cache/`): live predict parquets e.g. `anuradhapura_OCT_live.parquet` + `_live_meta.json`.

**Colab packs** (`outputs/colab_packs/`):  
`colab_upload_phase4.zip`, `colab_upload_phase4_polonnaruwa.zip`, `colab_upload_phase4_pooled_an_polonnaruwa.zip` (**preferred** for PO), unpacked pooled folder with `training_set.parquet`, grids, `district_meta.json`.

**Handoff** (`handoff/` — Anuradhapura for Comp-3/4):  
`risk_grid.parquet`/`.csv`, `risk_surface.tif`, `risk_cells.geojson`/`.gpkg`, explanations, maps, `study_area.geojson`, `manifest.json`, methods/colour/validation notes, `FRONTEND_API.md`.

### 4.10 API (Comp-1)

Entrypoint: `api/main.py`. OpenAPI: `http://localhost:8003/docs`.

| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | status, component 1 |
| GET | `/api/v1/districts` | Ready districts + formula |
| POST | `/api/v1/predict` | Live inference: meta, bbox, `top_cells[]`, assets |
| GET | `/api/v1/predict/{district}` | Same via query |
| GET | `/api/v1/cells/{cell_id}` | One cell |
| GET | `/api/v1/boundary/{district}` | Study-area GeoJSON |
| GET | `/api/v1/risk-geojson/{district}` | Full risk grid |
| GET | `/api/v1/risk-raster/{district}` | GeoTIFF |
| GET | `/api/v1/assets/{district}` | Asset URLs |
| Static | `/static/handoff/*`, `/static/maps/*` | Files |

Predict body fields include: `district`, `month` (1–12), `use_rainfall`, `top_n`, `min_risk`, `include_all_cells`, `refresh`.

Each `top_cells` item: `cell_id`, `lon`, `lat`, `risk_score`, `habitat_suitability`, `human_exposure`, `explanation`, `why`, `tags`, `forest_edge`, …

Coming soon (listed, not prepared): Hambantota, Ampara, Monaragala.

### 4.11 Reproduce Comp-1

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
# with root .venv activated
python scripts/download_all.py
# Phase 4 on Colab — docs/colab-notes.md
python scripts/build_risk_map.py
uvicorn api.main:app --reload --host 0.0.0.0 --port 8003
```

---

## 5. Component 2 — Sparse Tracker

**Path:** `component-2-tracker/`  
**Everyday name:** Follow the animal even when we only get a location once in a while.  
**API port:** **8001**  
**District:** Anuradhapura (uses Comp-1 grids).

### 5.1 Purpose

1. Simulate a **habitat-informed synthetic elephant path** on Comp-1’s 500 m grid.  
2. Thin to **hourly GPS-style pings** (with measurement noise).  
3. Run a **constant-velocity Extended Kalman Filter (EKF)** with **habitat bias** → position + 2σ uncertainty.  
4. Evaluate error vs hidden true path; alert when uncertainty overlaps high risk / settlements.  
5. Serve **playback JSON** for the frontend.

**No neural network. No HMM.** Statistical movement fit + classical EKF + heuristics.

### 5.2 Directory layout

```
component-2-tracker/
├── api/main.py
├── docs/FRONTEND_API.md, methods_note.md, movebank_citation.md
├── src/
│   ├── config.py
│   ├── download_movebank.py
│   ├── fit_movement_params.py
│   ├── simulate_path.py
│   ├── sparse_pings.py
│   ├── ekf_tracker.py
│   ├── evaluate_tracker.py
│   ├── pipeline.py          # API path
│   └── run_pipeline.py      # Offline CLI
├── data/raw/movebank/...
├── data/processed/movement_params.json, movebank_fit_report.json
└── outputs/tracks/, maps/, reports/
```

### 5.3 Data sources

#### A) Movebank Kruger GPS (foreign stats only)

| Path | Role |
|------|------|
| `data/raw/movebank/ThermochronTracking Elephants Kruger 2007/ThermochronTracking Elephants Kruger 2007.csv` | ~44 MB GPS tracks |
| `...-reference-data.csv` | Collar/animal metadata |
| `README.txt` | Citation note |

- **Citation:** Slotow, Thaker & Vanak (2019), DOI `10.5441/001/1.403h24q5/1`, licence **CC0 1.0**
- Download: `src/download_movebank.py` (Movebank repo UUID in `config.py`)
- Species in data: *Loxodonta africana* (African elephant) — **stats transferred**, tracks **not** replayed on Sri Lanka
- Fit filters: Kruger-ish bbox; Δt ∈ [4, 65] min; speeds ≤ 3 m/s; projected UTM 36S (`EPSG:32736`)

#### B) Fitted movement parameters (`data/processed/movement_params.json`)

| Field | Example value | Meaning |
|-------|---------------|---------|
| `mean_speed_m_s` | 0.1256 | Median moving speed |
| `speed_std_m_s` | 0.1402 | Speed std |
| `min_speed_m_s` / `max_speed_m_s` | 0.0377 / 0.4571 | Clips |
| `turning_kappa` | 1.719 | Turning concentration |
| `rest_probability` | 0.4074 | P(rest) |
| `fit_n_steps` | 265234 | Steps used |
| `fit_n_animals` | 14 | Individuals |
| `fit_median_dt_min` | 30.0 | Source duty cycle |

Also: `movebank_fit_report.json` (path used, percentiles).

#### C) Comp-1 landscape (Sri Lanka) — read from disk

| Path | Role |
|------|------|
| `../component-1-danger-map/data/processed/feature_grid.parquet` | Cells + land features |
| `../component-1-danger-map/handoff/risk_grid.parquet` | `risk_score`, habitat |
| `../component-1-danger-map/handoff/study_area.geojson` | Boundary |
| `../component-1-danger-map/handoff/feature_grid_meta.json` | Grid meta |

### 5.4 Methods

```
Movebank download → fit movement_params
        ↓
Comp-1 feature + risk grid
        ↓
simulate_path (15 min steps, 48 h)
        ↓
sparse_pings (hourly + N(0,25 m) GPS noise)
        ↓
habitat-biased constant-velocity EKF
        ↓
evaluate + playback.json
```

**Simulator:** 48 h, 15 min steps (~193 steps). Start from Comp-1 `cell_id` (API) or habitat–crop edge (offline). Rest / speed / heading from `movement_params.json`; candidate headings softmaxed over Comp-1 attractiveness (habitat, tree, water, crop×tree edge; penalties for built/pop).

**Sparse collar:** keep `t_minutes` multiples of 60; add σ = **25 m** noise → `x_obs`, `y_obs`.

**EKF state:** `[x, y, vx, vy]` (m, m/s), EPSG:5234.

- Constant-velocity + process noise (`ACCEL_PSD = 1e-4`)
- Measurement variance `R = (30 m)²` per axis
- Speed capped using Movebank max (also hard-capped ≤ 1.5 m/s)
- Habitat bias after predict (`HABITAT_BIAS_STRENGTH=0.22`, radius 1200 m)
- Uncertainty = 2σ from covariance, physically capped: `min(cov_r, 40 + max_speed × seconds_since_ping)`
- **Alerts:** circle overlaps `risk_score ≥ 0.05` or `dist_settlement_m ≤ 1500`

### 5.5 “Training”

**There is no ML model training for the tracker.**

| Activity | Script | Type | Output |
|----------|--------|------|--------|
| Download GPS | `download_movebank.py` | Ingest | Raw CSV |
| Fit movement stats | `fit_movement_params.py` | Statistical estimators | `movement_params.json` |
| Simulate + EKF | rest of `src/` | Physics + heuristics | Tracks / metrics |

### 5.6 Outputs

| File | Role |
|------|------|
| `outputs/tracks/true_path.parquet` (+ `.csv`) | Hidden ground-truth path |
| `outputs/tracks/hourly_pings.parquet` (+ `.csv`) | Sparse observations |
| `outputs/tracks/ekf_track.parquet` (+ `.csv`) | Estimates, errors, alerts |
| `outputs/tracks/playback.json` | Frontend animation payload |
| `outputs/reports/tracker_metrics.json` | Machine metrics |
| `outputs/reports/evaluation_report.md` | Human-readable eval |
| `outputs/reports/error_vs_uncertainty.png` | Plot |
| `outputs/maps/path_and_ekf.png` | Path overview |

**Example metrics** (sample run, start `C0151_0130`): mean error ~168 m, median ~128 m, P90 ~359 m, truth inside 2σ ~92%, alert steps ~8%.

**`playback.json`:** `crs`, `disclaimer`, `start_cell_id`, `metrics`, `pings[]`, `frames[]` (true/est positions, uncertainty, error, alert, ping_update). API adds WGS84 lon/lat.

### 5.7 API (Comp-2)

| Method | Path | Role |
|--------|------|------|
| GET | `/health` | ok + `playback_ready` |
| POST | `/api/v1/simulate` | Body: `{ start_cell_id, save_outputs }` → full playback |
| GET | `/api/v1/playback` | Last saved playback |
| GET | `/api/v1/metrics` | Metrics JSON |
| GET | `/api/v1/frame/{step}` | One frame |

Docs: `docs/FRONTEND_API.md`. Default API reads Comp-1 **parquet on disk** (does not call Comp-1 HTTP).

### 5.8 Connections

- **Comp-1:** landscape + risk for sim, bias, alerts.  
- **Frontend:** hotspot `cell_id` → `simulateTrack`.  
- **Comp-3:** UI sends elephant lon/lat + `uncertainty_radius_m` (+ path) into local roads.  
- **Comp-4:** sync-network uses Comp-2 frames to rebuild subgraph / elephant threat.

### 5.9 Reproduce Comp-2

```powershell
cd c:\Sysconex\Ali\component-2-tracker
python src/run_pipeline.py
# or step-by-step download → fit → simulate → sparse → ekf → evaluate
uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
```

---

## 6. Component 3 — Safe Roads

**Path:** `component-3-safe-roads/`  
**Everyday name:** Don’t take the shortcut through the danger zone.  
**API port:** **8002**  
**District:** Anuradhapura.

### 6.1 Purpose

1. Score road corridors with `segment_risk ∈ [0, 1]` (XGBoost; **proxy** labels, not official crash/DWC records).  
2. Colour roads near Comp-2 elephant estimate — **proximity-first** red/green for the main demo.  
3. Optional Dijkstra: **shortest** vs **safer** (`length × (1 + λ × segment_risk)`, `λ = 12`).  
4. Advice + click-a-road explanations (rule-based, not SHAP).

### 6.2 Directory layout

```
component-3-safe-roads/
├── api/main.py
├── docs/BUILD_PLAN.md, FRONTEND_API.md, methods_note.md, colab_notes.md
├── src/
│   ├── config.py
│   ├── build_road_graph.py
│   ├── build_segment_dataset.py
│   ├── features.py
│   ├── predict_risk.py
│   ├── run_route.py
│   ├── local_roads.py
│   ├── advice.py
│   └── road_explain.py
├── models/
│   ├── road_risk_model.joblib
│   ├── feature_columns.json
│   └── README.md
├── data/processed/   # graph, segments, dataset
└── outputs/routes/, alerts/, reports/
```

### 6.3 Data sources

**No raw dumps inside Comp-3.** Inputs come from Comp-1 (and Comp-2 via frontend):

| Role | Path |
|------|------|
| OSM roads / settlements | `component-1-danger-map/data/processed/osm_layers.gpkg` |
| Risk grid | `component-1-danger-map/handoff/risk_grid.parquet` |
| Feature grid | `component-1-danger-map/data/processed/feature_grid.parquet` |
| Elephant (live) | API body from frontend (Comp-2 frames) |

CRS: process in **EPSG:5234**; API I/O in **EPSG:4326**.

### 6.4 Processed artifacts (`data/processed/`)

| File | Approx size / count | Role |
|------|---------------------|------|
| `road_nodes.parquet` | ~299k nodes | Graph nodes |
| `road_edges.parquet` / `.geojson` | ~309k micro-edges | Routing edges |
| `road_segments.parquet` / `.geojson` | **55 358** ML segments (~400 m) | Model units |
| `road_graph.gpickle` | NetworkX MultiGraph | Dijkstra |
| `road_graph_meta.json` | Stats | Provenance |
| `segment_features_static.parquet` | 55 358 rows | Static feats + proxy `y` |
| `segment_dataset.parquet` | **695 358** rows | Colab training table |
| `segment_dataset_meta.json` | Label rules | Honesty |

Graph: 424 components; largest CC ~293k nodes / ~303k edges.

**Road build** (`build_road_graph.py`): load OSM roads → keep highway classes → snap vertices 5 m → micro-edges for routing → chop ways ≤ 400 m into ML segments (`S######`).

### 6.5 Labels (proxy — not accidents)

`y = 1` if Comp-1 `risk_mean` is high (≥ max(85th percentile among segments, floor 0.05)) **AND** any of: `human_exposure ≥ 0.20`, `dist_settlement_m ≤ 2000`, `forest_edge ≥ 0.2`, `frac_crop ≥ 0.12`.  
Dynamic nudge: elephant circle overlap + `risk_mean ≥ 0.02` → force `y = 1`.

Dataset: ~116k positives / ~695k rows (~16.7%).

### 6.6 Training (Colab)

Local scripts only **build data**; training is Colab (`docs/colab_notes.md`):

```text
build_road_graph.py → build_segment_dataset.py → [Colab XGB] → models/*.joblib
```

Suggested: `XGBClassifier(n_estimators=200, max_depth=5, learning_rate=0.08, …)` with `GroupKFold` on `spatial_fold`.

**19 features** (`models/feature_columns.json`):

```
length_m, risk_mean, risk_max, habitat_suitability, human_exposure,
frac_tree, frac_crop, frac_built, forest_edge,
dist_settlement_m, dist_water_m, dist_road_m, pop_density_approx, elevation_m,
highway_code, hour_of_day, diurnal_activity, elephant_dist_m, elephant_circle_overlap
```

**Augmentation:** hours `(6, 12, 18, 22)` × elephant distance bins `(200, 800, 2000, 5000)` m + midday/far baseline → 695k rows.

**Saved model:** `models/road_risk_model.joblib` (`XGBClassifier`, ~200 estimators).

Inference: attach Comp-1 nearest-cell features → dynamic hour/elephant → `predict_proba` → `segment_risk` → `safer_cost_m = length_m × (1 + 12 × segment_risk)`.

### 6.7 Outputs & colouring

| Output | Path / field |
|--------|----------------|
| Segment risk | `segment_risk`, `safer_cost_m` |
| Local roads GeoJSON | From API — `risk_class` risky/safe, colours `#c0392b` / `#1e8449` |
| Route comparison | `outputs/routes/comparison.json` + `.geojson` |
| Advice | `meta.advice` (headline, bullets, avoid_roads, nearby_places) |
| Alerts folder | `outputs/alerts/` reserved; soft alerts via advice today |

**Colour rules (proximity-first):** under uncertainty circle → always red; near path (~400 m) → tend red; fringe uses model ≥ 0.40; far buffer only extreme model ≥ 0.80.

### 6.8 API (Comp-3)

| Method | Path | Role |
|--------|------|------|
| GET | `/health` | ok, model_present, port 8002 |
| POST | `/api/v1/local_roads` | **Primary** — red/green roads near elephant |
| POST | `/api/v1/route` | Optional A→B shortest vs safer |

`local_roads` body: `elephant_lon/lat`, `elephant_radius_m`, `hour_of_day`, `buffer_m`, optional `path[]`, `max_features`.

### 6.9 Reproduce Comp-3

```powershell
cd c:\Sysconex\Ali\component-3-safe-roads
python src/build_road_graph.py
python src/build_segment_dataset.py
# Colab train → copy joblib + feature_columns.json into models/
python src/run_route.py
uvicorn api.main:app --reload --host 0.0.0.0 --port 8002
```

---

## 7. Component 4 — Path Guard

**Root:**  
`Component 4/R26-IT-136-IT22544636_Path_Guard/R26-IT-136-IT22544636_Path_Guard/`  
**Product name in code:** Gaja Saviya Path-Guard  
**Node API:** **5001** · **ML microservice:** **8004**

### 7.1 Purpose

Central hub for:

- Ingesting **threat events** (simulated sensors / Comp-2 elephant / user sightings)
- **ML verification** of crowdsourced sightings (trust score)
- **Risk-aware Dijkstra** (safe path vs shortest path)
- **Socket.io** live threat push + force-reroute for navigators

### 7.2 Layout

```
Path_Guard/
  backend/
    package.json          # start, dev, seed, simulate
    data/
      db.json             # JSON file DB
      anuradhapura_network.json
      current_sim_playback.json
    scripts/
      exportAnuradhapuraNetwork.py
      clearSimulatorData.js
    src/
      server.js
      config/   (fileDb, seed*)
      models/   (User, ThreatEvent, SightingReport, RoadNetwork)
      routes/   (threat, sighting, routing, user)
      services/ (dijkstra.js, sensorSimulator.js)
  ml-microservice/
    elephant_sightings_data.csv
    app/main.py
    app/train_model.py
    models/rf_trust_model.pkl   # expected after training
    requirements.txt
```

### 7.3 Backend (Node :5001)

| Item | Detail |
|------|--------|
| Entry | `backend/src/server.js` |
| Package | `gaja-saviya-backend` v2.0.0 |
| Storage | `backend/data/db.json` via `fileDb.js` |
| Collections | `users`, `threats`, `sightings`, `roads` |
| Env | `PORT` (5001), `ML_SERVICE_URL` (run_servers sets `:8004`) |

**Seed:** `npm run seed` — prefers `anuradhapura_network.json` if present; else built-in **Malabe** demo graph. Anuradhapura seed clears static demo threats (elephant comes from Comp-2 via API).

**Export from Comp-3 (main HEC flow):**  
`backend/scripts/exportAnuradhapuraNetwork.py` reads Comp-2 playback + Comp-3 `road_edges.geojson` → writes `anuradhapura_network.json`.

#### REST APIs

| Prefix | Endpoints |
|--------|-----------|
| `/` | Health/info |
| `/api/threats` | `POST /`, `GET /`, `GET /nearby`, `GET /:id`, `PATCH /:id/verify` |
| `/api/sightings` | `POST /` (→ ML), `GET /`, `GET /user/:userId` |
| `/api/routing` | `POST /sync-network`, `POST /safe-path`, `POST /shortest-path`, `GET /network` |
| `/api/users` | `POST /`, `GET /`, `GET /:id` |

Threat source tags used in penalties: `Sensor_C1_Fence`, `Sensor_C2_Acoustic`, `User_Reported`.

#### Socket.io events

| Event | Role |
|-------|------|
| `RegisterRoute` | Client stores active A→B for reroute |
| `RequestThreats` → `ThreatData` | Snapshot |
| `UpdatePosition` | GPS stub |
| `NewVerifiedThreat`, `ThreatStatusUpdate`, `force_reroute` | Live updates |

#### Risk / path cost model (`services/dijkstra.js`)

\[
W_{\text{total}} = W_{\text{distance}} + (I_{\text{threat}} \times \delta(t) \times \text{behavior} \times \text{proximity})
\]

- Base cost = road distance (metres)
- Threats within `radius_meters` penalize edges whose midpoint is near the threat
- Temporal decay \(\delta(t)\): half-life style, floor 0.1
- Example penalties: Acoustic 2000; Aggressive behavior ×2.5
- `calculateShortestPath` / `calculateSafestPath` / `checkRouteCollision`
- `POST /safe-path` snaps OD to nearest nodes (max snap **3500 m**); returns both routes + how many threats hit the shortest path

#### Main-page integration with Comp-1–3

1. `POST /api/routing/sync-network` with Comp-2 frames → `current_sim_playback.json` → export script → reseed → reload graph  
2. `POST /api/threats` with `Sensor_C2_Acoustic` at elephant estimate  
3. `POST /api/routing/safe-path` for user-picked A→B inside wander zone  

#### Simulation scripts

| Script | Role |
|--------|------|
| `npm run simulate` → `sensorSimulator.js` | Fake C1/C2 threats around Malabe/SLIIT ~every 45s |
| `sync-network` + export script | Rebuild Anuradhapura subgraph for current track |

### 7.4 ML microservice (:8004)

| Item | Detail |
|------|--------|
| App | `ml-microservice/app/main.py` |
| Train | `ml-microservice/app/train_model.py` |
| CSV present | `elephant_sightings_data.csv` (columns: `gps_proximity`, `user_reputation_score`, `hardware_sensor_sync`, `time_of_day_weight`, `label`) |
| Model file | `models/rf_trust_model.pkl` (may be missing → **MockModel** fallback) |

**Endpoints:** `GET /`, `/health`, `/model-info`; `POST /verify-sighting`.

**Features:** `gps_proximity`, `user_reputation_score`, `hardware_sensor_sync`, `time_of_day_weight`.  
**Decision:** probability > **0.75** → `Verified`, else `Pending`.

**Training (as coded in `train_model.py`):** 5000 **synthetic** samples, Random Forest (`n_estimators=100`, `max_depth=10`), 80/20 split, save with joblib. The CSV on disk can be used for experiments, but the training script currently synthesizes data.

If `rf_trust_model.pkl` is absent, `main.py` uses a heuristic **MockModel** (demo boost) so the service still runs.

---

## 8. Auth service

**Path:** `auth-service/`  
**Port:** **8005**  
**Purpose:** Gajasaviya Auth & Profile — register/login, OTP password reset, profile, Gmail HTML mail.

| Item | Detail |
|------|--------|
| Stack | FastAPI + SQLite + SMTP (Gmail) |
| DB file | `auth-service/data/gajasaviya_auth.db` |
| Password | SHA-256 with fixed salt (`db.py`) |
| Token | Opaque `token_<hex>` on login (not JWT) |
| Tables | `users`, `otp_codes` |

| Method | Path | Role |
|--------|------|------|
| GET | `/health` | status + db |
| POST | `/api/auth/register` | Create user + welcome email |
| POST | `/api/auth/login` | Auth + token + login email |
| POST | `/api/auth/forgot-password/request` | 6-digit OTP (15 min) |
| POST | `/api/auth/forgot-password/reset` | OTP + new password |
| GET/PUT | `/api/auth/profile/{email}` | Profile read/update |

**Note:** The Next.js frontend currently does **not** call :8005 in the main HEC map flow — auth is a separate service ready for accounts/profile.

---

## 9. Frontend (Next.js UI)

**Path:** `frontend/`  
**Port:** **3000**  
**Stack:** Next 15.1, React 19, Leaflet, Socket.io-client  
**Fonts:** Fraunces + Source Sans 3

### 9.1 Routes

| URL | File | Role |
|-----|------|------|
| `/` | `src/app/page.tsx` | Integrated Comp-1→4 demo |
| `/path-guard` | `src/app/path-guard/page.tsx` | Standalone Path Guard lab |

### 9.2 Key modules

| File | Role |
|------|------|
| `src/lib/api.ts` | Comp-1/2/3 HTTP clients |
| `src/lib/path-guard-api.ts` | Comp-4 API + ML health |
| `src/lib/comp4-wander.ts` | Wander-zone pick validation |
| `src/components/HecMap.tsx` | Main Leaflet map |
| `src/components/PathGuardMap.tsx` | Path Guard–only map |
| `src/app/globals.css` | Styles |

### 9.3 Environment defaults

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_COMP1_API` | `http://localhost:8003` |
| `NEXT_PUBLIC_COMP2_API` | `http://localhost:8001` |
| `NEXT_PUBLIC_COMP3_API` | `http://localhost:8002` |
| `NEXT_PUBLIC_COMP4_API` | `http://localhost:5001` |
| `NEXT_PUBLIC_COMP4_ML_API` | `http://localhost:8004` |

### 9.4 UI behaviour (home)

1. Health pills for Comp-1–4  
2. Comp-1 predict → risk cells + hotspot list + explanations  
3. Comp-2 simulate → playback (speed, show-true, uncertainty)  
4. Comp-3 local roads → red/green + click explanations + advice  
5. Comp-4 pick OD in teal wander zone → sync network → elephant threat → safe vs shortest routes  

---

## 10. How to run everything

### 10.1 One-time setup

```powershell
cd c:\Sysconex\Ali
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

cd "Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend"
npm install
```

Optional Anuradhapura Path Guard reseed:

```powershell
cd c:\Sysconex\Ali
.\.venv\Scripts\activate
python "Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend\scripts\exportAnuradhapuraNetwork.py"
cd "Component 4\R26-IT-136-IT22544636_Path_Guard\R26-IT-136-IT22544636_Path_Guard\backend"
npm run seed
```

### 10.2 Daily start

```powershell
cd c:\Sysconex\Ali
.\.venv\Scripts\activate
python run_servers.py

# separate terminal
cd c:\Sysconex\Ali\frontend
npm run dev
```

Then open **http://localhost:3000**.

### 10.3 Smoke-test URLs

| Check | URL |
|-------|-----|
| Comp-1 | http://localhost:8003/health · `/docs` |
| Comp-2 | http://localhost:8001/health · `/docs` |
| Comp-3 | http://localhost:8002/health · `/docs` |
| Comp-4 ML | http://localhost:8004/health |
| Comp-4 API | http://localhost:5001/ |
| Auth | http://localhost:8005/health |
| UI | http://localhost:3000 |

---

## 11. Honesty / limitations

State these openly (they are built into READMEs and API disclaimers):

- **No live Sri Lankan collars** — elephant path is simulated.
- **Movebank Kruger stats** drive Comp-2 movement parameters; African GPS tracks are **not** replayed on Sri Lanka.
- Comp-1 occurrences are **citizen science** (GBIF / iNaturalist) — spatial bias is documented (`phase3_occurrence_bias.md`).
- Comp-3 road labels are **research proxies**, not police/DWC incident tables.
- Road colours in the main demo are **proximity-first**; the corridor model mainly shapes fringe/far decisions.
- Comp-4 ML may run on a **MockModel** if `rf_trust_model.pkl` is missing.
- This does **not** replace the Department of Wildlife Conservation, electric fences, or official warnings.
- Do **not** develop in `_old_archive/`.

---

## 12. File & doc index

### Root

| Concern | Path |
|---------|------|
| Stack README | `README.md` |
| Agent / layout rules | `AGENTS.md`, `.cursor/rules/hec-source-of-truth.mdc` |
| Start all APIs | `run_servers.py` |
| Shared Python deps | `requirements.txt` |
| Plain-English idea | `HEC_Project_Simple_Explanation.md` |
| Four-component brief | `HEC_Topic_and_Components_Brief.md` |
| University proposal | `HEC_University_Project_Proposal.md` |
| Research-unit proposal | `HEC_Research_Unit_Proposal.md` |
| **This document** | `PROJECT_FULL_DOCUMENTATION.md` |

### Comp-1

| Concern | Path |
|---------|------|
| Overview | `component-1-danger-map/README.md` |
| Methods | `component-1-danger-map/docs/methods_note.md` |
| Data licences | `component-1-danger-map/docs/data-sources.md` |
| API contract | `component-1-danger-map/docs/FRONTEND_API.md` |
| Colab AN / PO | `docs/colab-notes.md`, `docs/colab_polonnaruwa.md` |
| Train notebook | `notebooks/phase4_train_risk_model.ipynb` |
| AN model | `outputs/xgb_habitat_model.joblib` |
| Handoff | `handoff/` |

### Comp-2

| Concern | Path |
|---------|------|
| Overview | `component-2-tracker/README.md` |
| Methods | `docs/methods_note.md` |
| Movebank citation | `docs/movebank_citation.md` |
| API | `docs/FRONTEND_API.md` |
| Fitted params | `data/processed/movement_params.json` |
| Playback | `outputs/tracks/playback.json` |

### Comp-3

| Concern | Path |
|---------|------|
| Overview | `component-3-safe-roads/README.md` |
| Methods | `docs/methods_note.md` |
| Colab train | `docs/colab_notes.md` |
| API | `docs/FRONTEND_API.md` |
| Model | `models/road_risk_model.joblib` |
| Features list | `models/feature_columns.json` |
| Dataset | `data/processed/segment_dataset.parquet` |

### Comp-4 / Auth / Frontend

| Concern | Path |
|---------|------|
| Path Guard server | `Component 4/.../backend/src/server.js` |
| Dijkstra | `.../backend/src/services/dijkstra.js` |
| ML verify | `.../ml-microservice/app/main.py` |
| ML train | `.../ml-microservice/app/train_model.py` |
| Sightings CSV | `.../ml-microservice/elephant_sightings_data.csv` |
| Auth API | `auth-service/api/main.py` |
| Auth DB helper | `auth-service/db.py` |
| Main UI | `frontend/src/app/page.tsx` |
| Comp-1–3 client | `frontend/src/lib/api.ts` |
| Comp-4 client | `frontend/src/lib/path-guard-api.ts` |

---

## Appendix A — Models cheat sheet

| Component | Algorithm | Artifact | Trained on | Outputs |
|-----------|-----------|----------|------------|---------|
| Comp-1 | XGBoost classifier | `xgb_habitat_model.joblib` (+ PO/pooled) | Presence/background cells (GBIF/iNat + open GIS) | Habitat P; risk = habitat × exposure × rain |
| Comp-2 | Stats fit + CV-EKF | `movement_params.json` (not a neural net) | Kruger Movebank GPS stats | Path, pings, EKF track, playback |
| Comp-3 | XGBoost classifier | `road_risk_model.joblib` | Proxy-labelled road segments + elephant/time aug | `segment_risk`, road colours, safer Dijkstra |
| Comp-4 ML | Random Forest | `rf_trust_model.pkl` (or MockModel) | Synthetic sighting features (CSV also present) | Trust score → Verified/Pending |
| Comp-4 routing | Dijkstra + threat penalties | In-memory graph from `db.json` / network JSON | N/A | Safe vs shortest paths |

## Appendix B — Quick “where is the data?” map

```
Open APIs / downloads
  → Comp-1 data/raw → data/processed → Colab Phase 4 → outputs + handoff
       ↓ disk
  Comp-2 reads Comp-1 grid + Movebank → movement_params → tracks/playback
       ↓ HTTP (frontend)
  Comp-3 reads Comp-1 OSM/risk + Comp-2 elephant → road colours / routes
       ↓ HTTP (frontend)
  Comp-4 syncs roads + elephant threat → safe path; sightings → ML :8004
       ↓
  Frontend :3000 shows the whole story
```

---

*End of full project documentation. For short overviews, start with `HEC_Project_Simple_Explanation.md` and `README.md`; for dissertation-style methods, use each component’s `docs/methods_note.md`.*
