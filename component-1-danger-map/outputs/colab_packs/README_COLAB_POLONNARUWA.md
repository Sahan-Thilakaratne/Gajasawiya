# Colab upload — Polonnaruwa

## Recommended (stronger research claim)

Upload: `colab_upload_phase4_pooled_an_polonnaruwa.zip`

1. Unzip into `/content/`
2. Open `notebooks/phase4_train_risk_model.ipynb` (or the PO notebook)
3. Train on pooled `training_set.parquet`
4. Score `feature_grid.parquet` (Polonnaruwa)
5. Download `phase4_outputs.zip`

## District-only (also OK)

Upload: `colab_upload_phase4_polonnaruwa.zip`

## What to return to the local project

Put these under `component-1-danger-map/`:

| File from Colab | Local path |
|-----------------|------------|
| `xgb_habitat_model.joblib` | `outputs/polonnaruwa/xgb_habitat_model.joblib` |
| `risk_scores.parquet` | `outputs/polonnaruwa/maps/risk_scores.parquet` |
| `spatial_cv_metrics.csv` | `outputs/polonnaruwa/reports/spatial_cv_metrics.csv` |
| `phase4_summary.json` | `outputs/polonnaruwa/reports/phase4_summary.json` |
| plots `*.png` | `outputs/polonnaruwa/reports/` |

If you trained a **pooled** model intended for both districts, also copy:

`outputs/xgb_habitat_model_pooled.joblib`

Then tell the agent — API registration will be finished locally.
