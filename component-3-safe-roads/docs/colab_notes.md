# Component 3 — Colab training notes

## What you train

**Target `y`:** 1 = conflict-exposed road corridor (proxy label).  
**Prediction at inference:** `segment_risk = predict_proba(X)[:, 1]` ∈ [0, 1].

Upload: `component-3-safe-roads/data/processed/segment_dataset.parquet`  
Meta: `segment_dataset_meta.json` (feature list + honesty).

## Suggested Colab cell outline

```python
import json
import joblib
import pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score, classification_report
from sklearn.model_selection import GroupKFold
from xgboost import XGBClassifier

df = pd.read_parquet("segment_dataset.parquet")
meta = json.load(open("segment_dataset_meta.json"))
feats = meta["feature_columns"]
X = df[feats].fillna(0)
y = df["y"].astype(int)
groups = df["spatial_fold"].fillna(-1)

# one hold-out fold for a quick AUC (or full GroupKFold)
gkf = GroupKFold(n_splits=5)
train_idx, test_idx = next(gkf.split(X, y, groups))
model = XGBClassifier(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.08,
    subsample=0.9,
    colsample_bytree=0.9,
    eval_metric="logloss",
    random_state=42,
)
model.fit(X.iloc[train_idx], y.iloc[train_idx])
proba = model.predict_proba(X.iloc[test_idx])[:, 1]
print("AUC", roc_auc_score(y.iloc[test_idx], proba))
print("AP ", average_precision_score(y.iloc[test_idx], proba))
print(classification_report(y.iloc[test_idx], (proba >= 0.5).astype(int)))

joblib.dump(model, "road_risk_model.joblib")
json.dump(feats, open("feature_columns.json", "w"), indent=2)
```

Download both files into `component-3-safe-roads/models/`.

## Honesty (say this in the viva)

- Labels are **proxies** from Comp-1 risk × people/farm edge (+ synthetic elephant proximity), **not** police/DWC crash tables.
- Dynamic columns (`hour_of_day`, `elephant_dist_m`, …) let the score change in the live demo.
- Dijkstra only **uses** `segment_risk`; it is not the trained model.

## After Colab

Local next steps: `predict` helper + `run_route.py` + API `:8002`.
