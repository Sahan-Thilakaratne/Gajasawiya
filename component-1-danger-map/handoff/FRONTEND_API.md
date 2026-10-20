# Frontend handover — Component 1 (Danger Map API)

Give this file to the frontend developer. They only need to call these endpoints and render the response.

**Base URL (local):** `http://localhost:8000`  
**Interactive docs:** `http://localhost:8000/docs`

---

## How to start the API (backend person)

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
.\.venv\Scripts\activate
pip install fastapi uvicorn
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

CORS is open (`*`) for local frontend work.

---

## Recommended UI flow

1. `GET /api/v1/districts` → fill district dropdown  
2. User clicks **Run** → `POST /api/v1/predict` with `{ "district": "Anuradhapura" }`  
3. Draw map using:
   - `assets.risk_cells_geojson` (full coloured polygons), **or**
   - `top_cells[]` points (`lat`/`lon` + `risk_score` + popup text)
4. On polygon/point click → show `explanation` + `why`  
5. Optional: `GET /api/v1/cells/{cell_id}` for a single cell

---

## Endpoints

### Health
`GET /health`

```json
{ "status": "ok", "component": 1, "service": "danger-map" }
```

### List districts
`GET /api/v1/districts`

```json
{
  "default": "Anuradhapura",
  "risk_formula": "habitat_suitability * human_exposure",
  "districts": [
    { "id": "Anuradhapura", "ready": true, "grid_resolution_m": 500, "crs_geographic": "EPSG:4326" },
    { "id": "Polonnaruwa", "ready": false }
  ]
}
```

Only use districts with `"ready": true` for Run.

### Run live prediction (main call)
`POST /api/v1/predict`  
Content-Type: `application/json`

```json
{
  "district": "Anuradhapura",
  "top_n": 50,
  "min_risk": 0,
  "include_all_cells": false,
  "refresh": true
}
```

**Same thing via GET:**  
`GET /api/v1/predict/Anuradhapura?top_n=50&refresh=true`

**Response (shape):**

| Field | Use |
|-------|-----|
| `meta` | Stats (n_cells, max_risk, formula) |
| `bbox_wgs84` | Fit map camera |
| `top_cells[]` | Markers / hotspot list |
| `assets.*` | URLs for GeoJSON, boundary, PNG, raster |
| `n_cells_total` | Show in UI |

Each item in `top_cells`:

| Field | Type | UI use |
|-------|------|--------|
| `cell_id` | string | id |
| `lon`, `lat` | number | WGS84 marker |
| `risk_score` | 0–1 | colour intensity |
| `risk_score_0_100` | 0–100 | legend / label |
| `habitat_suitability` | 0–1 | optional detail |
| `human_exposure` | 0–1 | optional detail |
| `explanation` | string | short title e.g. "farm + forest edge" |
| `why` | string | popup body |
| `tags` | string | pipe-separated tags |
| `forest_edge` | 0/1 | optional badge |

Colour suggestion: green (low) → yellow → orange → red (high). See `/static/handoff/colour_breaks.md`.

### One cell
`GET /api/v1/cells/{cell_id}?district=Anuradhapura`

### Map layers (files)
| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/v1/boundary/{district}` | District polygon GeoJSON (WGS84) |
| GET | `/api/v1/risk-geojson/{district}` | Full risk grid GeoJSON (~20 MB) — properties include `risk_score`, `explanation` |
| GET | `/api/v1/risk-raster/{district}` | GeoTIFF (EPSG:5234) — optional if you use a raster tile pipeline |
| GET | `/api/v1/assets/{district}` | JSON list of asset URLs |

### Static copies
| URL | File |
|-----|------|
| `/static/handoff/risk_preview.png` | Static preview image |
| `/static/handoff/risk_explanations.json` | All cell explanations |
| `/static/handoff/manifest.json` | Schema + package info |
| `/static/handoff/methods_note.md` | Methods text |

---

## Example frontend calls

```javascript
// 1) districts
const d = await fetch('http://localhost:8000/api/v1/districts').then(r => r.json());

// 2) run model
const pred = await fetch('http://localhost:8000/api/v1/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ district: 'Anuradhapura', top_n: 50, refresh: true })
}).then(r => r.json());

// 3) full polygon layer (Mapbox/Leaflet/MapLibre)
const geojsonUrl = 'http://localhost:8000' + pred.assets.risk_cells_geojson;
// fetch(geojsonUrl) or set as source URL

// 4) hotspots
pred.top_cells.forEach(c => {
  // add marker at [c.lat, c.lon], popup = c.explanation + c.why
});
```

---

## Models / files (backend — frontend does not load these)

Frontend should **not** call the `.joblib` model directly. The API does that.

| Role | Path on disk |
|------|----------------|
| Trained XGBoost model | `outputs/xgb_habitat_model.joblib` |
| Feature grid | `data/processed/feature_grid.parquet` |
| District boundary | `data/processed/study_area.geojson` |
| Precomputed map pack | `handoff/` (GeoJSON, GeoTIFF, PNG, explanations) |

**Risk formula:** `risk_score = habitat_suitability × human_exposure`

---

## What frontend should / should not claim in the UI

**Do show:** “Research demo · open data · model prediction”  
**Do not show:** “Live DWC tracking” / “official warning”

---

## Perf tips

- Prefer `risk_cells_geojson` once + style by `risk_score`, and use `POST /predict` for “Run” summary + hotspots.
- Avoid `include_all_cells: true` unless you really need a giant JSON.
- GeoJSON is ~20 MB; cache it in the browser after first load.

---

## Contact / ownership

- **Backend / ML (Component 1):** this repo folder `component-1-danger-map`
- **API entrypoint:** `api/main.py`
- **Questions on fields:** `handoff/manifest.json`
