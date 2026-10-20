# Component 1 — Google Colab notes (Phase 4)

Use Colab for **Phase 4 model training** (XGBoost + spatial CV + SHAP). Keep this repo as the source of truth.

## Files to upload (only these two)

From your PC:

```
component-1-danger-map/data/processed/training_set.parquet
component-1-danger-map/data/processed/feature_grid.parquet
```

Optional helper (creates a small zip on your machine):

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
.\.venv\Scripts\python.exe src\pack_colab_upload.py
```

That writes `outputs/colab_upload_phase4.zip`.

## Notebook

Open in Colab (File → Upload notebook):

`notebooks/phase4_train_risk_model.ipynb`

Or: upload the `.ipynb` to Drive → open with Colab.

## Colab steps

1. Runtime → Run all (or run cells top to bottom).
2. First cell installs packages.
3. Upload the two parquet files when prompted / via the left **Files** panel into `/content/`.
4. Wait for CV + training + SHAP (~a few minutes on free GPU/CPU).
5. Download `phase4_outputs.zip` (last cell auto-downloads on Colab).

## What you get back

| File | Put it here locally |
|------|---------------------|
| `risk_scores.parquet` / `.csv` | `outputs/maps/` |
| `xgb_habitat_model.joblib` | `outputs/` |
| `spatial_cv_metrics.csv`, `phase4_summary.json` | `outputs/reports/` |
| `*.png` plots | `outputs/reports/` |

## Settings (must match `src/config.py`)

| Setting | Value |
|---------|--------|
| District | Anuradhapura |
| Grid | 500 m |
| Projected CRS | EPSG:5234 |
| Geographic CRS | EPSG:4326 |

## Model idea (for the report)

```
habitat_suitability = P(elephant presence | eco features)
human_exposure      = normalized cropland + built-up + population
risk_score          = habitat_suitability × human_exposure
```

So high risk is where elephants are likely **and** people/farms are present — not “forest exists.”
