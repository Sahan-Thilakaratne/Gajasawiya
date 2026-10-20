# Component 2 — Frontend API

**Base URL:** `http://localhost:8001`  
**Docs:** `http://localhost:8001/docs`

```powershell
cd c:\Sysconex\Ali\component-2-tracker
.\.venv\Scripts\activate
uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/api/v1/simulate` | `{ "start_cell_id": "C0151_0130" }` → full playback |
| GET | `/api/v1/playback` | Last saved playback |
| GET | `/api/v1/metrics` | Error / calibration summary |
| GET | `/api/v1/frame/{step}` | Single frame |

## Playback shape

Frames include EPSG:5234 `x_*`/`y_*` **and** WGS84 `lon_*`/`lat_*` for Leaflet.

`uncertainty_radius_m`, `error_m`, `alert`, `ping_update`, `t_hours`

Always show the disclaimer: **simulated path**, not live DWC.
