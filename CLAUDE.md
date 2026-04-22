# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
make install       # Python: uv venv + pip install
make web-install   # Node: npm ci in web/

# Development servers (run in separate terminals)
make api           # FastAPI on :8000 (uvicorn --reload)
make web-dev       # Vite on :5173 (proxies /solve and /geometry3d to :8000)

# Tests
make test          # pytest (Python only; no frontend tests exist)
python -m pytest tests/test_geometry.py -v   # single test file
python -m pytest tests/ -k "knee"            # filter by name

# TypeScript type check
cd web && npx tsc --noEmit
```

## Architecture

FlowFit is a contact-point-first bike fit tool. The rider's target posture drives component recommendations rather than the other way around.

**Stack:** FastAPI backend → React + React Three Fiber frontend. Two API endpoints: `/solve` and `/geometry3d`.

### Python core (`bikegeo_core/`)

The solver performs a grid search over (saddle height, spacer stack, stem length, stem angle) to find component combinations that satisfy posture constraints:

```
SetupInput → solver.py::solve_setup()
               ├── geometry.py::synthesize_bike()   # 2D bike contact points
               ├── mannequin2d.py::solve_pose_2d()  # IK chain for rider joints
               └── constraints.py                   # posture band + component checks
           → SetupOutput (components + pose_metrics + constraint status)
```

**Coordinate system:** Origin = bottom bracket. X = forward (positive away from rider), Y = up.

**`synthesize_bike(frame, components)`** builds `BikePoints` in this order: BB → wheel axles → saddle (along seat tube + rail offset) → steerer top (frame.reach, frame.stack + spacer_stack) → bar clamp (stem vector) → hoods (bar reach + drop) → cleat (below BB by crank_length).

**`solve_pose_2d_full()`** runs 6-step IK: hip (above saddle) → ankle (above cleat) → knee (circle intersection) → shoulder (circle intersection) → elbow → derived joints. All joints solved in 2D sagittal plane.

**3D expansion** (`mannequin3d.py`) splits bilateral pairs along Z (positive = rider's left). `geometry_export.py` produces the edge graph consumed by the frontend for 3D rendering.

### Frontend (`web/src/`)

**Two modes** switched in `App.tsx`:
- `FitBuilderMode.tsx` — anthropometrics → contact points → optimized components
- `FitTransferMode.tsx` — maps one bike's fit to another frame

**Key files:**
- `frameCatalog.ts` — 1968-line hardcoded TypeScript array of `FrameModel` objects. `validateFrameCatalog()` runs at module load and throws on missing required fields or duplicates. Required geometry fields: `stack`, `reach`, `head_angle_deg`, `seat_angle_deg`, `bb_drop`, `chainstay_length`, `fork_length`, `fork_offset`, `wheel_radius`.
- `geometry.ts` — frontend geometry helpers: `synthesizeBike()` (SVG coordinate transform, Y-inverted), saddle targeting, mannequin construction
- `bike3d.ts` — Three.js mesh builders; mannequin radii scale with rider weight via power law
- `types.ts` — `Components`, `BikeSketch`, `MannequinSketch`, `RiderFit`, `SetupResult`

### Data tools (`tools/`, `reference_data/`)

- `reference_data/road_bikes.csv` — master list of bike models with `in_catalog` flag
- `tools/scrape_geometrygeeks.py` — Playwright scraper (headed Chromium required for reCAPTCHA)
- `tools/AGENTS.md` — step-by-step guide and field mapping table for adding bikes to `frameCatalog.ts`

### Non-obvious conventions

- **Hip joint offset** (~95 mm vertical rise from saddle contact to femoral head) is distinct from saddle height and is critical to the IK chain but not exposed in the main UI.
- **Preset → fine-tune pattern:** button pills set a value, a slider allows override. Used for Riding Intent, Hood Reach, and Pedal/Shoe Stack — not a shared component.
- **`wheel_radius`** in frame catalog entries should always be the identifier `defaultWheelRadius` (340 for 700c), not a literal number, so the constant stays in sync.
- No ESLint, Prettier, Black, or isort configs exist in this repo.
