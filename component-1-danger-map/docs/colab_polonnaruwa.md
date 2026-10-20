# Polonnaruwa Phase 4 — Colab training pack

## Goal

Retrain (or jointly train) the Comp-1 habitat model so **Polonnaruwa** is a first-class district — not transfer-only.

## What was prepared locally

Run (if not already):

```powershell
cd c:\Sysconex\Ali\component-1-danger-map
$env:HEC_DISTRICT = "polonnaruwa"
c:\Sysconex\Ali\.venv\Scripts\python.exe scripts\prepare_district_for_colab.py polonnaruwa
```

Outputs under `outputs/colab_packs/`:

| Zip | Use |
|-----|-----|
| **`colab_upload_phase4_pooled_an_polonnaruwa.zip`** | **Preferred** — train on Anuradhapura + Polonnaruwa |
| `colab_upload_phase4_polonnaruwa.zip` | Polonnaruwa-only training |

Each zip contains:

- `training_set.parquet`
- `feature_grid.parquet` (Polonnaruwa cells to score)
- `district_meta.json`
- (pooled zip) `feature_grid_anuradhapura.parquet` optional

## Colab steps

1. Runtime → GPU optional (CPU is fine).
2. Upload the **pooled** zip → unzip to `/content/`.
3. Upload notebook: `notebooks/phase4_train_risk_model.ipynb`  
   (works as-is; change markdown title to Polonnaruwa / pooled if you want).
4. Run all cells.
5. Download `phase4_outputs.zip`.

### Important for pooled training

- Train on the pooled `training_set.parquet` (has both districts).
- After fit, score **`feature_grid.parquet`** (Polonnaruwa) for PO risk map.
- Optionally also score `feature_grid_anuradhapura.parquet` with the same model.

If `GroupKFold` uses a spatial fold column, keep that. Adding `district` as a group is even better for pooled CV — optional edit in Colab:

```python
# if 'district' in train.columns:
#     groups = train['district'].astype(str) + '_' + train['spatial_block'].astype(str)
```

(Only if those columns exist; otherwise leave the notebook default.)

## Files to copy back to this PC

```
component-1-danger-map/outputs/polonnaruwa/
  xgb_habitat_model.joblib
  maps/risk_scores.parquet
  reports/spatial_cv_metrics.csv
  reports/phase4_summary.json
  reports/*.png
```

If pooled model should also replace Anuradhapura inference later:

```
outputs/xgb_habitat_model_pooled.joblib
```

## After you drop the files

Tell the agent — they will:

1. Register Polonnaruwa in `AVAILABLE_DISTRICTS`
2. Point climate / boundary / grid paths
3. Smoke-test `POST /api/v1/predict` with `district=Polonnaruwa`

## Honesty line (viva)

> Habitat suitability was (re)trained with public elephant presence/background labels including Polonnaruwa (and Anuradhapura for the pooled model). Risk = habitat × human exposure on a 500 m grid. Not a DWC official map.
