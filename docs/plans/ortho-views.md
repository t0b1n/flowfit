# Orthographic side/front views from the 3D scene (implementation plan)

> **Audience:** an implementing agent. Follow the phases **in order**; each ends with a checklist and a
> verification step. Do not start a phase until the previous one passes. "Do not" is a hard rule.
> Ship each phase as its own PR.

---

## 0. Why

The 2D side and front views (`web/src/builder/Stage2DSide.tsx`, `Stage2DFront.tsx`) hand-draw every bike part in
SVG, duplicating the 3D mesh builders. A new part (the one-piece fork in PR #20) needs three implementations: the 2D
side outline, the 2D front outline and the 3D mesh. Draw order is hand-picked too, which caused the hub-over-tyre
bug. The 2D front rider is a separate blocky model (`buildFrontalMannequin`) that does not match the 3D rider.

**Goal:** draw the side and front views by rendering the existing 3D scene through an orthographic camera in flat
colours. Keep SVG only for annotations. A prototype (same fit, exported GLB, orthographic camera, unlit token
colours) matched the 2D side view closely. The front view needs one soft light, because flat colour merges
overlapping clay parts into one blob.

**The constraint is lag in the 3D view.** Measured on the height slider (25 steps, profiler):

| | per slider step |
|---|---|
| 2D side SVG | ~15 ms of work |
| 3D view, JavaScript only | ~42 ms: `buildBikeMeshes` ~18, `buildRiderMeshes` ~16, hoods + bar ~8 (mostly `computeVertexNormals`) |

Every `geo` change rebuilds **every** bike and rider mesh (`BikeStatic` / `RiderStatic` `useMemo` on `geo`). Phones
are ~3–5× slower, so ~150 ms per step. A flat orthographic render costs the GPU almost nothing. All the cost is
the CPU rebuild, and Phase 1 removes it.

## 1. Decisions (made)

- **Back bend is a smooth curve over 30–50 cm** (default 40 cm), not a hinge. See Phase 1, step 3.
- **The annotation layer stays plain DOM SVG.** The future mobile app wraps the web app (Capacitor or a webview),
  where DOM SVG and WebGL work unchanged. Do not add a drawing abstraction for React Native now. If a native React
  Native app is ever built, port the overlay to `react-native-svg`, whose API is near-identical.
- **SVG export of the drawing is not needed now**, but may be later. Keep `data-part` ids identical to the 3D part
  names, and keep the part outline functions (`forkOutline`, the spine path) pure, so export can be added per part.
- **Coordinate convention:** +Z is the rider's **right** (drive side, facing the side camera), as `riderMesh.ts` and
  `BikeScene3D.tsx` say. The header of `bike3d.ts` says "+Z = rider's left"; fix that comment in Phase 1. The far side
  is −Z.

---

## Phase 1: stop rebuilding on every tick (also fixes the current 3D view)

1. **Rider: build once, then only move.** Split `buildRiderMeshes` (`web/src/riderMesh.ts`) into:
   - `buildRiderParts(shape)`: meshes for head, neck, arms, hands, deltoids, glutes, pelvis and trapezius. `shape` =
     body measurements, weight, height, hood roll. Each limb is built at its rest length along local +Y, as
     `limbMesh` does today.
   - `poseRider(parts, points)`: sets each part's position and quaternion only (`orientBetween`).
   - In `RiderStatic` (`web/src/BikeScene3D.tsx`), `useMemo` the parts on `shape` only, and pose them in a
     `useLayoutEffect` on `geo`. Copy the pattern of `web/src/AnimatedLegs.tsx`, which already builds once per fit
     and mutates transforms per frame.
2. **Bike: split by dependency.** Do not rebuild frame parts on a component change.
   - Frame group (tubes, fork, wheels, rotors, drivetrain, bottle): rebuild only when frame geometry or size changes.
     Key the memo on the frame point positions, not on `geo`.
   - Component group (seatpost, spacers, stem, saddle, bar, hoods): rebuild these small meshes on component changes.
     Rigid parts (saddle, hoods) move by transform only.
   - This touches `buildBikeMeshes` (`web/src/bike3d.ts`), `web/src/cockpit3d.ts` and `BikeStatic`.
3. **Torso with a smooth back bend.** Today neither the 3D torso nor the 2D torso bends. Both run straight from hip
   to shoulder, and `buildRiderMeshes` discards the spine joint (`void spine;`). Back bend only moves the shoulder
   (`buildMannequin` in `web/src/geometry.ts`, the hinge at `SPINE_FRACTION = 0.4`).
   - **Keep the solved shoulder exactly where it is.** It feeds the arm IK and every metric, so metrics and fixtures
     must not change. The Python solver (`bikegeo_core/mannequin2d.py`) has no back bend, so there is no parity to
     keep.
   - **Spine path** (new pure function, e.g. `spinePath()` in `web/src/design/riderBody.ts`): lower straight →
     constant-curvature arc of length `L` turning by `backBendDeg` → upper straight.
     - The lower direction is the current hip → spine-joint direction.
     - The two straight lengths `a`, `b` are solved so the path ends exactly at the shoulder. It is a 2×2 linear
       solve: `shoulder − hip − arcChord = a·d0 + b·d1`.
     - Default `L = 400 mm`, clamped to 300–500 mm, and reduced if `a` or `b` would go negative.
     - Expose `L` as a constant in `design/riderBody.ts`.
   - **Mesh:** build the torso lathe once per shape, then **bend it along the path on the CPU** on posture changes.
     For each vertex: rest height `y` maps to arc length `s`, giving position `P(s) + N(s)·x + Z·z` (keep the existing
     depth and width scaling). The torso has ~2,200 vertices, so this is under 1 ms. Recompute normals for this one
     mesh only.
   - Use CPU path-bending rather than a skinned mesh: it is simpler, the curvature is exact, and the same
     `spinePath()` gives the 2D outline for a future SVG export.
   - Until Phase 3 lands, the 2D side torso (`buildFigure` in `web/src/builder/draw2d.ts`) follows the same path, so
     2D and 3D agree.
4. **Remove per-render work.**
   - The shadow-flag `useEffect` in `BikeScene3D` (the `scene.traverse` that sets `castShadow`) has no dependency
     list, so it walks the whole scene on every render. Run it only when meshes change.
   - Find the per-step shader compile seen in the profile (`getProgramInfoLog`, ~15 ms per step). Materials are
     cached per theme in `web/src/scene3d/materials.tsx`, so suspect inline JSX materials (`<meshStandardMaterial>`
     in `HandlebarMesh`, or the `dbg(...)` helpers). Hoist them.
5. **Render on demand.** Use `frameloop="demand"` and call `invalidate()` on prop changes, during camera damping
   (`CameraPresetRig`), while the pedal animation plays (`AnimatedLegs`), and on OrbitControls change.
6. **Fix the comment** in the `bike3d.ts` header: +Z is the rider's right.

**Checklist**
- [ ] Height, trunk angle and stem sliders do not reallocate rider or frame geometry (check with a
      `renderer.info.memory.geometries` counter in DEV).
- [ ] Back bend 0° renders the same torso as today (screenshot diff). At 12° the torso curves smoothly over ~40 cm,
      and the shoulder, arms and every metric value are unchanged.
- [ ] `cd web && npx tsc --noEmit` and `npm test` pass. Add a vitest for `spinePath()`: the end equals the
      shoulder, the end tangent equals the turned direction, and `a`, `b` ≥ 0 across the presets.

**Verify:** re-run the slider-step profile (Playwright, 25 height-slider steps, CDP profiler). The target is
**< 5 ms of JavaScript per step** in the 3D view.

---

## Phase 2: flat orthographic render mode

1. **New `BikeScene3D` props:** `projection: "perspective" | "ortho"` and `look: "studio" | "flat" | "flatLit"`.
   - `flat`: `MeshBasicMaterial` in the CSS token colours, no lights, shadows, `Environment`, fog or floor.
     Background = the 2D stage token. `NoToneMapping`, so colours match the CSS exactly.
   - `flatLit` (front view): `MeshLambertMaterial` with a hemisphere light plus one key light. This separates
     overlapping clay parts.
   - Build the flat material set in `materials.tsx`, next to `buildMats`, cached per theme.
2. **Orthographic camera:** drei `<OrthographicCamera makeDefault>`. Set its frustum (left, right, top, bottom in mm)
   from the **same numbers as the SVG viewBox**, so 1 mm maps to the same pixel in both layers. Cockpit focus is
   just a tighter frustum.
   - Put the mapping in one pure function shared by both layers (`viewBoxToFrustum`), with a unit test.
3. **Far side:** tag meshes with `userData.side = "far"` at build time (−Z parts: far leg, far arm, rotors, far crank).
   In flat looks they use an **opaque** colour mixed 45% toward the background, matching `.s2d-far`. Do not use
   transparency (it causes sorting glitches).
4. **Mobile quality tier:** add `"mobile"` to `Quality` (`BikeScene3D.tsx`, `type Quality`):
   - no shadows and no `Environment` in the studio look;
   - `dpr` capped at 2 in every look;
   - antialiasing on.
5. **Lost GPU context:** handle `webglcontextlost` / `webglcontextrestored` (iOS drops contexts when the app is
   backgrounded). Rebuild the parts and invalidate on restore.

**Checklist**
- [ ] The side view in `flat` + `ortho` is visually close to today's 2D side view (screenshot side by side). Far
      side faded, no lights.
- [ ] The front view in `flatLit` separates legs, torso and arms.
- [ ] SVG crosshairs at known points (BB, hoods, saddle) land on the rendered parts within 1 px at DPR 1 and 2.
- [ ] Simulated context loss (`WEBGL_lose_context`) recovers.

**Verify:** profile a slider step in the orthographic flat view: < 5 ms of JavaScript, < 2 ms GPU on a laptop. Spot
check on a phone (iOS Safari, Android Chrome).

---

## Phase 3: swap the 2D views over

1. `Stage2DSide` and `Stage2DFront` render `<BikeScene3D projection="ortho" look=…>` underneath, and the existing
   SVG on top with **only the annotations**:
   - skeleton and joint angles;
   - metric arcs;
   - KOPS;
   - ideal-contact crosshairs;
   - warning gap lines;
   - ruler;
   - `BikeFitAnnotations` / `BikeGeometryAnnotations`;
   - comparison ghosts;
   - `StageOverlay` callouts;
   - `CockpitSide ghost` and `WristMarker`.

   No camera controls in these views.
2. **Debug:** DEBUG colours map to the existing 3D `debugMaterial` (`web/src/debug.tsx`). The legend is unchanged.
3. **Delete the duplicated drawing:**
   - in `web/src/builder/BikeDrawing2D.tsx`: `FrameDrawing`, `Wheel`, `DriveSide`, `FarCrank`, `NearCrank`,
     `DiscBrakes`;
   - the figure polygons from `buildFigure` (keep `bones` / `joints` for the skeleton overlay);
   - the bike and rider rects in `Stage2DFront`;
   - `buildFrontalMannequin`, if nothing else uses it (check `FitTransferMode`, `AeroTools`, metrics).

   Keep `forkOutline` / `forkFrontOutline` (future export) and the `design/` profile tables. Only one view is
   mounted at a time (side, front or 3D), so there is one GPU context.
4. **Old SVG drawing behind a DEV flag for one release**, for comparison. Then remove it.

**Checklist**
- [ ] Every annotation layer toggles and aligns as before; cockpit focus zoom and compare ghosts work.
- [ ] Known, expected visual changes are noted in the PR: the 2D views now show the 3D rider (hip and saddle sit
      slightly differently; the front rider is no longer the blocky model).
- [ ] `tsc`, `npm test` and `make test` pass.

---

## Later (not in scope)

- **SVG export of the drawing:** per part, an outline function next to each mesh builder (the `forkOutline` pattern;
  the spine path gives the torso). For the side view, rigid parts can instead be projected to a silhouette once
  per body shape and moved with an SVG `transform`, because all side-view motion is in-plane. That does not work for
  the front view, where limbs foreshorten.
- **Native React Native app:** reuse the mesh builders and geometry through `@react-three/fiber/native` +
  `expo-gl`, and port the overlay to `react-native-svg`.
