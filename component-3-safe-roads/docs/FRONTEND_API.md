# Component 3 — Frontend API

**Base URL:** `http://localhost:8002`  
**Docs:** `http://localhost:8002/docs`

```powershell
cd c:\Sysconex\Ali\component-3-safe-roads
.\.venv\Scripts\activate
uvicorn api.main:app --reload --host 0.0.0.0 --port 8002
```

## Primary: local roads near elephant

`POST /api/v1/local_roads`

```json
{
  "elephant_lon": 80.40,
  "elephant_lat": 8.35,
  "elephant_radius_m": 800,
  "hour_of_day": 18,
  "buffer_m": 1200,
  "path": [{ "lon": 80.40, "lat": 8.35 }]
}
```

Returns a GeoJSON `FeatureCollection`. Colouring is **proximity-first**:

- **Red** — under the uncertainty circle, within ~400 m of the recent path, or extreme land risk farther out  
- **Green** — farther from the animal unless land risk is extreme  

Each feature: `risk_class`, `color`, `segment_risk` (model), `display_reason`, `elephant_dist_m`, `path_dist_m`, plus:

- `explanation` — click-a-road panel payload (`title`, `risk_category`, `summary[]`, `factors[]`, honesty note). Rule-based from Comp-1/2/3 inputs — not SHAP.

## Advice text

`meta.advice` includes:

- `headline` — e.g. avoid roads between place A and B  
- `bullets` — named roads to avoid, places not to linger, land-risk reason  
- `avoid_roads` / `nearby_places` — structured lists  

## Optional: A→B routing

`POST /api/v1/route` — shortest vs safer (still available; not the main demo UI).
