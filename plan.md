# Draft plan: Contact-point-first bike fit tool (2D now, 3D premium later)

## 0) Non‑negotiables (product truth)

* Core promise: **“Set contact points → see what bike + components reproduce them”**.
* Do **not** promise “fit from height”. Anthropometrics are **defaults** and **tunable**.
* v1 must be **fast, stable, and constraint-safe** (no impossible setups without clear warnings).

## 1) Scope definition

### v1 (free)

* 2D bike + rider in sagittal plane.
* Interactive contact points: **saddle**, **hoods**, **cleat/pedal spindle**.
* Constraint solver that adjusts components within limits.
* 3 posture presets for the dummy: **Endurance / Regular / Fast** (each as joint-angle + drop/reach target bands).
* Shareable state link (URL-encoded or short ID).

### v1.5 (free)

* Bike-to-bike comparison (shadow bike) + fit deltas.
* Import/export of saved setups.
* Component library presets (common stems, bar reach/drop, crank lengths).

### v2 (premium)

* 3D viewer of the same solved setup.
* Frontal area estimation with explicit uncertainty + optional extra body inputs.

## 2) Key user flows

1. **Start from an existing setup (primary flow):**

   * User enters known saddle height/setback + bar reach/drop (or imports).
   * Tool computes contact points and shows current posture metrics.
   * User adjusts contact points to explore trade-offs.

2. **Start from a frame (secondary flow):**

   * User chooses/inputs frame geometry.
   * Tool proposes a *feasible* component set.
   * User drags contact points; solver finds stem/spacers/saddle position.

3. **Anthropometry assist (optional):**

   * User enters height → default segment lengths.
   * User can override torso/leg/arm lengths and flexibility slider.
   * Tool updates pose constraints/targets but **does not claim correctness**.

## 3) Architecture (designed to avoid the “2D→3D refactor” + iOS-ready core)

### Principle: keep the solver as a portable, testable “core library”

* Treat everything important (geometry, constraints, optimisation, mannequin IK, metrics) as a **pure function library**.
* No web framework imports, no database code, no UI state in the core.
* Deterministic outputs given inputs (seeded / no randomness).

### Recommended implementation path (Python-first, iOS-friendly later)

**Phase A (prototype): Python core**

* Implement the core in Python with strict typing (`pydantic` models or `dataclasses` + `pydantic` validation), unit tests, and property tests.
* Keep numeric code isolated behind a small interface so it can be ported later.

**Phase B (production hardening): portable core**
Pick one of these when you’re ready to ship mobile:

1. **Port core to Swift** (best iOS integration, most work, cleanest end state).
2. **Port core to Rust** and expose:

   * Python bindings for fast iteration (`pyo3`)
   * Swift bindings via C-ABI (Rust → C header → Swift)
     This is the best “one core everywhere” story if you’re willing to learn Rust.
3. **Keep core in C++** (traditional, powerful, but heavier ergonomics than Rust/Swift).

**Blunt recommendation:** start in **Python**, but structure it like you *will* port it. Don’t let your first prototype become your permanent architecture.

### Layers

1. **Core (portable):**

   * Data model: bike geometry, component params, rider segments, contact points, presets.
   * Solver: contact-point solving + feasibility + optimisation.
   * Mannequin: IK + joint limits + posture metrics.
   * Serialisation: canonical JSON schema.

2. **Service layer (web backend):**

   * Auth, storage, dataset management, sharing links, billing.
   * Calls core library.

3. **Clients (web + later iOS):**

   * Web: 2D canvas UI.
   * iOS: Swift UI + the same JSON schema + same core logic (embedded or via API).

### Deployment modes you can support

* **Local computation:** core runs in the client (web via WASM later, iOS embedded). Fast + private.
* **Server computation:** core runs on backend; client sends inputs, receives solved outputs. Easier updates, enables premium features.

Plan for both: make the core stateless and serialisable.

## 4) Implementation deep dive

### 4.1 Data model (canonical JSON schema)

Define versioned schemas so links and saved setups don’t break.

**Entities**

* `FrameGeometry`:

  * wheel radius/tyre, wheelbase (derived), BB drop, chainstay, fork length/offset
  * stack, reach, head angle, seat angle, top tube, head tube
  * seat tube length + max seatpost extension (optional)
* `Components`:

  * crank length
  * cleat setback (shoe/cleat model), pedal spindle offset
  * saddle: rail length, clamp offset to saddle reference point
  * stem: length, angle
  * spacers: stack height
  * handlebar: reach, drop, hood reach/drop offsets (and bar rotation angle)
* `ContactPoints`:

  * `S` saddle reference point (define explicitly, e.g. saddle clamp → sit bone point offset)
  * `H` hood point (define as hood top midpoint)
  * `C` cleat point (define as shoe cleat centre projected to pedal spindle)
* `RiderAnthropometrics`:

  * height
  * segment lengths (thigh, shank, torso, upper arm, forearm, foot)
  * shoulder width (optional for 3D)
  * flexibility scalar (used to widen/narrow joint limits)
* `PosePreset`:

  * target bands for trunk angle, hip angle, shoulder angle, elbow flex, knee extension at bottom dead centre
  * weightings for penalties

**State**

* `SetupInput` = frame + components + contact point targets + rider + preset + constraint set
* `SetupOutput` = resolved components + resolved contact points + mannequin pose + metrics + constraint report

### 4.2 Coordinate frames

Use one global frame for everything:

* Origin at BB centre.
* x forward, y up, z to rider’s left.
* v1 uses `z=0` for all points.

Define transforms:

* seat tube axis, head tube axis, bar rotation.
* keep all offsets in mm and angles in degrees/radians consistently.

### 4.3 Bike geometry synthesis

From frame + components, compute absolute points:

* rear axle, front axle (derived)
* BB
* seatpost clamp point along seat tube axis
* saddle reference point via offsets
* steerer top given stack + spacers + stem angle
* bar clamp → hood point via bar reach/drop + hood offsets
* crank rotation and pedal spindle locus

Keep this as a pure function: `points = synthesize_bike(frame, components)`.

### 4.4 Constraint system

Represent constraints as structured objects so you can:

* explain violations to users
* tune weights

Types:

* Hard bounds: `min <= x <= max`
* Discrete sets: stem angles available, crank lengths available
* Coupled constraints: saddle rail limits based on seatpost clamp offset

Output should include:

* `status`: feasible / feasible_with_compromises / infeasible
* `violations`: list with names, values, limits, and “what to change” hints

### 4.5 Contact-point solver (core)

You want “drag S/H/C → propose components”. Treat it as optimisation.

**Variables (continuous):**

* saddle height, saddle setback
* spacer stack
* stem length (continuous initially, then snap)
* stem angle (choose from discrete set)
* bar rotation (optional)

**Objective:**
Minimise:

* weighted squared error between target and achieved contact points
* * penalty for component extremity
* * penalty for posture outside preset bands

**Algorithm choices (Python-friendly):**

* Start simple: coordinate descent / Powell / Nelder–Mead
* Add constraints via penalties or projection
* Snap discrete variables by enumerating small sets:

  * enumerate stem angles × a small set of stem lengths × crank lengths
  * run continuous optimise for the rest per candidate
  * choose best feasible candidate

This is robust and easy to port.

### 4.6 Mannequin IK (2D)

Model as linked segments:

* foot → shank → thigh → pelvis → torso → upper arm → forearm → hand

Inputs:

* contact points S/H/C
* crank angle of interest (at least bottom dead centre; optionally sample multiple angles)

Outputs:

* joint angles and key metrics

Implementation approach:

* Solve leg first to hit `C` given pelvis position derived from `S`.
* Solve upper body to hit `H` given torso endpoint.
* Use joint limits with soft penalties; if unsatisfiable, output “pose compromise”.

### 4.7 Posture presets (numbers not vibes)

Encode each preset as explicit target bands (example placeholders; you’ll fill real values):

* Endurance: trunk angle 50–60°, shoulder flex moderate, elbow 10–25°
* Regular: trunk 40–50°, elbow 15–35°
* Fast: trunk 30–40°, elbow 20–45°

The tool should show:

* where the user sits in these bands
* how changes move them

### 4.8 Shareable state + versioning

* Canonical JSON → compressed + base64 in URL fragment for v1.
* Also support server-side short IDs for cleaner links.
* Include `schema_version` and a migrator.

### 4.9 Backend plan (iOS-compatible services)

If you build a backend, keep it thin.

**API (FastAPI is a good Python choice):**

* `POST /solve` : takes `SetupInput`, returns `SetupOutput`
* `POST /share` : stores state, returns short link id
* `GET /share/{id}` : returns saved state
* `GET /frames` : list/search curated frames
* `POST /user/setups` : save setups

**Storage:**

* Postgres for users/setups
* Object storage (S3) for datasets, assets

**Billing (premium):**

* Stripe subscriptions; gate 3D/frontal area endpoints.

### 4.10 iOS path (later)

Two realistic strategies:

1. **Client-embedded core:** iOS app ships the solver + mannequin and runs everything locally.

   * Best UX, works offline, but requires a Swift/Rust/C++ core.
2. **Hybrid:** iOS app calls `/solve` initially, later migrate core on-device.

   * Fastest to ship; still needs careful latency and caching.

Either way, the canonical JSON schema and pure core boundaries keep you from rewriting.

## 4.11 Tech stack suggestion (Python-first)

* Core: Python 3.12+, `pydantic` (or `attrs`/`dataclasses`), `numpy`, `scipy` (optional)
* Backend: FastAPI + Postgres
* Frontend (web): TypeScript + Canvas/SVG (or React + Konva)
* Testing: pytest + property tests (hypothesis)

When you outgrow Python for mobile:

* Port core to Swift or Rust with a matching test suite.

## 4.12 What you should decide now (to avoid later thrash)

* Exact definitions of S/H/C points and offsets
* Which component parameters are editable vs fixed presets
* Discrete component sets you support (stem angles/lengths, crank lengths)
* What “fast” means numerically (target bands) and how strict they are

## 4) Solver design (what actually needs to work)

### Contact points

* `S` saddle reference point (user can select “sit bone point”, “saddle nose”, or “saddle midpoint” – pick one for v1).
* `H` hand/hoods point (bar reach/drop + **hood/shifter body geometry**).
* `C` cleat point relative to pedal spindle (**includes pedal + cleat stack height and fore–aft/lat offsets**).

### Key fit-critical offsets to model explicitly (v1)

* **Pedal/cleat stack height**: distance from pedal spindle centre to shoe sole contact plane at cleat (or equivalent). This affects effective saddle height and knee angles.
* **Cleat lateral offset / stance width** (optional in v1, important in 3D later): spindle-to-shoe-centre lateral distance.
* **Hood/shifter reach & rise**: hood contact point offset relative to bar clamp depends on brand/model and hood rotation.
* **Hood width / hand separation** (3D later): affects frontal area and shoulder angles.

### Decision variables

* Saddle height, saddle setback.
* Stem length + angle.
* Spacer stack.
* Bar reach/drop + hood offset (fixed per bar preset).
* Crank length.

### Constraints

* Component bounds (min/max spacers, stem angles available, saddle rail limits).
* Frame constraints (max seatpost, min insertion, etc. if you model them).
* Rider joint angle bounds per posture preset (soft constraints / penalties).

### Optimisation objective (simple and explainable)

* Minimise deviation from requested contact points + penalties for:

  * component extremity (too many spacers, extreme stem angle)
  * posture outside preset target bands
  * joint angles near limits

Deliver clear outputs:

* “Feasible” / “Feasible with compromises” / “Infeasible”.
* Which constraints broke and why.

## 5) Dummy (2D mannequin)

### Inputs

* Segment lengths (default from height + ratios; user overrides).
* Contact points S/H/C.
* Preset (Endurance/Regular/Fast) with target bands.

### Outputs

* Joint angles (ankle/knee/hip/shoulder/elbow/wrist proxy).
* Trunk angle, hip angle, shoulder angle, elbow bend.
* Warnings when outside target band.

### Implementation note

* Use IK with joint limits and soft penalties.
* Keep it deterministic and fast; avoid physics simulation.

## 6) Data strategy (don’t overcommit)

* v1: user-entered geometry + a small curated set of popular frames.
* v1.5: import formats (CSV / common geometry fields).
* Later: partnerships/licensing if you want BikeInsights-scale coverage.

## 7) UX principles (guardrails)

* Contact points always visible and draggable.
* One “primary” mode: **Adjust contact points**.
* Everything else is derived (geometry deltas, component suggestions, posture metrics).
* Show “compromises” plainly (e.g., “requires 45 mm spacers” / “requires 140 mm stem”).

## 8) Premium: 3D + frontal area

### 3D viewer

* Same solved contact points + mannequin pose.
* Camera presets: side, 45°, front.

### Frontal area (tiered)

* v2.0: parameterised body mesh scaled by height + shoulder width + limb circumferences (optional inputs).
* Compute projected area from front camera.
* Display uncertainty range and disclaimers.

## 9) Milestones (tight, testable deliverables)

### M1 — Core editor (2–3 weeks)

* 2D frame + components + draggable S/H/C.
* Component solver with feasibility checks.

### M2 — Mannequin (2–3 weeks)

* IK mannequin with presets + joint angle readouts.

### M3 — Comparison + sharing (1–2 weeks)

* Shadow bike comparison + URL state + export.

### M4 — Premium prototype (2–4 weeks)

* 3D renderer + basic frontal area estimate.

## 10) Risk register (what will bite you)

* Anthropometry expectations: users will treat defaults as “truth”. You must counteract this.
* Geometry data completeness/accuracy.
* Constraint explosion if you add too many parameters too early.
* Aero claims credibility: don’t oversell without validation.

## 11) Next edits to make (fill these blanks)

* Target user and primary acquisition channel:
* v1 bikes dataset approach:
* Which contact points are editable in v1 (exact definitions):
* Component constraints you will support in v1:
* What makes “Endurance/Regular/Fast” distinct (numbers):
* Monetisation (what exactly is premium beyond 3D):
