# Live Streamlit demo — Component 1

## What it is

Select a district → **Run risk model** → the saved XGBoost model scores every 500 m cell and the map updates.

- **Working district:** Anuradhapura  
- **Others:** listed as coming soon (need their own feature grids)

## What you do (once)

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
.\.venv\Scripts\activate
pip install streamlit streamlit-folium
streamlit run app/streamlit_risk_demo.py
```

Browser opens (usually http://localhost:8501).

1. Leave district = **Anuradhapura**
2. Click **Run risk model**
3. Wait a few seconds — map + top-risk explanations appear
4. Click red dots for “why this cell is risky”

## For the panel

- This is **live inference** (prediction), not re-training.
- Training data = open GBIF/iNaturalist + GIS layers (see `docs/methods_note.md`).
- Not live wild elephant GPS.

## Requirements already on disk

- `outputs/xgb_habitat_model.joblib`
- `data/processed/feature_grid.parquet`
- `data/processed/study_area.geojson`
