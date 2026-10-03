# Orthographic side/front views from the 3D scene (implementation plan)

> **Audience:** an implementing agent. Follow the phases **in order**. Each phase ends with a checklist and a
> verification step; do not start a phase until the previous one passes. "Do not" is a hard rule.
> **Ship each phase as its own PR** (branch from `main`, merge, then branch the next phase from the new `main`).
> When a step says "check X", actually check it and write what you found in the PR description.

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

**The constraint is lag in the 3D view.** Measured with `tools/perf/slider_profile.py` (25 rider-height slider
steps, CDP profiler, before this plan):

| | per slider step |
|---|---|
| 2D side SVG | ~5 ms of our JavaScript (~15 ms total work) |
| 3D view | ~42 ms of our JavaScript: `buildBikeMeshes` ~18, `buildRiderMeshes` ~16, hoods + bar ~8. Most of it is `computeVertexNormals` on rebuilt geometry. Plus ~15 ms in `getProgramInfoLog` (shader compiles). |

Every change to `geo` rebuilds **every** bike and rider mesh: `BikeStatic` and `RiderStatic` in
`web/src/BikeScene3D.tsx` `useMemo` on `geo`. Phones are ~3–5× slower. The GPU cost of a flat orthographic render is
negligible, so the CPU rebuild is what Phase 1 removes.

## 1. Decisions (made; do not revisit)

- **Back bend is drawn as a smooth curve over 30–50 cm** (default 40 cm), not a hinge (Phase 1, step 4).
- **The annotation layer stays plain DOM SVG.** The future mobile app will wrap the web app (Capacitor or a
  webview). Do not add a drawing abstraction for React Native.
- **SVG export of the drawing is not needed now** but may be later. Keep `data-part` ids identical to the 3D part
  names (`web/src/debug.tsx` lists them), and keep outline functions (`forkOutline`, `spinePath`) pure and exported.
- **Coordinates:** origin BB, +X forward, +Y up, **+Z = the rider's right** (drive side; it faces the side
  camera). The far side is −Z. The `bike3d.ts` file header wrongly says "+Z rider's left"; fix that comment
  (Phase 1, step 6).
- **Do not change** `buildMannequin`'s solved points, any metric, `cockpit.fixtures.json` or the Python solver. This
  plan is rendering only.

## 2. Ground rules

- **Before every commit**, from the repo root:
  - `cd web && npx tsc --noEmit && npm test`;
  - `make test`, if you touched Python (you should not).
- **Run the app:** `make web-dev` (Vite on :5173). The Fit Builder works without the API.
- **Screenshots:** use Playwright with the preinstalled Chromium:
  - `executable_path="/opt/pw-browsers/chromium"`;
  - args `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`;
  - **do not** run `playwright install`.

  Toolbar buttons: the view switch is the text `Side` / `Front` / `3D`. `DEBUG` toggles part colours; it may start
  ON in dev, so check the `s2d-debug` class on the SVG.
- **Measure:** `python tools/perf/slider_profile.py --view 3d`, and `--view side`. Compare the "our source files ...
  per step" lines. The wall-clock median includes a ~33 ms two-frame wait, and container GPU time is meaningless.
- **Keep changes minimal.** Do not reformat files or rename things you do not need to. Match the surrounding
  comment style (short, specific).

---

## Phase 1: stop rebuilding geometry on every tick (also fixes the current 3D view)

The trick is a **geometry cache keyed by shape parameters**. Meshes and groups can still be recreated every tick
(that is cheap). The expensive `BufferGeometry` (lathe, `computeVertexNormals`) is reused whenever its shape
parameters are unchanged, and only placed with a transform. You do not need to work out which slider affects
which part: the key decides.

### Step 1: `web/src/scene3d/geometryCache.ts` (new)

```ts
import type * as THREE from "three";

/**
 * Shape-keyed BufferGeometry cache with mark-and-sweep disposal. A build pass calls `begin()`, then `get(key, build)`
 * for every geometry it needs, then `end()`; geometries not requested since `begin()` are disposed. Keys must
 * encode every number the geometry depends on (round lengths to 0.1 mm, angles to 0.01°) and nothing about where it
 * is placed: placement is the mesh's transform.
 */
export class GeometryCache {
  private live = new Map<string, THREE.BufferGeometry>();
  private used = new Set<string>();
  begin() { this.used.clear(); }
  get<G extends THREE.BufferGeometry>(key: string, build: () => G): G {
    this.used.add(key);
    let g = this.live.get(key);
    if (!g) { g = build(); this.live.set(key, g); }
    return g as G;
  }
  end() {
    for (const [k, g] of this.live) if (!this.used.has(k)) { g.dispose(); this.live.delete(k); }
  }
  disposeAll() { for (const g of this.live.values()) g.dispose(); this.live.clear(); }
}

/** Round for keys: 0.1 mm / 0.001 for unitless. */
export const k1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
```

Add `web/src/scene3d/geometryCache.test.ts`:
- same key twice → same object;
- an unused key is disposed at `end()` (spy on `dispose`).

### Step 2: thread the cache through the builders

- **`web/src/riderMesh.ts`:**
  - Add an optional last parameter `cache?: GeometryCache` to `limbMesh`, `headMesh`, `buildRiderMeshes` and the
    local `ellipsoid` helper.
  - When `cache` is given, wrap each geometry construction in `cache.get(key, () => ...)`.
  - **`limbMesh` key:** `limb|${seg}|${k1(len)}|${k1(k)}|${JSON of the resolved bulges, numbers rounded to 3 dp}|${prof.scale}`.
    The resolved bulges are local directions; including them makes the key safe even if an arm's anterior
    direction drifts.
  - **`headMesh` key:** `head`. The geometry is a unit sphere deformed by `headDeform` and does not depend on
    position. Placement and rotation stay on the mesh.
  - **`ellipsoid`:** geometry key `sphere40x24`. It is a unit sphere scaled by `mesh.scale`, so one geometry serves
    all.
  - **Other `limbGeometry(...)` calls** (trapezius, neck, pelvis, hands): key `lathe|<name>|${k1(len)}|<every radius
    number used>`.
- **`web/src/bike3d.ts`:**
  - `taper(a, b, r0, r1, mat, seg)` → key `taper|${k1(len)}|${r0}|${r1}|${seg}`.
  - `cylinder(...)` → key `cyl|${k1(len)}|${r0}|${r1}`.
  - `addWheel` geometries depend only on `R` and opts → key `wheel|<part>|${R}|...`.
  - `forkGeometry` is in world space → key `fork|${k1(crown.x)}|${k1(crown.y)}|${k1(axle.x)}|${k1(axle.y)}|${zc}|${half}`.
  - Drivetrain parts → key by their numbers.
  - Pass `cache` in through `buildBikeMeshes(..., opts: { ..., cache?: GeometryCache })`.
- **`web/src/cockpit3d.ts`:** `buildBar` and `buildHoodMeshes`. The hood extrusions depend only on the hood profile
  → key `hood|${ck.hood.id}|<part>`. Bar sweep geometry depends on the bar shape → key on
  `JSON.stringify(<the numbers it reads>)`. If in doubt, key on the full input numbers; a correct cache that misses
  is fine, a wrong hit is not.
- **`web/src/AnimatedLegs.tsx`** already builds once per fit. Leave it alone.

### Step 3: use the cache in the React components (`web/src/BikeScene3D.tsx`)

- In `BikeStatic` and `RiderStatic`:
  - `const cache = useMemo(() => new GeometryCache(), [])`;
  - `useEffect(() => () => cache.disposeAll(), [cache])`;
  - inside the existing `useMemo`: `cache.begin(); …build with cache…; cache.end();`.
- **Remove** the per-group `geometry?.dispose()` cleanup effects in those two components: the cache owns disposal
  now. Disposing a cached geometry would break the next frame.
- Keep a separate cache instance per component. Do not share one between `BikeStatic` and `RiderStatic`, because
  `begin`/`end` would sweep each other's geometry.
- `debug` must be part of the material choice only, never the geometry key.

### Step 4: torso with a smooth back bend

Today neither torso bends. Both run straight from hip to shoulder, and `buildRiderMeshes` discards the spine joint
(`void spine;`). Back bend only moves the shoulder: `buildMannequin` in `web/src/geometry.ts`, hinge at
`SPINE_FRACTION = 0.4`, roughly lines 290–310. **Keep the solved shoulder exactly where it is.** Only the torso
shape changes.

**4a. `spinePath()` in `web/src/design/riderBody.ts`** (pure, 2D, the bike's x/y in mm):

```ts
export const SPINE_BEND_LENGTH = 400; // mm: back bend is spread over this arc length (30–50 cm)

export interface SpinePath {
  /** total length, hip → shoulder along the path */
  len: number;
  /** point and unit tangent at arc length s (s < 0 / s > len extrapolate straight along the end tangents) */
  at(s: number): { p: { x: number; y: number }; t: { x: number; y: number } };
}

/**
 * Hip → shoulder spine as straight → circular arc → straight, ending exactly at `shoulder`. The lower straight
 * runs along hip → spineJoint (the solver's hinge) and the upper one along spineJoint → shoulder, so the path
 * turns by the same angle as the solver's hinge but spreads it over `L` mm. Shoulder (and every metric) unchanged.
 */
export function spinePath(hip, spineJoint, shoulder, L = SPINE_BEND_LENGTH): SpinePath
```

The maths. Do it exactly like this:
1. `d0 = unit(spineJoint − hip)` and `d1 = unit(shoulder − spineJoint)`. If either length is < 1 mm, return a
   straight path hip → shoulder.
2. `φ = atan2(d0.x·d1.y − d0.y·d1.x, d0.x·d1.x + d0.y·d1.y)`, the signed turn. If `|φ| < 0.5°`, return the straight
   path hip → shoulder.
3. `n0 = (−d0.y, d0.x)` (d0 rotated +90°). The arc's chord vector is
   `C = (L/φ)·(sin φ · d0 + (1 − cos φ) · n0)`. This formula is correct for signed φ.
4. Solve `a·d0 + b·d1 = shoulder − hip − C` for the straight lengths `a`, `b` (2×2, `det = sin φ`):
   - `rx, ry` = the right-hand side;
   - `a = (rx·d1.y − ry·d1.x) / det`;
   - `b = (d0.x·ry − d0.y·rx) / det`.
5. If `a < 0` or `b < 0`, set `L = L·0.8` and go back to 3, down to `L = 50`. If it still fails, use the hinge: `a =
   |spineJoint − hip|`, `L = 0`, `b = |shoulder − spineJoint|`.
6. `len = a + L + b`. `at(s)`:
   - `s ≤ a`: `p = hip + d0·s`, `t = d0`;
   - `a < s < a + L`: with `u = s − a` and `ψ = φ·u/L`, `p = A + (L/φ)·(sin ψ·d0 + (1 − cos ψ)·n0)` where
     `A = hip + a·d0`, and `t = cos ψ·d0 + sin ψ·n0`;
   - `s ≥ a + L`: `p = B + d1·(s − a − L)` where `B = A + C`, and `t = d1`;
   - `s < 0` or `s > len`: extrapolate along `d0` / `d1`.

Add `web/src/design/riderBody.test.ts` (vitest), for the three presets in `MANNEQUIN_PRESETS`
(`web/src/geometry.ts`) and bends of −10, 0, 5, 12 and 20°:
- `at(len).p` equals the shoulder within 0.01 mm;
- `at(len).t` equals `d1` within 1e-6;
- `at(0).p` equals the hip;
- `a`, `b` ≥ 0.

Build the hip, spine joint and shoulder with the same hinge formula as `buildMannequin`; copy it into the test.

**4b. 3D torso** (`buildRiderMeshes`, the block starting `// Torso:`):

- **Points:** `hip_center`, `spine_joint`, `shoulder_center` from `pts` (all at z = 0); build
  `path = spinePath(hip, spine, shoulder)`.
- **Rest geometry:** exactly as today (`limbGeometry(len, PROFILES.torso.radius × kt, 40, 56)` plus the
  `torsoDepth` / `torsoWidth` scaling), but with `len = path.len`.
  - Cache key: `torso|${k1(path.len)}|${k1(kt)}`.
  - **Clone it** before bending (`geom.clone()`); the bend is pose-dependent and must not write into the cached
    rest geometry. Dispose the previous bent clone yourself (keep it in a ref, or add it to the cache under key
    `torsoBent|${k1(len)}|${φ rounded}|${a rounded}` and let the sweep dispose it).
- **`bendTorso(geom, path)`** (new, in `riderMesh.ts`). Today the torso is placed with
  `orientBetween(torso, hip − 10·axis, …)`, so local y = 0 sits 10 mm behind the hip along the axis. Keep that
  offset with `s = y − 10`. For each vertex `(x, y, z)` of the rest lathe (local +Y is the spine; local x is
  fore-aft depth, local z is lateral):
  - `{p, t} = path.at(y − 10)`;
  - `m = (t.y, −t.x)`: the image of local +X under `orientBetween` (a rotation taking +Y to `t`) is
    `(t.y, −t.x)`. Use this exact sign so 0° bend reproduces today's torso;
  - new position = `(p.x + m.x·x, p.y + m.y·x, z)`.

  Then `geom.computeVertexNormals()` (one mesh, ~2,200 vertices, < 1 ms). The mesh then gets an **identity**
  transform: position (0, 0, 0), no rotation. Remove the `orientBetween(torso, …)` call.
- **Check:** at 0° bend the new torso must match today's within ~1 mm. Screenshot the side view at the "endurance"
  preset before and after; it should look identical. Then try 12°: the back should curve smoothly over ~40 cm with
  shoulders, arms and every metric value unchanged.

**4c. 2D side torso until Phase 3 lands** (`web/src/builder/draw2d.ts`, `buildFigure`, `const torso: string[] = [ seg(...hip..., ...shoulder..., torsoProf, 28) ...`):
- Add `pathSeg(path, s0, s1, prof, n)` next to `seg`. It samples `n + 1` points along `s ∈ [s0, s1]`, offsets each
  by `±prof(t)` along the path normal `(−t.y, t.x)`, and adds round end caps like `seg`.
- Replace the torso `seg(...)` with `pathSeg(spinePath(f.hip, f.spineJoint, f.shoulder), -10, path.len - 18, torsoProf, 28)`.
  Today's straight seg runs from hip − 10 to shoulder − 18 along the axis.
- `f.spineJoint` already exists on the figure input. Check that it is the solver's hinge point; it is set from
  `mannequin.spineJoint`.

### Step 5: remove per-render work

1. **Shadow flags.** In `SceneContent` (`BikeScene3D.tsx`), the `useEffect(() => { scene.traverse(... castShadow
   ...) })` has **no dependency array**, so it walks the whole scene on every render. Give it deps that change
   when meshes change: `[geo, tPose, showMannequin, debugParts]`.
2. **Shader compiles.** In DEV, log `gl.info.programs?.length` once per second (`useThree().gl`). Drag a slider:
   - if the count grows, or `getProgramInfoLog` shows in the profile, find materials created during render: search
     `BikeScene3D.tsx`, `AnimatedLegs.tsx` and `scene3d/` for JSX `<mesh…Material` and for `new THREE.*Material(`
     inside render paths or `useMemo`s keyed on `geo`;
   - hoist each one into `useMemo(() => …, [theme])` or into `buildMats` in `web/src/scene3d/materials.tsx`.

   Stop when the program count stays flat while dragging.
3. **Render on demand.** On the `<Canvas>` (around line 1690 of `BikeScene3D.tsx`), set `frameloop="demand"`. Then
   make sure frames still render when needed:
   - **Prop changes:** R3F re-renders when React reconciles, so call `invalidate()` from `useThree()` in a
     `useEffect` in `SceneContent` with deps `[geo, theme, quality, showAngles, showDimensions, showKops, focused,
     pinned, hovered]`.
   - **`AnimatedLegs`:** in its `useFrame`, when `playing` is true call `invalidate()` at the end. Also invalidate
     when `crankAngleRef` is changed from outside; find who writes it and call `invalidate()` there.
   - **`CameraPresetRig`:** while `goalRef.current` is set, call `invalidate()` in its `useFrame`. Clear
     `goalRef.current` once the camera is within 0.5 mm of the goal, so the loop stops.
   - **OrbitControls (drei)** invalidates on change by itself. Verify by orbiting with the mouse in the app.
   - **Callouts** (`Callouts3D.tsx` `ScreenProjector`) run in `useFrame`. Verify the callouts still follow after a
     slider change and after orbiting.

### Step 6: comment fix

In the `web/src/bike3d.ts` header, change "Z — lateral (positive = rider's left)" to "positive = rider's right (drive
side)".

### Phase 1 checklist
- [ ] `tools/perf/slider_profile.py --view 3d`: **< 5 ms of our JavaScript per step** (was ~42), and no
      `getProgramInfoLog` per step.
- [ ] In DEV, `gl.info.memory.geometries` stays flat while dragging the stem, spacer and trunk-angle sliders. It may
      change on rider height or weight; those change body shape.
- [ ] Back bend 0° looks identical to before; 12° curves smoothly; metric values (right column) identical
      before/after at both.
- [ ] Pedal animation, camera presets, orbiting, callouts, T-pose, DEBUG colours, GLB export, theme switch and the
      frontal-area probe (AERO tools) all still work.
- [ ] `npx tsc --noEmit`, `npm test` (including the new tests) pass.

---

## Phase 2: a flat orthographic render component

Do not change how the 3D view looks by default. Everything here is opt-in through props.

### Step 1: extract a lean scene

Create `web/src/scene3d/OrthoScene.tsx`, a component that renders **only the model**:
- **Bike:** `BikeStatic` (+ `SaddleMesh`).
- **Rider:** `RiderStatic` with `includeLegs={!strokeLUT}`, plus `AnimatedLegs` with `playing={false}`.
- **Fallback:** `Drivetrain3D` when there is no LUT.

Inside its own `<Canvas>`, wrapped in `MatsProvider` and `DebugProvider`. Move or export those components from
`BikeScene3D.tsx` (export is enough; do not duplicate them). There are **no** lights, stage, analytics, callouts,
controls or effects.

```tsx
interface OrthoSceneProps {
  geo: Geometry3DResponse;
  strokeLUT?: PedalStrokeLUT;
  weightKg: number;
  stanceWidth: number;
  view: "side" | "front";
  /** SVG viewBox string of the overlay this canvas sits under: the camera frustum is derived from it */
  viewBox: string;
  look: "flat" | "flatLit";
  theme: Theme;
  debug?: boolean;
}
```

- **Crank angle:** `crankAngleRef = useRef(0)`. The 2D side view draws the far (left) leg at `strokeMetrics.poses[0]`
  (`Stage2DSide.tsx`, `farPose`), and `AnimatedLegs` puts the left crank at the given angle and the right at +180°.
  So 0° should match the 2D view; verify with a screenshot.
- **Canvas:** `frameloop="demand"`, `dpr={[1, 2]}`, `gl={{ antialias: true, alpha: true, toneMapping:
  THREE.NoToneMapping }}`, `style={{ position: "absolute", inset: 0 }}`.

### Step 2: camera from the viewBox

Write a pure function `viewBoxToFrustum(viewBox: string, pxW: number, pxH: number)` in `web/src/scene3d/ortho.ts`.
It returns `{ left, right, top, bottom }` in camera units (mm) reproducing SVG `preserveAspectRatio="xMidYMid meet"`:
- parse `minX minY w h`;
- `s = min(pxW / w, pxH / h)`, the visible mm span `W = pxW / s`, `H = pxH / s`;
- centre `cx = minX + w/2` and `cy = −(minY + h/2)` (SVG y is −bike y);
- result: `left = cx − W/2`, `right = cx + W/2`, `top = cy + H/2`, `bottom = cy − H/2`.

Test it in `web/src/scene3d/ortho.test.ts` (an exact aspect match, a wider canvas, a taller canvas).

Use drei `<OrthographicCamera makeDefault manual left right top bottom near={-1e5} far={1e5} />`, with the canvas
size from `useThree().size`.
- **Side:** camera `position=[0, 0, 5000]`, looking down −Z (the default orientation). Camera x = bike x and camera
  y = bike y.
- **Front:** `position=[5000, 0, 0]`, `rotation=[0, Math.PI / 2, 0]` (looking down −X). Camera local x is then
  world −Z, i.e. the rider's left is on screen right. `buildFrontalMannequin` puts the rider's left at +x, and
  `Stage2DFront` draws the bike centreline at x = 0, so the frustum numbers carry over unchanged.
- **Check alignment:** in a test page, or in Phase 3, a crosshair at a known point (BB at (0, 0), front axle) must
  land on the rendered part within 1 px.

### Step 3: flat materials

- In `web/src/scene3d/materials.tsx`, add `buildFlatMats(theme, lit: boolean)` returning the **same keys** as
  `buildMats` (`frame`, `carbon`, `clay`, `tyre`, `spoke`, `tape`, `alloy`, `rotor`, `hood`, `lever`):
  - `MeshBasicMaterial`, or `MeshLambertMaterial` when `lit`;
  - colours read from the **2D CSS**, so they match exactly. Create a hidden `<svg class="s2d">` with one
    `<rect class="s2d-frame">`, `s2d-carbon`, `s2d-clay`, `s2d-tyre`, `s2d-alloy`, `s2d-rotor`,
    `s2d-saddle`, … appended to `document.body`, read `getComputedStyle(el).fill` for each, then remove it;
  - map: `frame` ← `s2d-frame`, `carbon` ← `s2d-carbon`, `clay` ← `s2d-clay`, `tyre` ← `s2d-tyre`, `alloy` ←
    `s2d-alloy`, `rotor` ← `s2d-rotor` (stroke, not fill); `spoke`, `tape`, `hood`,
    `lever` ← `s2d-carbon`;
  - re-read when the theme changes.
- Give `MatsProvider` an optional `look` prop. With `"flat"` or `"flatLit"` it provides `buildFlatMats(...)` under
  the same context, so **no mesh builder changes**.
- `flatLit`: add `<hemisphereLight args={["#ffffff", "#8a8478", 1.6]} />` and `<directionalLight position={[1, 1,
  0.3]} intensity={1.4} />` (front view), or `[0.4, 1, 1]` for side.

### Step 4: far side

- After the scene's meshes change, run `markFarSide(root)`: for every mesh, compute a `Box3`; if `box.max.z < 0`,
  swap its material for a far variant.
- Far variant: same type, colour = `color.clone().lerp(background, 0.45)`, **opaque**, cached in a
  `Map<Material, Material>`.
- `background` = the computed CSS `--bg` behind the 2D stage. Read it from the stage wrapper element.
- Side view only. Do not use `transparent`/`opacity`; it causes sorting artefacts.

### Step 5: mobile quality and lost context

- **`BikeScene3D.tsx`:**
  - `type Quality = "high" | "low" | "mobile"`;
  - `readQuality()` returns `"mobile"` when `matchMedia("(max-width: 768px)")` matches;
  - in `"mobile"`: no `castShadow` on the directional light, no `<Environment>`, no `EffectComposer`/SSAO, and
    `dpr={[1, 2]}` on the Canvas.
- **Both canvases:** listen for `webglcontextlost` (call `preventDefault()`) and `webglcontextrestored` on
  `gl.domElement`. On restore, bump a React `key` on the scene content so everything rebuilds, then call
  `invalidate()`.
- **Test:** in the browser console, `canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`,
  then `.restoreContext()`; the view must come back.

### Phase 2 checklist
- [ ] A dev route (e.g. `?ortho=side` in `FitBuilderMode`, DEV only) shows `OrthoScene` beside the current 2D view.
      Screenshot both; they should look very close (frame, wheels, rider, far side faded).
- [ ] The front view in `flatLit` separates legs, torso and arms.
- [ ] `viewBoxToFrustum` tests pass. A crosshair at the BB and front axle lines up within 1 px at DPR 1 and 2.
- [ ] Context loss and restore works, and the `"mobile"` quality renders without shadows.
- [ ] `tools/perf/slider_profile.py`: < 5 ms of our JavaScript per step with the ortho view mounted.

---

## Phase 3: swap the 2D views over

1. **Side view (`Stage2DSide`):** wrap the existing `<svg>` in `<div style={{ position: "relative" }}>`. Render
   `<OrthoScene view="side" look="flat" viewBox={viewBox} …/>` first (absolutely positioned under the svg), then
   the svg.
   - The svg must have no background fill. Check `.geometry-svg` / `.s2d` in `web/src/styles/stage2d.css`; the page
     background shows through today.
   - The canvas must have exactly the svg's box. Both fill the wrapper; check `.geometry-svg` (fixed height) and the
     cockpit-focus rule `.s2d-wrap > svg.s2d`.
   - `FitBuilderMode.tsx` passes `geo3d` (already computed there) into `Stage2DSide` and `Stage2DFront`.
2. **Side view: delete the drawing from the svg**, keeping the annotations:
   - **delete:** `<Wheel>`, `<DiscBrakes>`, `<DriveSide>`, `<FrameDrawing>`, `<FarCrank>`, `<NearCrank>`,
     `<CockpitDrawing>`, the figure polygons (`polys(fig.…)`, shoes, glove, head);
   - **keep:** `<CockpitSide ghost>`, `<WristMarker>`, skeleton bones/joints, metric arcs, `GhostLines`, KOPS, ideal
     contact crosshairs, warning gaps, the ruler, `BikeFitAnnotations`, `BikeGeometryAnnotations`, `StageOverlay`
     and the debug legend;
   - `buildFigure` is still needed for `bones`/`joints`. Leave its polygon outputs in place if other code uses them;
     check with grep.
3. **Front view (`Stage2DFront`):** same pattern with `view="front" look="flatLit"`. Delete the bike rects, fork,
   hub and rider polygons; keep `CockpitFront` only if it carries annotations (UCI box), otherwise remove it too.
   Then grep for `buildFrontalMannequin`; if it is unused outside the deleted code, delete it and its export.
4. **Debug:** when `debug` is on, `OrthoScene` passes `debug` to `DebugProvider` (the 3D debug materials exist), so
   parts get their debug colours. The SVG legend stays.
5. **One release behind a flag:** keep the old drawing code reachable with `?legacy2d=1` (DEV and prod), so it can
   be compared. Delete it in a follow-up PR after one release. Note this in the PR.
6. **Do not delete** `forkOutline`, `forkFrontOutline`, `spinePath`, `pathSeg` or the `design/` profile tables (they
   are needed for a future SVG export). Delete only drawing code that has no remaining caller; check each with grep
   before deleting.

### Phase 3 checklist
- [ ] Every annotation layer toggles and aligns as before: ANGLES, DIMENSIONS, KOPS, compare ghost, cockpit focus
      zoom (the frustum follows the zoomed viewBox), UCI box.
- [ ] Mobile layout (narrow viewport, 390×844) renders, and the canvas matches the svg box.
- [ ] Expected visual changes are listed in the PR with screenshots: the 2D views now show the 3D rider (hip and
      saddle sit slightly differently; the front rider is no longer the blocky model).
- [ ] `npx tsc --noEmit`, `npm test`, `make test` pass; `slider_profile.py --view side` < 5 ms of our JS per step.

---

## Later (not in scope)

- **SVG export of the drawing:** per part, an outline function next to each mesh builder (the `forkOutline`
  pattern; `spinePath` + `pathSeg` give the torso). For the side view, rigid parts can instead be projected to a
  silhouette once per body shape and moved with an SVG `transform`, since all side-view motion is in-plane. That
  does not work for the front view, where limbs foreshorten.
- **Native React Native app:** reuse the mesh builders and geometry through `@react-three/fiber/native` +
  `expo-gl`, and port the overlay to `react-native-svg`.
