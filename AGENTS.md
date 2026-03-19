# Agent Instructions

Guidelines for AI agents working in this repository.

---

## Keep MANNEQUIN.md in sync

[`MANNEQUIN.md`](./MANNEQUIN.md) is the canonical description of how the 2D and 3D mannequin is constructed — including IK chains, joint definitions, angle metrics, Z-spread rules, and rendering pipeline.

**When you change any of the following, you must update `MANNEQUIN.md`:**

- `bikegeo_core/mannequin2d.py` — IK logic, anchor offsets, angle calculations
- `bikegeo_core/mannequin3d.py` — bilateral Z-spread rules or new joint points
- `bikegeo_core/geometry_export.py` — edge lists, tube groups, or point sets
- `bikegeo_core/constraints.py` — posture constraint bands or new constraint checks
- `bikegeo_core/models.py` — `RiderAnthropometrics` fields (adding/removing/redefining measurements)
- `web/src/bike3d.ts` — tube radii, edge-to-tube-name mapping
- `web/src/BikeScene3D.tsx` — overlay segments or 3D mannequin rendering logic

### What to update

1. **Mermaid graphs** — redraw affected subgraphs to reflect new joints, edges, or data flows.
2. **Tables** — update any row that references a changed field, formula, or default value.
3. **Anthropometric definitions** — if a measurement's anatomical meaning changes (e.g. `torso_length` reference landmarks), update the definition in the inputs table.
4. **Derived angles** — if the formula for a pose metric changes, update the angles table.

### How to update

- Edit `MANNEQUIN.md` in the same commit/PR as the code change.
- Prefer updating existing sections over appending new ones — keep the document structured, not a changelog.
- Do not copy-paste code into the doc. Describe intent and reference the relevant file + function.

---

## Keep flow documentation in sync

When the data flow between frontend and backend changes — especially the
mannequin rendering pipeline — update the relevant Mermaid flowcharts in
`MANNEQUIN.md` and the architecture description in `SUMMARY.md`.

**Trigger files:**
- `web/src/geometry.ts` — `buildMannequin3DPoints()` or new 3D expansion logic
- `web/src/FitBuilderMode.tsx` — how mannequin data is assembled and passed to BikeScene3D
- `web/src/BikeScene3D.tsx` — how mannequin override is merged with backend data
- `bikegeo_core/geometry_export.py` — edge/point definitions that must match frontend

---

## Other conventions

- All units are **mm** and **degrees** unless noted otherwise.
- Coordinate system: **X = forward, Y = up, Z = lateral (positive = rider's left)**, origin at bottom bracket.
- "Prefer upper" in circle–circle intersections means the solution with the larger Y coordinate.
