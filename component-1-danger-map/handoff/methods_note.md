# Component 1 — Methods note (Phase 8)

**Title:** Overlap-based human–elephant conflict (HEC) risk map for Anuradhapura District, Sri Lanka  
**Type:** Software-only, open-data prototype  
**Grid:** 500 m cells · **CRS:** EPSG:5234 (Sri Lanka Grid 1999) · **Geographic:** EPSG:4326

---

## 1. Aim

Build a **spatial risk surface** where high risk means elephants are *likely to be present* **and** people live or farm nearby — not merely “there is forest.” Each cell also gets a plain-English explanation (e.g. “farm + village + forest edge”).

This answers research question **RQ1** for the wider HEC early-warning project and hands a scored grid to Components 3 (safe routing) and 4 (UI).

---

## 2. Study area

| Item | Value |
|------|--------|
| District | Anuradhapura |
| Boundary | OSM Nominatim administrative polygon |
| Resolution | 500 m fishnet clipped to district |
| Cell count | 28 817 |

---

## 3. Data (all public)

| Layer | Source | Role |
|-------|--------|------|
| Elephant occurrences | GBIF + iNaturalist (*Elephas maximus*) | Presence labels |
| Land cover | ESA WorldCover 2021 (10 m) | Tree / crop / built / water fractions |
| Roads, water, settlements, parks | OpenStreetMap (Overpass) | Distances; protected-area flag |
| Population | WorldPop 2020 UN-adjusted | Human exposure |
| Climate | NASA POWER climatology | Temperature, precipitation (IDW) |
| Elevation | Copernicus GLO-30 DEM | Elevation, slope |

Licences and download paths: `docs/data-sources.md`.

**Training labels:** 409 occurrence records → **238** unique presence cells; **2 380** background cells (10×, seed 42). See `outputs/reports/phase3_occurrence_bias.md`.

---

## 4. Model

1. **Habitat suitability** — XGBoost binary classifier (`presence` vs `background`) on eco / landscape features (population-exposure product applied *after* prediction so people are not double-counted inside the habitat model).
2. **Spatial cross-validation** — GroupKFold on ~10 km blocks (`ix//20`, `iy//20`).
3. **Human exposure** — normalised mix of cropland, built-up, and population density.
4. **Overlap risk**  
   `risk_score = habitat_suitability × human_exposure`

**Held-out performance (Phase 7):** mean AUC **0.841 ± 0.036**; OOF AUC **0.850**; mean TSS (Youden) **0.595**.

Explanations: rule-based tags + local factors vs district medians (`src/explain_risk.py`). Global SHAP summary from Colab training is in `outputs/reports/shap_summary.png`.

---

## 5. Main outputs

| Product | Path |
|---------|------|
| Risk GeoTIFF | `outputs/maps/risk_surface.tif` |
| Cell table + explanations | `outputs/maps/risk_with_explanations.parquet` |
| Vector grid | `outputs/maps/risk_cells.geojson` / `.gpkg` |
| Web preview | `outputs/maps/risk_map.html` |
| Validation | `outputs/reports/phase7_validation_report.md` |
| **Handoff pack (Comp 3–4)** | `handoff/` |

---

## 6. Limitations (state in the dissertation)

1. **Citizen-science bias** — sightings cluster where people go; deep forest is under-sampled.
2. **No DWC collar / official incident GIS** — risk is a structural proxy, not named wild individuals.
3. **District demo** — not island-wide operational warning.
4. **Literature check is structural** — enrichment for forest–farm edges and nearer settlements, consistent with Fernando-style Dry Zone HEC narratives; not a digitised overlay of restricted coordinates.
5. **Class imbalance** — average precision is modest (~0.33); AUC/TSS are the primary ranking metrics.
6. **Not an official warning service** — research demonstration only.

---

## 7. Ethics / licence reminders

- OSM: ODbL — © OpenStreetMap contributors  
- GBIF: cite download / API use per GBIF terms  
- WorldCover: CC BY 4.0 · WorldPop: CC BY · NASA POWER: public domain · Copernicus DEM: cite as required  

No animals were handled; no field sensors were deployed.

---

## 8. Reproduce

```powershell
cd component-1-danger-map
.\.venv\Scripts\activate
python scripts/download_all.py      # Phase 0–1 data
python scripts/build_risk_map.py    # Phase 2–3, 5–8 locally
# Phase 4 (model training): Colab — see docs/colab-notes.md
```

After Colab, place `xgb_habitat_model.joblib` and `risk_scores.*` under `outputs/` (or re-run scoring locally if the model is present), then:

```powershell
python src/explain_risk.py
python src/build_risk_maps.py
python src/validate_risk_map.py
python src/export_handoff.py
```
