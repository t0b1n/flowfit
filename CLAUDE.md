# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
make install       # Python: uv venv + pip install
make web-install   # Node: npm ci in web/

# Development servers (run in separate terminals)
make api           # FastAPI on :8000 (uvicorn --reload)
make web-dev       # Vite on :5173 (proxies /solve to :8000)

# Tests
make test          # pytest
cd web && npm test # vitest (cockpit geometry; writes nothing unless UPDATE_FIXTURES=1)
python -m pytest tests/test_geometry.py -v   # single test file
python -m pytest tests/ -k "knee"            # filter by name

# TypeScript type check
cd web && npx tsc --noEmit
```

## Architecture

FlowFit is a contact-point-first bike fit tool. The rider's target posture drives component recommendations rather than the other way around.

**Stack:** FastAPI backend → React + React Three Fiber frontend. One API endpoint: `/solve` (used by Fit Transfer mode). All rendering geometry — 2D and 3D — is computed client-side.

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

**`synthesize_bike(frame, components)`** builds `BikePoints` in this order: BB → wheel axles → saddle (along seat tube + rail offset) → steerer top (frame.reach, frame.stack + spacer_stack) → bar clamp (stem vector) → hoods (horizontal: bar_reach + hood_reach_offset ahead of the clamp, hood_drop_offset up; independent of stem angle) → cleat (below BB by crank_length).

**`solve_pose_2d_full()`** runs 6-step IK: hip (above saddle) → ankle (above cleat) → knee (circle intersection) → shoulder (circle intersection) → elbow → derived joints. All joints solved in 2D sagittal plane.

**Grid evaluation:** the searched component axes are broadcast numpy arrays flowing through the same `synthesize_bike()`/`solve_pose_raw()` code as a single bike — never add a parallel vectorised implementation.

### Frontend (`web/src/`)

**Two modes** switched in `App.tsx`:
- `FitBuilderMode.tsx` — anthropometrics → contact points → optimized components. `/cockpit` is the same builder instance (shared state) in **cockpit focus**: `builder/CockpitPanels.tsx` replaces the side columns, the 2D views zoom to the cockpit, the 3D view gets Cockpit / Rider's-eye cameras
- `FitTransferMode.tsx` — maps one bike's fit to another frame

**Key files:**
- `frameCatalog.ts` — 1968-line hardcoded TypeScript array of `FrameModel` objects. `validateFrameCatalog()` runs at module load and throws on missing required fields or duplicates. Required geometry fields: `stack`, `reach`, `head_angle_deg`, `seat_angle_deg`, `bb_drop`, `chainstay_length`, `fork_length`, `fork_offset`, `wheel_radius`.
- `geometry.ts` — frontend geometry: `synthesizeBike()` (SVG coordinate transform, Y-inverted), saddle targeting, mannequin construction, and `buildGeometry3D()` which builds the whole 3D point/edge graph (bike + bilateral mannequin) from the same `BikeSketch`/`MannequinSketch` the 2D view renders — 2D and 3D agree by construction
- `bike3d.ts` — Three.js mesh builders; mannequin radii scale with rider height only (legs also with their own length); no weight input
- `types.ts` — `Components`, `BikeSketch`, `MannequinSketch`, `RiderFit`, `SetupResult`
- `cockpit.ts` — the single source of cockpit geometry: `hoodContact()` (the hand contact; mirrored line for line by `bikegeo_core/geometry.py::hood_contact`, parity pinned by `cockpit.fixtures.json`), `buildCockpit()` (bar centreline, hood station/pitch/rotation, UCI report) and `barCenterline3D()`. New cockpit fields on `Components` are optional; `bar_roll_deg: null` = 0, i.e. hoods straight ahead of the bar clamp (bar reach is horizontal, independent of the stem); `bar_drop` describes the drops and never moves the hoods
- `saddleModels.ts` — S-Works Power traced from side + top photos (`tools/photo_trace/saddle.py`): side shell/rail outlines, plan half-width, through-hole. `saddle3d.ts` lofts the 3D mesh from it; `components/SaddleShape.tsx` draws the side outline in 2D. Both put the side-profile top at `SADDLE_CONTACT_U` on the saddle contact point
- `shoeModels.ts` — S-Works Torch road shoe traced from side + top photos (`tools/photo_trace/shoe.py`), in fractions of shoe length (= `rider.foot_length`). `shoe3d.ts` lofts the white upper (with the black collar-lining dish), the black sole and the lateral BOA dials; `AnimatedLegs.tsx` places it via `design/foot.ts::shoePlacement` (ball over the cleat, sole on the pedal). The drawn shin ends at the shoe's malleolus station (`design/foot.ts::drawnAnkle`), drawing only: the solver's leg ends at the cleat
- `hoodModels.ts` — Dura-Ace R9270 / Red E1 hood, lever and pad outlines edge-extracted from side photos (`tools/photo_trace/`); `cockpit3d.ts` extrudes them and sweeps the bar; `builder/Cockpit2D.tsx` draws the same shapes in 2D

### Data tools (`tools/`, `reference_data/`)

- `reference_data/road_bikes.csv` — master list of bike models with `in_catalog` flag
- `tools/scrape_geometrygeeks.py` — Playwright scraper (headed Chromium required for reCAPTCHA)
- `tools/AGENTS.md` — step-by-step guide and field mapping table for adding bikes to `frameCatalog.ts`

### Non-obvious conventions

- **Stem angle** is quoted like stem makers do: relative to the perpendicular of the steerer (`stemAngleFromHorizontal` / `stem_angle_from_horizontal`), so −6° on a 73° head tube points 11° up and −17° is level. Spacers and the stem clamp stack along the steerer.
- **Hip joint offset** (80 mm default vertical rise from saddle contact to femoral head) is distinct from saddle height and is critical to the IK chain but not exposed in the main UI.
- **Preset → fine-tune pattern:** button pills set a value, a slider allows override. Used for Riding Intent, Hood Reach, and Pedal/Shoe Stack — not a shared component.
- **`wheel_radius`** in frame catalog entries should always be the identifier `defaultWheelRadius` (340 for 700c), not a literal number, so the constant stays in sync.
- **Stem / spacers:** `spacer_stack` and `stem_height` are measured along the steerer (head-tube axis), not vertically. `stem_angle_deg` is the manufacturer rating, measured from the normal to the steerer (`stemAngleFromHorizontal()` / `stem_angle_from_horizontal()`), so on a 73° head tube a −6° stem rises 11° above horizontal.
- No ESLint, Prettier, Black, or isort configs exist in this repo.
