# RESEARCH PROPOSAL

**Title**  
An Open-Data, Software-Only Early Warning and Safe-Routing Framework for Human–Elephant Conflict in Rural Sri Lanka

**Short title**  
HEC Early Warning and Safe Routing System

**Type of study**  
Applied research / computational prototype (no field instrumentation)

**Thematic area**  
Conservation informatics, geospatial artificial intelligence, disaster early warning

**Study setting**  
Rural Sri Lanka (human–elephant conflict corridors); demonstration at district scale

**Mode of work**  
100% software. No collaring of animals, no jungle sensors, no camera traps.

---

**Submitted to:** Research Unit  
**Faculty / Department:** *[to be filled]*  
**Degree / programme:** *[to be filled]*  
**Student investigator(s):** *[to be filled]*  
**Supervisor(s):** *[to be filled]*  
**Proposed duration:** One academic year (approximately 8–10 months of project work)  
**Date of submission:** August 2026

---

## 1. Abstract

Human–elephant conflict (HEC) remains a serious conservation and public-safety problem in Sri Lanka. Rural communities often receive warning only after an elephant is already in a village or crop field. Hardware-based solutions (camera traps, infrared sensors, fence monitors) are costly, hard to maintain, and difficult for a university team to deploy.

This project proposes a **software-only early-warning and safe-routing framework** that can be built from **open datasets** and **controlled simulation**. The system has four parts: (1) a spatial risk map of where elephant habitat and human presence overlap; (2) a movement tracker that estimates an animal’s location between sparse GPS-style updates, tested on habitat-informed synthetic trajectories; (3) a road-network planner that prefers safer paths over merely shorter ones; and (4) a map interface that shows risk, predicted location, alerts, and alternative routes.

The research contribution is not a new large neural network, nor a claim to replace the Department of Wildlife Conservation. The contribution is a **reproducible, closed-loop method**: open geospatial risk → sparse-location estimation → dynamic routing that communities could use. The work is feasible for students, ethically limited to public data and simulation, and designed to be demonstrated end-to-end to the research unit.

**Keywords:** human–elephant conflict; early warning; species distribution modelling; movement filtering; safe routing; open geospatial data; Sri Lanka

---

## 2. Background and justification

Sri Lanka has one of the highest rates of human death from elephants among Asian elephant range countries. Conflict is concentrated where forest, farmland, and settlements meet, especially in Dry Zone landscapes. Current community warning is often reactive: a sighting, a social-media message, or damage that has already occurred.

Electric fences and field sensors have a role, but they do not scale easily for a student research prototype. Official GPS collar data and official incident coordinates are also typically restricted. A research unit therefore faces a practical question:

> Can a useful HEC early-warning concept be designed, tested, and demonstrated **without** field hardware and **without** confidential government telemetry?

This proposal answers yes, if the problem is framed correctly. We do not claim to track every wild elephant in Sri Lanka in real time. We claim to design a **method and prototype** that:

- maps **conflict-prone land** from public information
- shows how **rare location updates** (as real collars would send) can still support a live estimate
- converts that estimate into **action**: village alerts and safer roads

That framing is suitable for undergraduate or postgraduate applied research: scientifically modest, socially relevant, and technically complete.

---

## 3. Problem statement

People in HEC areas lack a timely, map-based picture of risk. Existing research often stops at a static hotspot map, or assumes data (collars, microphones, official GPS incidents) that university students cannot obtain. There is a gap between **academic habitat maps** and **something a villager could act on** (an alert and an alternative path).

The problem this study addresses is:

**How can open geospatial data and transparent simulation be combined into a software-only system that estimates HEC risk, interpolates sparse animal locations, and recommends safer local routes?**

---

## 4. Research gap

| Common approach | Limitation for this research setting |
|---|---|
| IoT sensors and camera traps | Cost, vandalism, maintenance, ethics, and field access |
| Official DWC collar / incident databases | Usually not openly downloadable for a student project |
| Deep audio models on jungle recordings | Need field microphones and large labelled sound archives |
| Static GIS hotspot maps | Rarely connected to live location uncertainty or road choice |

**Gap:** a student-feasible, software-only pipeline that links **overlap-based risk**, **sparse-ping tracking**, and **dynamic safe routing**, with honest use of open data and synthetic movement.

---

## 5. Aim and objectives

### 5.1 Aim

To design, implement, and evaluate a software-only prototype that estimates human–elephant conflict risk from open data, tracks simulated sparse wildlife locations, and generates safer village-to-town routes and geofence alerts for a Sri Lankan study area.

### 5.2 Specific objectives

1. **Build a spatial risk surface** in which conflict likelihood is treated as the overlap of elephant habitat suitability and human exposure, using publicly available occurrence and GIS layers.
2. **Develop a habitat-constrained movement simulator** whose step statistics are transferred from a published open elephant GPS study, then relocated onto Sri Lankan geography.
3. **Implement a sparse-update tracker** (Extended Kalman Filter) that estimates location and uncertainty between hourly-style pings, and measure error against the hidden simulated path.
4. **Construct a dynamic road graph** in which high-risk cells and location uncertainty increase travel cost, and compare safer routes with ordinary shortest paths.
5. **Integrate the parts** in a map demonstration (risk layer, moving estimate, village alert, two routes) suitable for research-unit review.

An optional sixth objective, only if time allows: a small pretrained-audio classifier (calm rumble vs trumpet) mixed with environmental noise, used only as a local demonstration boost, not as the national risk map.

---

## 6. Research questions

**RQ1.** Can open occurrence records and public land-use, population, and climate layers produce a spatially coherent HEC **proxy** risk map for a Sri Lankan district?

**RQ2.** How accurately can a simple motion filter recover a hidden path when it is shown only hourly pings from a habitat-informed synthetic trajectory?

**RQ3.** Does weighting roads by that risk (and by the tracker’s uncertainty) reduce travel through high-risk cells, and at what extra distance?

**RQ4.** Can the three models be coupled in one prototype that a non-specialist can interpret in a live demonstration?

---

## 7. Scope

**In scope**

- One (or few) rural district(s) as the operational demo, not necessarily the entire island at fine resolution
- Open data listed in Section 9
- Synthetic elephant movement clearly labelled as synthetic
- Software prototype: risk map, tracker, router, web map
- Quantitative tests on simulation and map validation against literature hotspot regions

**Out of scope**

- Capturing, collaring, or approaching wild elephants
- Deploying sensors on private or forest land
- Claiming operational replacement of DWC systems
- Training large custom deep networks from unlabelled multi-day soundscapes
- Real-time accuracy for named wild individuals in Sri Lanka

---

## 8. Proposed approach (overview)

The prototype is a chain, not four disconnected student mini-projects.

```
Open maps + public elephant sightings     Public movement statistics
        |                                         |
        v                                         v
  Risk map of land                          Simulated journey on
  (habitat × people)                        Sri Lankan geography
        |                                         |
        |                                   Hourly “collar” pings
        |                                         |
        |                                   Location + uncertainty
        |                                         |
        +------------------+----------------------+
                           v
                 Safer roads + village alerts
                           v
                      Map demonstration
```

**Component 1 — Overlap risk map**  
Conflict is not “forest exists.” Conflict is more likely where land that suits elephants also has people, crops, and settlements. A small statistical model (species-distribution / gradient boosting style) scores each grid cell. Explanations (which factors made a cell risky) will be reported.

**Component 2 — Sparse location tracker**  
Real collars send infrequent points to save battery. The project recreates that constraint. A realistic path is generated; most of it is hidden; a filter estimates the in-between position and draws an uncertainty region. Because the true path is known, tracking quality can be measured. Movement speed and turning habits are taken only from a **cited public** African elephant GPS archive, then applied on Sri Lankan water, forest, and towns. This is a transfer of *movement statistics*, not a claim of local collar data.

**Component 3 — Safe routing**  
Public road data are turned into a network. Roads crossing high-risk cells, or sitting under the uncertainty region, become less attractive. The system returns a safer path and can raise an alert if the uncertainty region intersects a village or paddy polygon.

**Component 4 — Interface**  
A map shows the coloured risk, the estimated animal, the uncertainty region, the shortest path versus the safer path, and alerts. Playback of the simulated journey makes the demo appear live. This playback will be disclosed to examiners.

**Optional audio module**  
A lightweight classifier on mixed public clips may illustrate “calm versus agitated call.” It will not be presented as field listening.

---

## 9. Data sources

All primary inputs are public or generated by the team.

| Purpose | Source | Nature |
|---|---|---|
| Elephant presence | GBIF / iNaturalist (`Elephas maximus`, Sri Lanka) | Citizen-science occurrences |
| Land cover | ESA WorldCover or equivalent | Forest, cropland, built-up |
| Roads, water, settlements | OpenStreetMap (Geofabrik Sri Lanka) | Vector map |
| Human exposure | WorldPop | Population density |
| Climate | NASA POWER | Rainfall, temperature |
| Terrain | SRTM / open elevation | Height, slope |
| Protected areas | WDPA | Inside / outside parks |
| Movement statistics only | Published Kruger elephant GPS (Movebank Data Repository, with citation and licence) | Step length, turning, speed |
| Synthetic paths | Generated by this project | Habitat-constrained random walk |
| Optional weak HEC intensity | Published district/DS-division tables in the literature | Secondary data, fully cited |
| Optional audio | Small public rumble/trumpet clips + ESC-50 environmental sounds | Mixed synthetic recordings |

No restricted DWC collar file is required to complete the study.

---

## 10. Evaluation plan

The research unit should expect **measurable** results, not only screenshots.

**Risk map (RQ1)**  
- Spatial cross-validation of presence versus background  
- Visual agreement with HEC regions described in published Sri Lankan studies  
- Factor importance / explanation plots (why a cell is high risk)

**Tracker (RQ2)**  
- Distance error between estimated point and hidden true location at 15, 30, 45 minutes after a ping  
- Whether the true location falls inside the stated uncertainty region (calibration)

**Routing (RQ3)**  
- Extra travel distance of the safer path versus the shortest path  
- Share of the route that still crosses high-risk cells  
- Before/after case when the uncertainty region enters a village buffer

**Integration (RQ4)**  
- A scripted demonstration: moving estimate, alert, two routes, one-sentence explanation of the detour

---

## 11. Expected contribution to knowledge

This is applied research. The claims will be kept proportionate.

1. **Conceptual:** HEC early warning as **habitat–human overlap + sparse tracking + actionable routing**, rather than a static GIS poster or a hardware network.
2. **Methodological:** a transparent recipe for **habitat-constrained synthetic telemetry** when local collars are unavailable, with filter error measured against hidden ground truth.
3. **Practical:** a district-scale prototype that research reviewers can operate in a demonstration.
4. **Honesty as contribution:** a documented limitation set (occurrence bias, transferred movement statistics, simulated playback). In conservation informatics, overclaiming is a greater risk than modest methods.

The project does **not** claim a new state-of-the-art deep learning architecture.

---

## 12. Significance

**Social.** A longer warning window and a safer path can reduce exposure on forest-edge roads, even if the first version is only a prototype.

**Institutional.** The university can supervise a complete, ethical computational study on a nationally important topic without waiting for restricted datasets.

**Academic.** The work sits at the junction of ecology (suitability and exposure), signal estimation (sparse tracking), and spatial planning (routing). That interdisciplinary framing is appropriate for a research unit.

**Future work.** If DWC later grants collar or incident data, the same pipeline can replace the synthetic layer. The architecture is designed for that substitution.

---

## 13. Ethical considerations

| Issue | Position of this study |
|---|---|
| Animal handling | None. No capture, collaring, playback in the wild, or approach. |
| Human participants | No village survey is required for the core prototype. If a later usability test is added, a separate ethics amendment will be filed. |
| Data | Public licences will be followed (GBIF, OSM ODbL, Movebank terms). Downloads will be cited (including GBIF DOI). |
| Misrepresentation | Synthetic tracks and demo playback will be labelled in every figure and in the viva. |
| Safety | The prototype is not an authorised public warning service. Any public communication will state that it is a research demonstration. |
| Conservation sensitivity | Fine-scale poaching-relevant locations will not be published if a dataset is judged sensitive; the default inputs are already public occurrences. |

This study is expected to fall under **low-risk computational research** using secondary and simulated data. Formal clearance is requested on that basis.

---

## 14. Work plan

| Phase | Months | Deliverable |
|---|---|---|
| 1. Literature, ethics, data locker | 1 | Proposal approval; organised open datasets |
| 2. Overlap risk model | 2 | District risk surface and validation figures |
| 3. Simulator and tracker | 2 | Synthetic paths, hourly pings, error tables |
| 4. Routing | 1.5 | Safer vs shortest path comparison |
| 5. Integration and demo | 1.5 | Map prototype and demonstration script |
| 6. Dissertation / report | 1 | Final report, limitations, code archive |
| Buffer / optional audio | 1 | Only if earlier phases are complete |

A single district will be completed first. Island-wide maps, if produced, will be coarser.

---

## 15. Resources required

| Resource | Requirement |
|---|---|
| Computing | Student laptop; optional Google Colab |
| Software | Open-source Python GIS and statistics libraries; web map |
| Data cost | None expected (public sources) |
| Field budget | None |
| Travel | None required |
| External API keys | Only if a map tile provider is used; OSM can suffice |

No specialised laboratory is required.

---

## 16. Risks and mitigation

| Risk | Mitigation |
|---|---|
| Sparse or biased GBIF points | Document bias; enrich only with labelled synthetic habitat points; validate against literature regions |
| Kruger movement statistics differ from Asian elephants | Treat as proxy; sensitivity test on step length; state clearly in limitations |
| Island-scale roads too heavy | Demo on one district extract |
| Over-promise of “live wild tracking” | Title, abstract, and demo script all say simulation + open data |

---

## 17. Expected outputs

1. Research proposal (this document)  
2. Technical design note and simple public explanation (already drafted for internal use)  
3. Working prototype (risk map, tracker, router, interface)  
4. Evaluation tables and maps for RQ1–RQ3  
5. Final dissertation / project report  
6. Source code and data-download instructions for reproducibility  
7. Research-unit demonstration (approximately 10–15 minutes)

---

## 18. Conclusion

Human–elephant conflict needs earlier, clearer information than a sighting after the fact. University researchers cannot usually instrument the forest or obtain official collars. This proposal therefore asks the research unit to approve a **low-risk, software-only study** that builds a complete early-warning *framework* from open data and auditable simulation: an overlap risk map, a sparse-location tracker, safer routing, and a demonstration interface.

The request is not for permission to work in the wild. The request is for permission to **treat HEC as a computational public-safety problem** that can be studied rigorously, honestly, and to completion within one academic cycle.

---

## 19. Declaration

We confirm that:

- this work will not involve capture or disturbance of wild elephants  
- restricted government telemetry is **not** a dependency  
- synthetic data and demo playback will be disclosed  
- the prototype will not be released as an official warning service without separate approval  

**Student(s):** ______________________  Date: __________  

**Supervisor:** ______________________  Date: __________  

---

## 20. Selected references (indicative)

*To be expanded in the full literature review. Indicative sources:*

- Fernando, P., et al. Publications on human–elephant conflict intensity and spatial pattern in Sri Lanka (including district / DS-division statistics used only as cited secondary data).  
- GBIF. Occurrence download for *Elephas maximus* (DOI to be inserted after the project download).  
- OpenStreetMap contributors. Sri Lanka extract (Geofabrik). ODbL.  
- WorldPop. Population density datasets.  
- NASA POWER. Climate data API.  
- UNEP-WCMC & IUCN. World Database on Protected Areas.  
- Slotow, R., Thaker, M., & Vanak, A. T. (2019). *ThermochronTracking Elephants Kruger 2007*. Movebank Data Repository. https://doi.org/10.5441/001/1.403h24q5/1  
- Standard texts / libraries on species distribution models, Kalman filtering, and shortest-path routing on networks.

---

## Appendix A — One-page summary for the research committee

**Title:** Open-data software-only HEC early warning and safe routing (Sri Lanka)

**Question:** Can we prototype a useful warning-and-routing system without field hardware or official collars?

**Method:** Public maps + public sightings → risk map; published foreign GPS statistics → synthetic local movement; filter between hourly pings; roads that avoid high risk.

**Ethics:** No animals handled; public and simulated data; demo labelled as research.

**Output:** District prototype, measurements, report, live (played-back) demonstration.

**Ask:** Approval as low-risk computational applied research.
