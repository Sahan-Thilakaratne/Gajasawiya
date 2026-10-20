# Component 3 — Safe-road finder

**Everyday name:** Don’t take the shortcut through the danger zone.

**API port:** **8002** · **District:** Anuradhapura

## What it does

1. **Predict** `segment_risk` with a trained XGBoost corridor model  
2. **Route** Dijkstra: shortest (length) vs safer (risk-weighted cost)  
3. Optional Comp-2 elephant circle / hour-of-day features  

## Run

```powershell
cd c:\Sysconex\Ali\component-3-safe-roads
.\.venv\Scripts\activate

# Offline demo route
python src\run_route.py

# API
uvicorn api.main:app --reload --host 0.0.0.0 --port 8002
```

Docs: `docs/FRONTEND_API.md` · Colab: `docs/colab_notes.md`

## Models

Put Colab exports in `models/`:

- `road_risk_model.joblib`
- `feature_columns.json`
