# Component 3 — Build plan

## Goal

Train a **road-segment conflict-exposure model**, then use its predictions as live edge costs for **shortest vs safer** routing (+ village alerts).

```
OSM roads → graph → segment rows → Colab train → model.joblib
                                              ↓
                         live features → predict segment_risk → Dijkstra
```

---

## What the model predicts

| Name | Meaning |
|------|---------|
| **`segment_risk` ∈ [0, 1]** | `P(this road corridor is conflict-exposed \| features)` |

Used as: `edge_cost = length_m × (1 + λ × segment_risk)`.

**Not** predicted: the path geometry itself (that’s Dijkstra).

---

## Phase 0 — Setup

| # | Task | Status |
|---|------|--------|
| 0.1 | Folder scaffold | done |
| 0.2 | Own `.venv` + requirements | done |
| 0.3 | `src/config.py` paths + label thresholds + λ | done |
| 0.4 | Port **8002** in root README | done |

---

## Phase 1 — Road network

| # | Task | Status |
|---|------|--------|
| 1.1 | Load Comp-1 `osm_layers.gpkg` roads → EPSG:5234 | done |
| 1.2 | Filter highway classes | done |
| 1.3 | NetworkX graph (vertex chain micro-edges) | done (~293k nodes in largest CC) |
| 1.4 | Chop ~400 m ML segments | done (`road_segments.parquet`) |
| 1.5 | Save graph + parquet + meta | done |

---

## Phase 2 — Dataset for Colab

| # | Task | Status |
|---|------|--------|
| 2.1–2.5 | Features + proxy labels + augmentation | done → `segment_dataset.parquet` |
| 2.6 | Spatial fold column `spatial_fold` | done |

---

## Phase 3 — Train on Colab

| # | Task |
|---|------|
| 3.1 | Upload parquet; XGBoost or sklearn GBDT classifier |
| 3.2 | Report AUC / PR; feature importance |
| 3.3 | Export `models/road_risk_model.joblib` + `feature_columns.json` |
| 3.4 | Document honesty in `docs/colab_notes.md` |

---

## Phase 4 — Inference + routing

| # | Task |
|---|------|
| 4.1 | `predict_segment_risk(features_now)` including hour / Comp-2 circle |
| 4.2 | Shortest = Dijkstra(`length_m`); safer = Dijkstra(risk cost) |
| 4.3 | Metrics: length, mean predicted risk, detour ratio, % high-risk length |
| 4.4 | CLI `run_route.py` + GeoJSON outputs |

---

## Phase 5 — Alerts + API + frontend

| # | Task |
|---|------|
| 5.1 | Settlement ∩ Comp-2 circle → alerts |
| 5.2 | FastAPI `:8002` — `POST /api/v1/route` |
| 5.3 | Wire Next.js two polylines + alert banner |

---

## Phase 6 — Validation & viva

| # | Task |
|---|------|
| 6.1 | Safer route lower mean `segment_risk` than shortest on demo ODs |
| 6.2 | `docs/methods_note.md` limits |
| 6.3 | Demo script: change hour / elephant → scores & route update |

---

## Suggested order

1. venv + config  
2. `build_road_graph.py`  
3. `build_segment_dataset.py`  
4. Colab train  
5. routing + API  
6. frontend  

---

## Success checklist

- [ ] Road graph connected enough for demo OD
- [ ] Dataset with clear `y` definition
- [ ] Trained model with AUC reported
- [ ] Shortest ≠ safer on at least one OD
- [ ] Safer has lower predicted exposure
- [ ] API + map draw both routes
- [ ] Honesty lines stated
