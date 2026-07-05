# FlowFit roadmap — bike fitter & road racer perspective

Reviewed 2026-07 from the standpoint of a working bike fitter and a road-race
cyclist, with an emphasis on modern aero road fit (narrow bars, aero-hoods
riding, short cranks, forward saddles). Ordered **simplification first**:
complexity and correctness debt gets paid down before new features land on
top of it.

---

## 1. Complexity flags — fix before adding features

Things that are overly complex, misleading, or duplicated today.

### 1.1 The posture preset UI never reached the solver *(fixed in Phase 1)*
`FitTransferMode` and `buildSetup()` always sent a hardcoded "Endurance"
band set to `/solve`, whatever the rider chose. The backend's posture
penalty silently fought the contact-point objective with the wrong bands.
Resolution: `SetupInput.preset` is now optional; Transfer mode solves on
contact-point match alone, which is what "replicate my fit on frame B"
actually means.

### 1.2 Dead config *(fixed in Phase 1)*
`forearmHorizontalBias` / `elbowBarHeightBias` in `MANNEQUIN_PRESETS`
(`web/src/geometry.ts`) were read by nothing. Deleted. If aero-hoods
forearm modelling returns (Phase 3), it should come back as an explicit
hand-position model, not as unexplained scalar "biases".

### 1.3 Two parallel fit engines
Full IK exists twice: TypeScript (`web/src/geometry.ts::buildMannequin`,
`synthesizeBike`) drives everything interactive; Python (`bikegeo_core`)
drives `/solve` and `/geometry3d`. They can drift (they already differ in
small ways, e.g. hood angle handling). Recommendation: treat TypeScript as
the interactive source of truth, keep the Python core as the API/3D/test
oracle, and add a shared JSON fixture parity test (same inputs → joint
positions within tolerance) so drift fails CI instead of confusing users.

### 1.4 Four saddle parameters where fitters use two
`saddle_stack`, `seatpost_offset`, `saddle_rail_offset`,
`saddle_clamp_offset` are all exposed. A fitter thinks in **saddle height**
and **setback**; the hardware split is a purchasing detail. Phase 1 moves
the three hardware sliders behind an "Advanced" toggle and surfaces derived
setback/drop/reach numbers. Longer term the UI should accept height +
setback as the primary inputs and derive the hardware.

### 1.5 Misc pseudo-precision and naming *(mostly fixed in Phase 1)*
- "Fast" preset was *less* aggressive than "Race" → renamed **Sport**.
- Magic hood-angle formula `max(8, stem_angle + 6)` → named constants.
- `hip_joint_offset` slider allowed 0–130 mm (anatomically ~90–100 mm) →
  clamped to 70–120 with an explanation. This single value shifts the whole
  leg IK chain, so nonsense values silently corrupt every output.
- Still open: the "Back bend" slider (−10…+30°) around a fixed 40% spine
  hinge implies more anatomical fidelity than a 2-segment spine has.
  Consider folding it into presets + the flexibility screen (§3).

---

## 2. Phase 1 — Simplify & fix *(implemented)*

- Optional solver preset (`bikegeo_core/models.py`, `solver.py`); Transfer
  mode and `/geometry3d` no longer send fake Endurance bands.
- Dead preset fields deleted; presets renamed/ordered Endurance → Sport → Race.
- Fitter-standard metrics in Fit Builder: **saddle setback** (with a UCI
  5 cm nose-rule note), **saddle→hood drop**, **saddle→hood reach**.
- Crank slider extended to 150–180 mm (modern aero fits run 155–165).
- Saddle hardware sliders grouped behind an Advanced toggle.
- `hip_joint_offset` guardrails; named hood-angle constants.

## 3. Phase 2 — Dynamic pose & fitter-standard analysis

The current model evaluates a single static pose with the crank at BDC.
Real fit limits live elsewhere in the pedal stroke.

- **Crank-revolution sweep** (client-side, reusing `circleIntersections` /
  `angleAtPoint`): sample the crank circle, report knee flexion min/max and
  — critically — **minimum hip angle at top of stroke**. That number gates
  every aggressive position and is the quantitative case for short cranks.
- Show hip angle in Fit Builder (it is already computed in `PoseMetrics`
  but never displayed there).
- **Flexibility screen**: `RiderAnthropometrics.flexibility` exists but has
  no UI and no effect. Expose it as a 3-option assessment (limited /
  average / flexible) that widens or narrows acceptable angle bands, the
  way a fitter gates position aggressiveness after a functional assessment.
- Warn when knee flexion at BDC and min hip angle conflict (saddle height
  vs. closed hip), suggesting crank-length or trunk-angle remedies.

## 4. Phase 3 — Modern aero positions

Today the only hand position is the hoods; `Components.bar_drop` exists
but is unused by the UI. Modern road racing happens in three positions.

- **Hand-position selector**: tops / hoods / **aero-hoods** (forearms
  horizontal, elbow ~90°) / drops, each with its own pose solve and band
  check. Render the drops from `bar_drop`; aero-hoods places the forearm
  segment horizontal and measures the resulting trunk angle and hip angle.
- **Narrow bars & flare**: expose `hood_width` separately from `bar_width`
  (the model field already exists) so a 36 cm hood / 42 cm drop flared
  setup is representable; stance width already exists for the pedals.
- **Frontal-area estimate**: `buildFrontalMannequin` already produces a
  frontal silhouette. Integrate an approximate projected area, report a
  *relative* aero delta between two setups (e.g. "aero-hoods vs hoods:
  −9% frontal area, ≈ −18 W at 40 km/h"), clearly labelled an estimate.
  No CdA pretence — direction and rough magnitude only.
- **Short-crank guidance**: show hip-angle relief per 2.5 mm crank step at
  the current position (falls out of the Phase 2 sweep).

## 5. Phase 4 — Fitter workflow

- **Printable fit report**: print stylesheet over a report view — rider
  measurements, contact points, component spec, angle table, diagram. The
  deliverable a fitter hands a client.
- **Saved fits**: accounts and SQLite already exist for the bike catalog;
  add a `fits` table (rider profile + components + frame reference) with
  save/load/duplicate.
- **Before/after comparison in Fit Builder**: snapshot the current setup,
  tweak, and show deltas — reuse the delta-table pattern from Transfer mode.
- **Measurement wizard**: guided capture of inseam/torso/arm with
  photographs and tolerances, replacing raw sliders as the entry point.

## 6. Phase 5 — Catalog & misc

- Use `stockCockpit` data (already in the catalog schema) to seed component
  defaults per frame.
- Snap solver outputs to purchasable increments (stems in 10 mm / −6°,
  −12°, −17°; spacers in 5 mm) with a "closest buildable setup" note.
- Mobile / touch layout for the control panels.
- Frame catalog growth: `tools/AGENTS.md` pipeline + user submissions are
  in place; prioritise current-generation race platforms.
