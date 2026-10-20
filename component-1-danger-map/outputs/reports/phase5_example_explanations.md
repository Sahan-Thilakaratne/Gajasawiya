# Phase 5 — Why is this place risky?

Conflict risk is **not** “there is forest.” It is where elephant habitat and people overlap.

- District cells explained: **28,817**
- High-risk detailed examples: **50** (top by `risk_score`)
- High-risk percentile cutoff used for context: p90 ≈ **0.060**

## Most common explanation labels

| Explanation | Cells |
|---|---:|
| farm + forest edge | 6516 |
| tree cover | 5849 |
| near water + tree cover | 3125 |
| tree cover + protected area | 1678 |
| farm + village + forest edge | 1233 |
| tree cover + protected area + elephant habitat likely | 1052 |
| lower overlap of elephants and people | 983 |
| farm near water | 933 |
| tree cover + elephant habitat likely | 845 |
| farm + people / crops present | 828 |
| near water + tree cover + protected area | 498 |
| forest edge + tree cover | 491 |

## Example high-risk cells

### Example 1: `C0050_0151`

- **Risk score:** 0.940 (0–100: 100.0)
- **Label:** farm + forest edge
- **Why:** Risk is elevated here because of farm + forest edge. Elephant habitat suitability ≈ 0.94 and human exposure ≈ 1.00 (overlap risk ≈ 0.94).
- **Local factors:**
  - cropland fraction higher than typical (0.66 vs median 0.04)
  - population density higher than typical (273.79 vs median 54.56)
  - distance to settlement closer than typical (1632 m vs median 2928 m)
  - distance to road closer than typical (256 m vs median 447 m)
  - cell sits on a forest–farm / forest–settlement edge

### Example 2: `C0154_0055`

- **Risk score:** 0.928 (0–100: 98.7)
- **Label:** farm + people / crops present + elephant habitat likely
- **Why:** Risk is elevated here because of farm + people / crops present + elephant habitat likely. Elephant habitat suitability ≈ 0.93 and human exposure ≈ 1.00 (overlap risk ≈ 0.93).
- **Local factors:**
  - cropland fraction higher than typical (0.90 vs median 0.04)
  - population density higher than typical (91.31 vs median 54.56)
  - distance to road closer than typical (101 m vs median 447 m)
  - elevation higher than typical (144.76 vs median 96.11)

### Example 3: `C0150_0025`

- **Risk score:** 0.924 (0–100: 98.3)
- **Label:** farm near water
- **Why:** Risk is elevated here because of farm near water. Elephant habitat suitability ≈ 0.92 and human exposure ≈ 1.00 (overlap risk ≈ 0.92).
- **Local factors:**
  - cropland fraction higher than typical (0.82 vs median 0.04)
  - built-up fraction higher than typical (0.01 vs median 0.00)
  - population density higher than typical (322.50 vs median 54.56)
  - distance to settlement closer than typical (1031 m vs median 2928 m)
  - distance to water closer than typical (150 m vs median 568 m)

### Example 4: `C0145_0048`

- **Risk score:** 0.893 (0–100: 95.0)
- **Label:** farm + forest edge
- **Why:** Risk is elevated here because of farm + forest edge. Elephant habitat suitability ≈ 0.89 and human exposure ≈ 1.00 (overlap risk ≈ 0.89).
- **Local factors:**
  - cropland fraction higher than typical (0.60 vs median 0.04)
  - population density higher than typical (328.48 vs median 54.56)
  - distance to settlement closer than typical (1880 m vs median 2928 m)
  - distance to road closer than typical (74 m vs median 447 m)
  - elevation higher than typical (148.04 vs median 96.11)

### Example 5: `C0149_0044`

- **Risk score:** 0.890 (0–100: 94.6)
- **Label:** farm + people / crops present + elephant habitat likely
- **Why:** Risk is elevated here because of farm + people / crops present + elephant habitat likely. Elephant habitat suitability ≈ 0.94 and human exposure ≈ 0.94 (overlap risk ≈ 0.89).
- **Local factors:**
  - cropland fraction higher than typical (0.81 vs median 0.04)
  - population density higher than typical (116.67 vs median 54.56)
  - distance to settlement closer than typical (1933 m vs median 2928 m)
  - distance to road closer than typical (196 m vs median 447 m)
  - elevation higher than typical (143.27 vs median 96.11)

### Example 6: `C0050_0147`

- **Risk score:** 0.878 (0–100: 93.4)
- **Label:** farm + people / crops present + elephant habitat likely
- **Why:** Risk is elevated here because of farm + people / crops present + elephant habitat likely. Elephant habitat suitability ≈ 0.88 and human exposure ≈ 1.00 (overlap risk ≈ 0.88).
- **Local factors:**
  - cropland fraction higher than typical (0.88 vs median 0.04)
  - population density higher than typical (106.02 vs median 54.56)
  - distance to settlement closer than typical (1743 m vs median 2928 m)

### Example 7: `C0175_0051`

- **Risk score:** 0.873 (0–100: 92.9)
- **Label:** farm + forest edge
- **Why:** Risk is elevated here because of farm + forest edge. Elephant habitat suitability ≈ 0.87 and human exposure ≈ 1.00 (overlap risk ≈ 0.87).
- **Local factors:**
  - cropland fraction higher than typical (0.61 vs median 0.04)
  - population density higher than typical (323.63 vs median 54.56)
  - distance to settlement closer than typical (1025 m vs median 2928 m)
  - distance to water closer than typical (39 m vs median 568 m)
  - distance to road closer than typical (294 m vs median 447 m)

### Example 8: `C0152_0025`

- **Risk score:** 0.856 (0–100: 91.1)
- **Label:** farm + village + forest edge
- **Why:** Risk is elevated here because of farm + village + forest edge. Elephant habitat suitability ≈ 0.92 and human exposure ≈ 0.93 (overlap risk ≈ 0.86).
- **Local factors:**
  - cropland fraction higher than typical (0.44 vs median 0.04)
  - built-up fraction higher than typical (0.00 vs median 0.00)
  - population density higher than typical (453.29 vs median 54.56)
  - distance to settlement closer than typical (910 m vs median 2928 m)
  - distance to water closer than typical (53 m vs median 568 m)

## How to cite this in the dissertation

The map colours land by overlap risk. Lookup of a cell returns a short phrase
(e.g. “farm + village + forest edge”) plus habitat and exposure scores,
so examiners can see *why* a square is red — not only that it is red.
