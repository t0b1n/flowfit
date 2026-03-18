# bikegeo — Project Summary

## What It Is

A bike fit tool that computes optimal saddle height and cockpit setup for a given rider and frame. The user inputs their body measurements, selects a frame from a catalog, and the tool finds component settings that place the rider within a target posture band (Endurance / Regular / Fast). A 2D SVG visualization shows the resulting bike geometry and a stick-figure mannequin.

---

## Architecture

```
bikegeo_core/       Pure Python library (models, geometry, solver, mannequin)
bikegeo_api/        FastAPI wrapper exposing POST /solve
web/                React + TypeScript frontend (Vite)
tests/              Pytest unit tests
```

The frontend (`App.tsx`) runs a full replica of the geometry synthesis for real-time SVG rendering. The backend is only called for the full solve (grid search + constraint report). This dual-implementation means there is a risk of frontend/backend geometry divergence if one side is changed without updating the other.

---

## Data Flow

1. User adjusts frame size, components, and rider dimensions in the UI.
2. `synthesizeBike()` (frontend) redraws the SVG continuously.
3. On "Solve", `POST /solve` is called with `SetupInput` (frame + components + target contact points + rider anthropometrics + posture preset).
4. `solve_setup()` runs a grid search over saddle height × spacer stack (45 combinations), scoring each by contact-point error + posture-band penalty.
5. Best-fit `SetupOutput` is returned: adjusted components, actual contact points, pose metrics, and constraint status.
6. The current setup can be serialized to a URL fragment (gzip → base64) for sharing.

---

## Key Modules

| Module | Purpose |
|--------|---------|
| `models.py` | Pydantic v2 data models (`FrameGeometry`, `Components`, `RiderAnthropometrics`, `PosePreset`, etc.) |
| `geometry.py` | `synthesize_bike()` — converts frame + components to absolute 2D contact points |
| `mannequin2d.py` | `solve_pose_2d()` — derives trunk angle from saddle→hoods vector; other angles are stubs |
| `presets.py` | Three `PosePreset` definitions: Endurance / Regular / Fast |
| `constraints.py` | Checks component feasibility and posture-band violations |
| `solver.py` | `solve_setup()` — grid search optimizer |
| `serialisation.py` | URL-fragment encode/decode |
| `frameCatalog.ts` | Curated geometry database: Specialized Tarmac SL8, Canyon Aeroad CFR, Trek Madone Gen 8, Cervelo S5, Colnago Y1Rs, Giant Propel Advanced SL |

---

## Current Limitations (by design / known stubs)

- **Mannequin IK is a stub.** Only trunk angle is computed from geometry; hip angle, knee extension, elbow flexion, and shoulder flexion are hardcoded constants. A real 2-link IK solver is needed.
- **Crank angle fixed at BDC.** Cleat position is always computed at bottom dead centre. Multiple crank angles should be sampled to evaluate worst-case knee clearance.
- **Solver varies only saddle height and spacer stack.** Stem length, stem angle, bar reach, and crank length are not part of the search space.
- **`mannequin3d.py` is a placeholder** (returns empty dict).

---

## Bugs Fixed (this session)

### 1. Posture penalty formula was mathematically wrong — `solver.py`
**Was:** `max(0.0, pose.trunk_angle_deg) ** 2` — penalized only positive trunk angles, not deviations from the target band.
**Fixed:** Added `_posture_band_penalty(value, band)` which applies a quadratic penalty only when the value falls outside `[min_deg, max_deg]`.

### 2. Objective function ignored 4 of 5 posture metrics — `solver.py`
**Was:** Only trunk angle appeared in the penalty; hip, shoulder, elbow, knee were silently ignored.
**Fixed:** All five posture bands (trunk, hip, shoulder flexion, elbow flexion, knee extension) now contribute to the penalty.

### 3. `_objective` always received an empty preset — `solver.py`
**Was:** `_grid_search_components` passed `{}` as `preset_weights`, so the preset had no effect on scoring.
**Fixed:** `_objective` now accepts a `PosePreset` directly; `_grid_search_components` passes `setup.preset`.

### 4. No error handling in `decode_setup_from_fragment` — `serialisation.py`
**Was:** A corrupted URL fragment would raise an unhandled `binascii.Error`, `zlib.error`, `json.JSONDecodeError`, or Pydantic `ValidationError`.
**Fixed:** All decode errors are caught and re-raised as a descriptive `ValueError`.

### 5. Invalid geometry silently produced nonsense — `geometry.py`
**Was:** If `bb_drop > chainstay_length`, `sqrt()` received a negative argument (clamped to 0), placing the rear axle at x=0 with no warning.
**Fixed:** Explicit check raises `ValueError` before the sqrt.

### 6. `AngleBand` accepted inverted bounds — `models.py`
**Was:** `AngleBand(min_deg=90, max_deg=80)` was silently accepted; the constraint would never be satisfied.
**Fixed:** Added a `@model_validator` that raises `ValueError` when `max_deg < min_deg`.

---

## Remaining Issues (not yet fixed)

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| A | Mannequin IK hardcodes hip/knee/elbow angles — metrics are meaningless | High | `mannequin2d.py` |
| B | Frontend `synthesizeBike` duplicates backend — divergence risk | High | `App.tsx:313` |
| C | Solver only searches saddle height × spacers — misses stem/crank | High | `solver.py:76` |
| D | Crank angle hardcoded to BDC | Medium | `geometry.py:66` |
| E | `shoulder_abduction` constraint silently ignored in evaluation | Medium | `constraints.py` |
| F | API error details lost in frontend error handling | Medium | `api.ts:9` |
| G | Tyre size adjustment assumes 340 mm base wheel radius | Low | `App.tsx:195` |
| H | Fixed ±20 mm search window may miss optimal saddle height | Low | `solver.py:76` |

---

## Test Coverage

8 tests, all passing. Covers: serialization round-trip, solver adjusts components, steerer geometry, axle ground line, chainstay constraint, saddle position sign, spacer cockpit raise, cleat setback.

**Gaps:** No tests for posture constraint evaluation, mannequin IK accuracy, serialization error paths, API error responses, or solver optimality.

---

## Running Locally

```bash
# Python API
make serve          # starts uvicorn on :8000

# Frontend
cd web && npm install && npm run dev   # starts Vite on :5173
```
