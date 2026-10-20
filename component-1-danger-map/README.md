# Component 1 — The Danger Map

**Goal:** Colour the land from low risk to high risk, where high risk means elephants are likely to be **and** people live or farm nearby — not just "there is forest."

**Output:** A district-scale heat map (GeoTIFF + web preview) where each grid cell has a risk score and a plain-English explanation (e.g. "farm + village + forest edge").

---

## Folder layout

```
component-1-danger-map/
├── README.md                 ← this file
├── docs/
│   └── data-sources.md       ← URLs, licences, download notes
├── data/
│   ├── raw/                  ← downloaded open datasets (gitignored)
│   └── processed/            ← clipped, reprojected layers for study area
├── notebooks/                ← exploratory analysis (optional)
├── src/                      ← Python scripts
├── outputs/
│   ├── maps/                 ← risk GeoTIFF, PNG previews
│   └── reports/              ← validation figures, factor importance
└── requirements.txt
```

---

## Step-by-step build plan

### Phase 0 — Setup (Day 1) — **DONE**

| Step | Task | Status |
|------|------|--------|
| 0.1 | Python venv + core packages | `.venv` created; full GIS stack optional until Phase 1 / Colab |
| 0.2 | Demo district | **Anuradhapura** → `data/processed/study_area.geojson` |
| 0.3 | Grid + CRS | **500 m**, projected **EPSG:5234**, geographic **EPSG:4326** (`src/config.py`) |

Model training (Phase 4) can run on **Google Colab** — see `docs/colab-notes.md`.

---

### Phase 1 — Collect open data (Week 1) — **DONE**

| Step | Dataset | Status |
|------|---------|--------|
| 1.1 | Elephant occurrences (GBIF + iNaturalist) | **1797** GBIF SL / **164** in district; **737** iNat bbox / **245** in district |
| 1.2 | ESA WorldCover 10 m | tiles `N06E078`, `N06E081` in `data/raw/worldcover/` |
| 1.3 | OSM roads, water, settlements, parks | Overpass JSON in `data/raw/osm/` |
| 1.4 | WorldPop population | `lka_ppp_2020_UNadj.tif` |
| 1.5 | NASA POWER climate | 9-point climatology JSON |
| 1.6 | Copernicus GLO-30 DEM | 6 tiles in `data/raw/dem/` |
| 1.7 | Protected areas | OSM parks (25 elements); official WDPA zip unavailable (DNS) |

Re-run: `python src/download_phase1.py` (or `--only gbif,inat,...`). Full log in `docs/data-sources.md`.  
**Next:** Phase 2 — clip rasters to the district and build the 500 m feature grid.
---

### Phase 2 — Build the feature grid (Week 2) — **DONE**

| Step | Feature | Status |
|------|---------|--------|
| 2.1 | Align CRS | All layers → **EPSG:5234** |
| 2.2 | Fishnet | **28 817** cells @ **500 m** |
| 2.3 | Land-cover fractions | tree / crop / built / water / shrub-grass |
| 2.4 | Distances | road, water, settlement (m) |
| 2.5 | Population | WorldPop sample + approx density |
| 2.6 | Terrain | elevation_m, slope_deg |
| 2.7 | Climate | temp_c, precip_mm (IDW from NASA POWER) |
| 2.8 | Protected | binary centroid-in-park |
| 2.9 | Forest edge | **9 665** cells (tree ≥20% and crop/built ≥10%) |

**Outputs:**
- `data/processed/feature_grid.parquet` (+ `.csv`)
- `data/processed/grid_cells.gpkg`
- clipped rasters: `dem_anuradhapura.tif`, `worldcover_anuradhapura.tif`, `worldpop_anuradhapura.tif`
- `data/processed/osm_layers.gpkg`

Re-run: `python src/convert_osm.py` then `python src/build_feature_grid.py`.  
**Next:** Phase 3 — presence vs background labels for model training.
---

### Phase 3 — Define presence vs background (Week 2–3) — **DONE**

| Step | Task | Status |
|------|------|--------|
| 3.1 | Snap GBIF + iNat to grid; dedupe cells | **409** records → **238** presence cells |
| 3.2 | Background sample | **2 380** cells (10×, seed=42) |
| 3.3 | Bias documented | `outputs/reports/phase3_occurrence_bias.md` |
| 3.4 | Labels | `presence=1` / `background=0` |

**Outputs:**
- `data/processed/training_set.parquet` (2 618 rows — ready for Colab / Phase 4)
- `data/processed/feature_grid_labeled.parquet` (all cells + presence flag)
- `data/processed/occurrences_snapped.csv`
- `data/processed/cell_labels.csv`

Re-run: `python src/label_presence_background.py`.  
**Next:** Phase 4 — train overlap risk model (Colab OK).
---

### Phase 4 — Train the overlap risk model (Week 3–4) — **DONE**

Colab training complete. Outputs filed locally:

| File | Location |
|------|----------|
| Model | `outputs/xgb_habitat_model.joblib` |
| Risk scores | `outputs/maps/risk_scores.parquet` (+ `.csv`) |
| Risk scatter | `outputs/maps/risk_scatter.png` |
| CV metrics / SHAP / importance | `outputs/reports/` |
| Colab run notebook | `notebooks/phase4_colab_run.ipynb` |

**Spatial CV:** mean AUC **0.838** (±0.042), OOF AUC **0.847**.  
Formula: `risk = habitat_suitability × human_exposure`.

**Next:** Phase 5 — plain-English explanations for high-risk cells.
---

### Phase 5 — Explain why a place is risky (Week 4) — **DONE**

| Step | Task | Status |
|------|------|--------|
| 5.1 | Global feature importance | `outputs/reports/global_importance_phase5.png` |
| 5.2 | Local notes + SHAP for top 50 cells | embedded in `risk_explanations.json` |
| 5.3 | Rule-style labels | e.g. “farm + village + forest edge” |
| 5.4 | Sidecar export | all **28 817** cells explained |

**Outputs:**
- `outputs/maps/risk_explanations.json`
- `outputs/maps/risk_with_explanations.parquet` (+ `.csv`)
- `outputs/reports/phase5_example_explanations.md`
- `outputs/reports/phase5_label_counts.csv`

Re-run: `python src/explain_risk.py`.  
**Next:** Phase 6 — GeoTIFF + static/web preview maps.

---

### Phase 6 — Produce map outputs (Week 4–5) — **DONE**

| Step | Output | Path |
|------|--------|------|
| 6.1 | Risk GeoTIFF | `outputs/maps/risk_surface.tif` |
| 6.2 | Static PNG + legend | `outputs/maps/risk_preview.png` |
| 6.3 | Folium web map | `outputs/maps/risk_map.html` |
| 6.4 | Vector grid | `outputs/maps/risk_cells.geojson` (+ `.gpkg`) |

Colour breaks: `outputs/reports/phase6_colour_breaks.md` (green → red).  
Open the web map in a browser: `outputs/maps/risk_map.html` (click red dots for “why”).

Re-run: `python src/build_risk_maps.py`.  
**Next:** Phase 7 — validation against literature / sanity checks.

---

### Phase 7 — Validate (Week 5) — **DONE (PASS)**

| Step | Result |
|------|--------|
| 7.1 Spatial CV | Mean AUC **0.841 ± 0.036**, mean TSS **0.595**, OOF AUC **0.850** |
| 7.2 Literature proxy | High-risk cells enriched for forest edge, cropland, nearer settlements |
| 7.3 Sanity | Farm/forest edge mean risk ≫ deep interior forest |
| 7.4 Sensitivity | Dropping population: Spearman **0.786**, top-10% Jaccard **0.659** |

**Report:** `outputs/reports/phase7_validation_report.md`  
Figures: `phase7_cv_bars.png`, `phase7_sanity_boxplot.png`, `phase7_sensitivity_scatter.png`

Re-run: `python src/validate_risk_map.py`.  
**Next:** Phase 8 — methods note + handoff package for Components 3–4.

---

### Phase 8 — Document & hand off (Week 5) — **DONE**

| Step | Deliverable |
|------|-------------|
| 8.1 Methods note | `docs/methods_note.md` |
| 8.2 Handoff pack | `handoff/` (parquet, GeoTIFF, GeoJSON, manifest, README) |
| 8.3 Pipeline scripts | `scripts/download_all.py`, `scripts/build_risk_map.py` |

Export / refresh handoff: `python src/export_handoff.py`.

**Component 1 complete** for the district demo. Use `handoff/` as the input to Components 3 and 4.

### Live demo app (panel)

```powershell
.\.venv\Scripts\activate
streamlit run app/streamlit_risk_demo.py
```

Select **Anuradhapura** → **Run risk model** → live map + explanations. Guide: `docs/demo_app.md`.

### Frontend handover (API)

```powershell
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs` · Contract: `docs/FRONTEND_API.md`.

### Run API (own venv)

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
.\.venv\Scripts\activate
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

**UI:** Next.js in `../frontend` (calls this API + Comp-2). See root `README.md`.

---

## What Component 1 does **not** do

- Does not track live elephants (that's Component 2).
- Does not route roads (Component 3).
- Does not host the browser UI (that's `../frontend`).
- Does not claim to replace the Wildlife Department.

---

## Suggested tech stack

| Layer | Tool |
|-------|------|
| Language | Python 3.10+ |
| Geospatial | GeoPandas, Rasterio, Rasterstats |
| ML | scikit-learn, XGBoost; SHAP for explanations |
| API | FastAPI on port 8000 |
| UI | Next.js in `../frontend` |
| Environment | Own `.venv` + `requirements.txt` |

---

## Success checklist (demo-ready)

- [x] One district clipped and all layers aligned (Anuradhapura, 500 m)
- [x] Feature grid built (28 817 cells)
- [x] Model trained with spatial CV (AUC ≈ 0.84)
- [x] Risk GeoTIFF exported
- [x] PNG map with legend + Folium HTML
- [x] Feature importance + plain-English “why” labels
- [x] Validation report (Phase 7 PASS)
- [x] Limitations stated + handoff pack for Components 3–4

---

## Reproduce

```powershell
python scripts/download_all.py
# Phase 4 on Colab — docs/colab-notes.md
python scripts/build_risk_map.py
```
