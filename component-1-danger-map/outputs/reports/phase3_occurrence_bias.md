# Phase 3 — occurrence bias note

**Date:** 2026-10-18

## What we did

- Combined public elephant sightings (GBIF + iNaturalist) inside Polonnaruwa.
- Snapped points to the 500 m feature grid and **deduplicated** so each cell is presence at most once.
- Drew a random **background** sample of cells with no sighting (10× presence count, seed=42).

| Item | Count |
|------|------:|
| Raw occurrence records used | 844 |
| Presence cells (unique) | 440 |
| Background cells | 4400 |
| GBIF records (input) | 371 |
| iNaturalist records (input) | 473 |

## Bias (state this in the dissertation)

Citizen-science and opportunistic records are **not** a random sample of where elephants live.

1. **People-go bias** — sightings cluster where observers travel (roads, parks, villages), so deep forest interiors are under-sampled.
2. **Access bias** — remote or unsafe areas may have few records even if elephants are present.
3. **Taxonomic / verification bias** — research-grade and museum records differ from casual uploads.
4. **Temporal unevenness** — years and seasons are uneven; we treat all years as one presence set for the prototype.

## How we handle it

- Document the bias openly (this note).
- Use spatial cross-validation in Phase 4 (not random row splits).
- Interpret the model as a **proxy suitability / exposure surface**, not a census of wild elephants.
- Prefer overlap risk (habitat × people) over “forest = danger.”

This limitation is expected for a software-only, open-data student prototype.
