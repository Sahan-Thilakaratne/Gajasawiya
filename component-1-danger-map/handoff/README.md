# Component 1 → handoff pack

**District:** Anuradhapura · **Cells:** 28,817 × 500 m  
**Risk:** `habitat_suitability × human_exposure` (higher = more conflict-prone overlap)

## Quick start

| Consumer | Start with |
|----------|------------|
| **Component 3** (safe routing) | `risk_grid.parquet` or `risk_surface.tif` — raise travel cost through high `risk_score` cells |
| **Component 4** (UI) | Prefer the **REST API** — see `FRONTEND_API.md`. Or use `risk_cells.geojson` + `risk_explanations.json` as static files |

**API (recommended for frontend):** start backend with `uvicorn api.main:app --port 8000`, then follow `FRONTEND_API.md`.

Projected coordinates (`cx`, `cy`, GeoTIFF) use **EPSG:5234**. GeoJSON is **EPSG:4326**.

## Files

See `manifest.json` for the full list and field schema.

## Do not claim

This is a research prototype, not an official DWC warning feed.
