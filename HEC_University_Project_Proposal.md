# Integrated AI-Driven Human–Elephant Conflict (HEC) Mitigation System

**University-Feasible Software Architecture**  
**Target setting:** Rural Sri Lanka (HEC corridors)  
**Deployment philosophy:** 100% software / zero field hardware  
**Document purpose:** Complete explanation of the proposed project, components, data, novelties, and build plan  

---

## 1. Executive summary

This project is a **software-only early-warning and safe-routing system** for human–elephant conflict. It predicts where elephants are likely to be, estimates risk near villages and farms, and shows villagers **safer roads** around high-risk cells.

It is designed as a **university project**. That means:

- no Department of Wildlife Conservation (DWC) collar access letters
- no jungle microphones, camera traps, or IoT fences
- no training large CNNs from scratch
- datasets that can be **downloaded or generated** in a few days
- models that train on a laptop or Google Colab

The system still has a **research contribution per component**. The novelty is not “we invented a new neural network.” The novelty is a **reproducible pipeline** that:

1. maps conflict **proxies** from open geospatial data
2. **simulates** elephant movement when local GPS collars are unavailable
3. fills sparse “collar pings” with a mathematical filter
4. turns risk into **actionable navigation** on a real road network

---

## 2. Problem and why the original blueprint is too hard

Classic HEC systems use field hardware (infrared sensors, electric-fence monitors, camera traps). Those are expensive, vandalised, and hard to maintain. A software-only design is the right idea.

A typical “full research” version of this idea also assumes:

| Original assumption | University blocker |
|---|---|
| Live DWC satellite collars (1–2 hour pings) | Official data usually needs a formal academic request |
| Two-stage CNN on jungle audio | Elephant Listening Project is not a small labelled dataset; training is heavy |
| Official HEC incident GPS points | Not a reliable public download (often DWC-only) |
| Real perimeter audio streams | Contradicts zero-hardware unless someone already runs mics |

This proposal **keeps the same user-facing system** (predict → alert → reroute) and **replaces the data and models** with student-feasible ones.

---

## 3. Core system philosophy

**Zero field hardware.** The engine uses public GIS, climate APIs, citizen-science occurrences, one public African elephant GPS study (for movement statistics only), and **synthetic Sri Lankan trajectories**.

**Proactive warning.** The app does not wait for a villager to see an elephant. It shows a predicted location ellipse and a risk heatmap, then steers routes away from high-risk cells.

**Honest science.** The panel must be told clearly:

- GBIF / iNaturalist points are biased toward places people visit
- synthetic paths are not real Sri Lankan collared herds
- Kruger (South Africa) step-length statistics are a **movement proxy**, not local telemetry
- the demo uses a mock stream so evaluators see live icons without a satellite feed

Those limitations belong in the thesis. They do not cancel the engineering or methods contribution.

---

## 4. Overall architecture

Four parts, same as a full-stack product, with lighter internals.

```
EXTERNAL / GENERATED INPUTS
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ Open GIS & climate          │   │ Synthetic + public telemetry │
│ GBIF / iNaturalist          │   │ Kruger GPS (parameters only) │
│ WorldCover, OSM, WorldPop   │   │ Habitat-constrained CRW      │
│ NASA POWER, elevation       │   │ Subsampled 1-hour pings      │
└──────────────┬──────────────┘   └──────────────┬───────────────┘
               │                                 │
               v                                 v
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ COMPONENT 1                 │   │ COMPONENT 2                  │
│ Habitat–Human Overlap Risk  │   │ Sparse-Ping Motion Tracker   │
│ MaxEnt / XGBoost + SHAP     │   │ EKF on synthetic pings       │
│ Output: R_cell in [0, 1]    │   │ Output: location + ellipse   │
└──────────────┬──────────────┘   └──────────────┬───────────────┘
               │                                 │
               └──────────────┬──────────────────┘
                              v
               ┌──────────────────────────────────┐
               │ COMPONENT 3                      │
               │ Spatio-Temporal Safe Routing     │
               │ OSM graph + weighted Dijkstra    │
               │ Optional: time-of-day + ellipse  │
               └──────────────┬───────────────────┘
                              v
               ┌──────────────────────────────────┐
               │ API + WebSocket                  │
               │ REST routes, hazard tiles,       │
               │ geofence alerts                  │
               └──────────────┬───────────────────┘
                              v
               ┌──────────────────────────────────┐
               │ COMPONENT 4                      │
               │ Map UI (Leaflet / Streamlit;     │
               │ React Native optional)           │
               └──────────────────────────────────┘

OPTIONAL COMPONENT 1b (demo extra, not the thesis backbone)
YAMNet embeddings + small classifier on mixed elephant/ESC-50 audio
→ local S_acoustic boost around a simulated village
```

**Data flow in one sentence:** open maps score how dangerous a cell is; a simulated herd moves on that map; an EKF tracks it between sparse pings; Dijkstra avoids dangerous roads; the UI shows the result live.

---

## 5. Component 1 — Habitat–human overlap risk engine

### 5.1 Role

Replace the original **acoustic CNN**.  
There are no jungle microphones in a zero-hardware university build, so national risk must come from **geography**, not sound.

For every grid cell (recommended **1 km × 1 km**, or 500 m if machines allow), compute:

- \(S_{\text{elephant}}\): suitability for elephants (habitat)
- \(E_{\text{human}}\): human exposure (people, farms, villages)
- \(R_{\text{cell}} = S_{\text{elephant}} \times E_{\text{human}}\) (normalised to 0–1)

High forest in an empty park is **not** the same as forest-edge cropland next to a village. That distinction is the scientific point of this component.

### 5.2 What data to collect (all public)

| Dataset | Why you need it | How you get it |
|---|---|---|
| GBIF / iNaturalist `Elephas maximus` in Sri Lanka | Presence points (positive labels) | [gbif.org/occurrence/search](https://www.gbif.org/occurrence/search) |
| ESA WorldCover or similar land cover | Forest, cropland, built-up | Open raster download / GEE |
| Geofabrik OSM Sri Lanka | Roads, water, settlements | [geofabrik.de/asia/sri-lanka](https://download.geofabrik.de/asia/sri-lanka.html) |
| WorldPop | Population density | worldpop.org |
| NASA POWER | Rainfall, temperature (seasonal movement) | [power.larc.nasa.gov](https://power.larc.nasa.gov) |
| SRTM / OpenTopography | Elevation and slope | Open elevation APIs |
| WDPA protected areas | Inside vs outside parks | protectedplanet.net |
| Optional: tables from published HEC papers | District / DS-division death counts as **weak labels** | Digitise from papers (standard secondary data) |

You do **not** wait for DWC incident shapefiles.

### 5.3 Labels (how training works without official conflict GPS)

**Primary (easy):** species-distribution setup

- Presence = GBIF / iNaturalist points with coordinates
- Background = random points across Sri Lanka (or biased away from cities if you document it)

**Optional (stronger story):** weak HEC intensity

- Join district-level published counts to polygons
- Use as a second target or as a validation overlay (hotspots should fall on high \(R_{\text{cell}}\))

**Synthetic enrichment (allowed and useful):** if GBIF is sparse, generate extra presence-like points with a kernel that prefers **forest–crop edges**. Document this as *habitat-informed synthetic occurrences*, not as real sightings.

### 5.4 Model (small effort)

Do **not** train a CNN.

Use one of:

1. **Logistic regression / MaxEnt-style** model (ecology standard, CPU, minutes)
2. **XGBoost** on tabular features (still laptop-friendly)

Suggested features (about 8–12, not 200):

- distance to forest edge
- land-cover class (or % cropland / % forest in cell)
- population density
- distance to water
- distance to village / built-up
- elevation, slope
- recent / seasonal rainfall
- inside protected area (yes/no)

Output: \(R_{\text{cell}} \in [0, 1]\) as a GeoTIFF or a PostGIS raster.

### 5.5 Novelty

**Conflict as overlap, not as “elephant habitat” alone.**

Most student maps stop at “near forest.” This component argues that HEC risk is the **product of elephant suitability and human exposure**, and it **explains** each cell with SHAP (e.g. “risky because cropland + population + forest edge”).

That is a methods + interpretability contribution, not a hardware contribution.

### 5.6 How you evaluate Component 1

- Spatial cross-validation (do not randomly split neighbouring cells)
- AUC / PR-AUC on held-out GBIF points
- Qualitative check: high-risk belt should appear in known Dry Zone HEC regions (Anuradhapura, Polonnaruwa, etc.) from literature maps
- SHAP plots in the report

---

## 6. Component 2 — Habitat-constrained synthetic telemetry and EKF tracker

### 6.1 Role

Replace **live DWC collars**.  
The original problem is still valid: real collars ping only every **1–2 hours**, so software must estimate where the animal is **between pings**.

You cannot get Sri Lankan collars. You **can** generate a realistic enough trajectory, hide most of it, and prove the filter works.

### 6.2 Two data layers (do not mix them in the text)

**Layer A — movement physics (public, citable)**  
Use a published African elephant GPS dataset, for example:

- Slotow et al., *ThermochronTracking Elephants Kruger 2007*, Movebank Data Repository  
  https://datarepository.movebank.org/items/34c4e37d-9989-473e-aa5a-187e35205d85

From this, estimate only:

- step-length distribution
- turning-angle distribution
- typical daily range / speed

**Cite it. Never call it Sri Lankan DWC data.**

**Layer B — Sri Lankan scene (your simulation)**  
Place a simulated herd on Sri Lanka using:

- OSM water bodies (attraction)
- Component 1 habitat raster (bias steps toward high \(S_{\text{elephant}}\))
- built-up / high population (repulsion)

### 6.3 Simulator (`simulator.py`)

1. Start near a high-suitability cell (e.g. forest edge, not downtown Colombo).
2. Each time step (e.g. 5 simulated minutes): draw a correlated random walk (CRW) step, then **nudge** the heading toward water / habitat and away from dense settlement.
3. Store the **full 5-minute path** as ground truth (only you have this).
4. Emit a “collar ping” every 60 minutes: `{animal_id, lat, lng, timestamp}`.
5. For the live demo, play pings every 5 real seconds over a WebSocket so the map looks alive.

### 6.4 Model: Extended Kalman Filter (not a huge HMM)

State: \((x, y, v_x, v_y)\)

Between pings: predict motion.  
On ping: correct with GPS noise.

Library: **FilterPy**. This is undergraduate-accessible.

Optional upgrade (only if time): a simple particle filter. Skip Hidden Markov Models unless a supervisor insists; they add complexity without helping the demo.

Output each tick:

- predicted point
- uncertainty ellipse (geofence intersection uses this)

### 6.5 Novelty

**Domain-transferred, habitat-constrained synthetic telemetry** for HEC, plus EKF gap-filling **with known ground truth**.

Real collars never give you the true inter-ping path. Simulation does. That lets you report:

- metres of error vs hidden path at minute 15, 30, 45 after a ping
- ellipse coverage rate (does the true location sit inside the 95% ellipse?)

That evaluation is a genuine methods result.

### 6.6 How you evaluate Component 2

- RMSE / mean haversine error vs hidden trajectory
- ellipse calibration (coverage vs claimed 95%)
- ablation: CRW **without** habitat bias vs **with** habitat bias (does the path stay in plausible land cover?)

---

## 7. Component 3 — Spatio-temporal risk fusion and safe routing

### 7.1 Role

Central intelligence: fuse the risk map and the live ellipse, then **change the road network** so navigation avoids danger.

This is the component villagers actually feel.

### 7.2 Inputs

- \(R_{\text{cell}}\) from Component 1
- predicted location + ellipse from Component 2
- OSM roads for Sri Lanka (OSMnx / GeoPandas)
- optional: hour of day (dusk/dawn multiplier from literature)
- optional Component 1b: local acoustic score (demo only)

### 7.3 Graph and formula

Build \(G = (V, E)\):

- \(V\) = junctions
- \(E\) = road / path segments
- base weight \(d_{ij}\) = length in metres

Dynamic weight:

\[
W_{ij} = d_{ij}\,(1 + \alpha\, R_{\text{cell}})
\]

where \(\alpha\) is a hazard penalty (tune, e.g. 2–8).

If the EKF ellipse overlaps a road buffer, temporarily increase that edge further (uncertainty-aware routing).

Pathfinder: **weighted Dijkstra** or A* (NetworkX).  
Output: a polyline of safe-ish coordinates + a travel-time / extra-distance statistic.

### 7.4 Geofences

Draw village and paddy polygons from OSM.  
If the predicted ellipse intersects a polygon, fire an **emergency alert** on the WebSocket (banner + sound on the UI).

### 7.5 Novelty

**Closed-loop routing:** wildlife risk and **live location uncertainty** both rewrite OSM edge weights.

That is not “we ran Dijkstra on Google Maps.” The graph is **state-dependent**. A second cheap novelty is **time-varying \(\alpha\)** (higher at dusk/dawn) with no extra dataset.

A third, examiner-friendly extra: turn SHAP from Component 1 into a **route sentence** (“this path is 400 m longer because it avoids a high forest-edge crop belt”).

### 7.6 How you evaluate Component 3

- extra distance vs shortest path (safety vs convenience trade-off)
- fraction of route length that still sits in \(R_{\text{cell}} > 0.7\)
- case studies on 3–5 rural junctions (map figures in the report)
- show a reroute **before vs after** the ellipse enters a village buffer

---

## 8. Component 1b (optional) — Lightweight acoustic intent proxy

### 8.1 Role

Only if the panel expects an “AI audio” module.  
**Do not** make this the backbone. There is still no field mic.

Treat it as: *if a phone recording or a public clip arrives, classify rumble vs trumpet and locally boost risk.*

### 8.2 Easy data

- Small labelled elephant clips (rumble / roar / trumpet), e.g. student GitHub packs such as [Audio-Classification-for-Elephant-Sounds](https://github.com/HiruDewmi/Audio-Classification-for-Elephant-Sounds)
- [ESC-50](https://github.com/karolpiczak/ESC-50) rain, wind, insects, vehicles

**Your own dataset:** overlay elephant clips on ESC-50 at several signal-to-noise ratios. That mixing **is** a collectable synthetic dataset.

Do **not** download multi-gigabyte unlabelled Congo soundscape days unless you have spare months.

### 8.3 Model (minutes to train)

Frozen **YAMNet** (or similar) embeddings + logistic regression or a 1-layer MLP.

Map:

- social rumble → \(S_{acoustic} \approx 0.2\)
- trumpet / roar → \(S_{acoustic} \approx 0.8\)

Add a local bonus to \(R_{\text{cell}}\) only around the simulated sensor / village.

### 8.4 Novelty

**Domain-randomised mixing + pretrained embeddings** for an intent proxy (calm vs agonistic) under jungle-like noise — not a new CNN architecture.

---

## 9. Component 4 — User interface

### 9.1 Role

Show rural users (and examiners):

- live elephant marker
- uncertainty ellipse
- risk heatmap
- safe route vs shortest route
- geofence alert

### 9.2 Recommended stack for a university demo

**Preferred (fastest):** FastAPI + Leaflet (web) or Streamlit  
**Optional polish:** React Native + Mapbox / Leaflet

The original document demanded React Native. For marks, a **clear live web map** is enough. Native is extra.

### 9.3 Simulator contract

Every tick the backend broadcasts JSON, for example:

```json
{
  "animal_id": "sim-01",
  "pred_lat": 8.35,
  "pred_lng": 80.40,
  "ellipse": [[8.351, 80.401], "..."],
  "risk_version": 3,
  "route": [[8.12, 80.41], "..."],
  "alert": false
}
```

To the evaluator, it looks real-time. Underneath, it is historical/synthetic playback. That is the documented demo strategy.

---

## 10. Central API

| Piece | Choice | Purpose |
|---|---|---|
| HTTP | FastAPI | REST: risk tiles, route request, health |
| Live | WebSocket | pings, ellipse, alerts |
| Spatial DB | PostgreSQL + PostGIS (or GeoPackage files at first) | polygons, routes, logs |
| Graphs | NetworkX + OSMnx | Dijkstra |
| Maps | Leaflet / Mapbox | UI |

Keep three folders:

- `/habitat_service` — Component 1
- `/telemetry_service` — Component 2 + simulator
- `/routing_service` — Component 3
- `/app` — Component 4

---

## 11. What is novel vs what is engineering

Say this table in the thesis so examiners do not accuse you of overclaiming.

| Component | Engineering (expected) | Research novelty (claim this) |
|---|---|---|
| 1 | Download GIS, train XGBoost | HEC as **habitat × exposure**; SHAP explanations |
| 2 | FilterPy EKF, WebSocket sim | **Habitat-constrained synthetic telemetry** transferred from open Kruger GPS; EKF tested against hidden path |
| 3 | OSM + Dijkstra | **Closed-loop** edge weights from raster + live ellipse; optional time-of-day \(\alpha\) |
| 1b | YAMNet classifier | SNR-randomised mixing for intent proxy (optional) |
| 4 | Map UI | Product integration, not a research claim |

**Do not claim:** real-time Sri Lankan collar accuracy, a new deep architecture, or that synthetic elephants equal wild herds.

---

## 12. Dataset and ethics checklist

- Cite GBIF DOI for your download.
- Cite Movebank / Kruger DOI; follow their terms.
- OSM: ODbL attribution.
- Do not scrape private camera traps or unpaid DWC databases.
- Synthetic data must be labelled **synthetic** in every figure caption.
- If you digitise paper tables, cite the paper; do not present them as your field survey.

---

## 13. Implementation milestones (order)

1. **Data locker** — GBIF CSV, OSM extract, WorldPop, WorldCover, NASA POWER sample, Kruger GPS for stats only. Folder structure as above.
2. **Component 1** — feature stack, train small model, export `risk.tif`, SHAP plots.
3. **Component 2** — CRW simulator on Sri Lanka raster; subsample hourly pings; EKF; error plots vs hidden path.
4. **Component 3** — load OSM graph for one district first (not the whole island); implement \(W_{ij}\); compare shortest vs safe path.
5. **API + simulator** — WebSocket playback; Leaflet map; geofence banner.
6. **Optional 1b** — mix ESC-50 + elephant clips; YAMNet head; local risk boost.
7. **Report** — limitations, ethics, novelty table, demo script for the viva.

### Realistic effort

| Piece | Calendar time | Compute |
|---|---|---|
| Downloads | 1–2 days | none |
| Component 1 | ~1 week | CPU |
| Component 2 | ~1 week | CPU |
| Component 3 (one district) | ~1 week | CPU |
| UI + glue | ~1 week | CPU |
| Optional audio | 2–3 days | Colab CPU/GPU |

---

## 14. Live demonstration script (viva)

You do **not** need a live satellite.

1. Start `simulator.py`. A marker moves on the map.
2. Show the ellipse growing between “hourly” pings, then snapping when a ping arrives.
3. Show the heatmap from Component 1 (static layer).
4. Ask for a route from village A to B: shortest path (red) vs safe path (green).
5. Drive the simulated elephant toward a village polygon → alert.
6. If 1b is enabled, play a trumpet clip → local risk flash.

That is a complete end-to-end demo.

---

## 15. Recommended tech list (short)

| Layer | Technology |
|---|---|
| Language | Python 3 |
| API | FastAPI |
| Habitat ML | scikit-learn and/or XGBoost, SHAP |
| Motion | NumPy, FilterPy |
| GIS | GeoPandas, rasterio, Shapely, OSMnx |
| Graph | NetworkX |
| Optional audio | Librosa, TensorFlow Hub YAMNet |
| UI | Leaflet or Streamlit (React Native optional) |
| DB | GeoPackage first; PostGIS if time |

---

## 16. One-paragraph abstract (for proposals)

This project proposes a university-scale, software-only human–elephant conflict early-warning system for rural Sri Lanka. Instead of inaccessible DWC collars and field microphones, it learns a **habitat–human overlap risk surface** from open GIS and GBIF occurrences, generates **habitat-constrained synthetic trajectories** whose movement statistics are transferred from a public Kruger elephant GPS dataset, tracks sparse pings with an **Extended Kalman Filter** evaluated against hidden ground truth, and feeds both the risk raster and the live uncertainty ellipse into a **dynamically weighted OpenStreetMap graph** so Dijkstra returns safer village routes. An optional lightweight audio classifier using pretrained embeddings and noise-mixed clips can locally boost risk for demonstration. The contribution is a closed-loop, reproducible pipeline from open data to actionable navigation, with explicit limitations on synthetic movement and occurrence bias.

---

## 17. Bottom line

| Original blueprint | This proposal |
|---|---|
| 2-stage jungle CNN | Open GIS risk model + optional tiny YAMNet |
| DWC collars | Synthetic CRW + public Kruger parameters |
| Official HEC GPS | GBIF + exposure rasters + paper tables |
| Island-scale production app | One-district demo + honest limitations |
| Hard to finish | Finishable in a semester with novelties intact |

The product story stays: **predict elephant presence, warn people, reroute them.**  
The research story becomes something you can actually defend.
