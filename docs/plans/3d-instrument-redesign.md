# 3D view redesign: "Instrument" (implementation plan)

> **This is a sub-plan of `docs/plans/site-redesign.md` (the master plan).** Where they disagree, the master plan
> wins. In particular:
> - Theme, tokens, fonts, `fitMetrics`, the Metric Rail, `CalloutLayer`, `Readout` and `BandGauge` are built once by
>   the Design System track and consumed here. Do not build the local `theme3d.ts` / `useTheme3D` described below;
>   use `useTheme()` + `TOKENS` from `web/src/design/`.
> - The accent is `#FF4F00` (brand direction 01 "Contact", **decided**), via tokens.
> - **Superseded by master plan §5.5:** this plan's §5.2 profile numbers. The rider stays a segmented lathe clay mannequin
>   (as here), reshaped to a Freddy-Ovett-style toned build, with muscles deformed into the limb surfaces
>   (`muscleLimb`) and a tonal Fresnel rim. The §5.3 helmet shell is kept as-is (values `(116, 122, 95)`, offset
>   `(−10, 16, 0)`); vents are not used.
> - **Bike (Phase 6) additions:** a full disc road bike: 52/36 chainrings, front and rear derailleurs, 11-speed cassette,
>   chain through the pulleys, flat-mount calipers, 160/140 rotors on the left, STI hoods + levers, dropped stays,
>   sloping top tube, aero seatpost, bottle + cage. Carbon-black deep rims and black tyres; **no tan walls, no light rim bands**.
>   The reference is `mockups/src/bike3d.js`. Colour tokens (frame "Moss", carbon, alloy, rotor, clay, rim) are in master plan §4.1;
>   the `tanwall` and `rider` tokens in §2 below are obsolete.
> - The phases below map to tracks: Phases 1–3 → track C; Phase 4 → D-api (§4.1–4.4) + D-ui (§4.5–4.7) + C (§4.8);
>   Phases 0, 5 and 6 → track E.

> **Audience:** an implementing agent. Follow the phases **in order**. Each phase ends with a
> checklist and a verification step; do not start the next phase until the current one passes.
> When this plan says "do not", treat it as a hard rule.

---

## 0. Context: why this change exists

FlowFit's 3D view (`web/src/BikeScene3D.tsx`) works, but it looks like a prototype. It uses:
- flat cylinders for the frame,
- capsules and joint balls with a black toon outline for the rider,
- orange joint balls on the bike,
- a dark brown gradient backdrop,
- green, amber and red chips floating in the scene.

The target customer is a data-literate amateur racer: 30–55, UK Cat 2–4, uses TrainerRoad or
TrainingPeaks, buys Pas Normal Studios, MAAP or Rapha. They are nerdy about numbers but not
"gamer" nerdy. They will scrutinise precision and detail.

The chosen design direction is **"Instrument"**: precision as the cool factor.
- It looks like an engineering spec sheet or a high-end product page (Teenage Engineering,
  Nothing, Acronym callouts, Leica calm).
- It uses muted Northern European colours (PNS-like) with **one** hot accent.
- The **change between fits** is the hero: a ghost of the previous fit plus a big numeric delta.

### Decisions already made by the product owner (do not re-litigate)

| Topic | Decision |
|---|---|
| Default theme | **Light** ("Spec Sheet"). Dark ("Instrument") is an alternative theme toggle. |
| Fit history | **Build it.** Saved fits are the basis of the ghost and delta comparison. |
| Big metric readout | Not fixed to one metric. Use the **Metric Rail**: click to focus one metric, Shift/⌘-click to pin up to 3 (spec in Phase 3). |
| Order of work | Pass 1: look (lighting, materials, theme), callouts, metric focus, fit history. Pass 2: anatomical rider (incl. new helmet), then bike shapes. |
| Rejected directions | Lo-fi, VHS, grain, neon, bloom, glowing grids, cartoon or toon shading, black outlines. **Never add these.** |

### Reference images

- `docs/plans/mockups/02-view3d-light.png`: the **default light** 3D view (readout, pinned readouts, spec panel,
  callouts, ruler, Metric Rail, FIT 02 hairline ghost).
- `docs/plans/mockups/03-view3d-dark.png`: the same scene in dark.
- `docs/plans/mockups/01-app-fit-builder-2d-light.png`: the whole app around the stage (shows how the 3D view sits in the page).
- `docs/plans/mockups/src/scene3.js`: the exact recipes used for the images (limb lathe, profiles, head, helmet, bike shapes, lights).

**Notes on the mock-ups:**
1. The elbow follows the app's rule: it lies on the BB side of the shoulder→hands line, so it bends down and back.
   The real app is already correct (`buildMannequin()` in `web/src/geometry.ts`, around lines 260–275).
   **Do not change the IK.** Phase 0 adds a regression test to keep it that way.
2. The mock-up numbers come from simplified geometry (`src/geom.js`). The app's `geometry.ts` is the source of truth.
3. The mock-ups show a 6 mm saddle change: the UI must stay legible at 1–5 mm and 1–3°. At this size the ghost is
   drawn as hairlines only (see §4.8).
4. The camera is on +Z (the rider's left, the near-side leg that fit metrics are measured on), as the app does today.

---

## 1. Hard rules (apply to every phase)

1. **Geometry comes only from the existing point/edge graph.** All positions come from
   `buildGeometry3D()` / `buildMannequin3DPoints()` in `web/src/geometry.ts`. Only change *how*
   points and edges are skinned (meshes and materials), never *where* they are. The 2D and 3D
   views must keep agreeing by construction (see `CLAUDE.md`).
2. **Do not touch** `bikegeo_core/` IK or solver code, `circleIntersections` selection rules,
   or `buildMannequin()`. The only exception is tests.
3. **No fonts or scripts from CDNs inside the 3D view.** A comment in `FitAnalytics3D.tsx` notes
   the CSP blocks CDN font fetches. Self-host fonts via `@fontsource/*` npm packages.
4. **The frontal-area probe must stay correct.** `FrontalAreaProbe` in `web/src/AeroTools.tsx`
   treats every mesh that is not under a group named in `NON_AERO_GROUP_NAMES` as "bike". Every
   new non-bike mesh (ground, backdrop, lights helpers, ghost, callouts) **must** live under a
   group whose name is in `NON_AERO_GROUP_NAMES`. Phase 1 adds `"stage-root"` to that set.
5. **The group names `mannequin-root`, `mannequin-legs`, `analytics-root` and `ghost-root` are
   an API.** Keep them.
6. **Pedalling animation must keep working.** `AnimatedLegs.tsx` owns the leg meshes when a
   stroke LUT exists. Any change to how legs look must be made in **both** the static path
   (`MannequinPartMesh`) and `AnimatedLegs`. Phase 5 makes them share one builder.
7. Keep the code style: TypeScript, functional React components, `useMemo` for geometry, and
   dispose geometries you create imperatively. No ESLint or Prettier config exists; match the
   surrounding formatting.
8. **No new colours outside the token tables in §2.** Do not hardcode hex values in components.
   Read them from the theme object.
9. **Commit after each phase** with a clear message. Run all verification commands before
   committing.

### Commands

```bash
make install && make web-install      # once
make test                             # Python tests (backend + core)
cd web && npx tsc --noEmit            # TypeScript check (required after every phase)
make api   # terminal 1  (FastAPI :8000)
make web-dev  # terminal 2 (Vite :5173)
```

### Screenshot verification (use at the end of every phase)

There are no frontend tests. Verify visually with Playwright against the dev server, using the
pre-installed Chromium (`executablePath: '/opt/pw-browsers/chromium'`; do **not** run
`playwright install`). Write the script in a scratch directory, not the repo:

```js
// shoot.mjs: npm i playwright-core in a scratch dir, then: node shoot.mjs
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => console.log('PAGE ERROR', e.message));
await p.goto('http://localhost:5173/');
// switch to the 3D view: FitBuilderMode shows 3D when its `view` state is "3d"; find the
// button that calls setView("3d") in FitBuilderMode.tsx and click it by its label, then:
await p.waitForTimeout(4000);
await p.screenshot({ path: 'phase-N.png' });
await b.close();
```

Compare each screenshot against the mock-ups and the phase's acceptance list. Zero `PAGE ERROR`
lines are allowed.

---

## 2. Design tokens (single source of truth)

Create **`web/src/theme3d.ts`**, which exports `THEMES_3D: Record<"light" | "dark", Theme3D>`,
the type `Theme3D`, and the hook `useTheme3D()` (see Phase 1). **Every** 3D colour and material
parameter comes from here.

| Token | Light ("Spec Sheet", default) | Dark ("Instrument") | Used for |
|---|---|---|---|
| `bg` | `#E6E1D8` | `#111213` | scene background + fog colour |
| `floor` | `#E0DBD1` | `#060607` | ground plane |
| `ink` | `#161616` | `#E8E6E1` | hairlines, callout text, primary numbers |
| `muted` | `#6B655D` | `#8B8984` | labels, units, secondary text |
| `faint` | `rgba(22,22,22,0.18)` | `rgba(232,230,225,0.16)` | table rules, ruler minor ticks |
| `accent` | `#F03500` | `#FF5A1F` | **only** the focused metric + deltas + ghost |
| `ghost` | `accent` @ opacity 0.20 | `accent` @ opacity 0.22 | previous-fit ghost |
| `bandIn` | `#1E7D43` | `#3FB67A` | status dot "in band" |
| `bandNear` | `#B8860B` | `#E0B341` | status dot "near" |
| `bandOut` | `#C02828` | `#FF6B6B` | status dot "out" |
| `frame` | `#2D4A53` (petrol) | `#DCD8D0` (off-white) | frame paint |
| `frameMat` | roughness 0.42, clearcoat 0.35, clearcoatRoughness 0.35, metalness 0.1 | roughness 0.38, clearcoat 0.6, clearcoatRoughness 0.25, metalness 0.1 | `meshPhysicalMaterial` |
| `alloy` | `#1D2023`, metalness 0.7, roughness 0.42 | `#17181A`, metalness 0.75, roughness 0.38 | stem, bar, seatpost, cranks |
| `rubber` | `#1B1B1B`, roughness 0.95 | `#151515`, roughness 0.95 | tyres, hoods, saddle |
| `tanwall` | `#B89468`, roughness 0.9 | `#8E7456`, roughness 0.9 | tyre sidewall band |
| `spoke` | `#2A2D31`, metalness 0.8, roughness 0.4 | `#2C2E31`, metalness 0.8, roughness 0.35 | spokes, hubs |
| `rider` | `#A89E91`, roughness 0.88, sheen 0.4, sheenColor `#FFFFFF` | `#7D8085`, roughness 0.72, sheen 0.5, sheenColor `#CFD6DE` | rider "clay" |
| `riderKit` | `#8F857A` (same material params as `rider`) | `#5E6166` | jersey/shorts tone (Phase 5 only) |
| `helmet` | `#EFEBE4`, roughness 0.35, clearcoat 0.8 | `#1C1D1F`, roughness 0.35, clearcoat 0.8 | helmet shell, shoes |

- **Accent note:** `#F03500` is already the brand `--accent` in `web/src/App.css`. Keep it.
- **Band colours:** `BAND_COLORS` in `FitAnalytics3D.tsx` currently hardcodes `#2ecc71 / #e6a817 / #e74c3c`.
  Replace their usages with the theme's `bandIn / bandNear / bandOut`.

### Typography

Install: `cd web && npm i @fontsource/geist @fontsource/geist-mono @fontsource/doto`.
Import in `web/src/main.tsx`:
```ts
import "@fontsource/geist/500.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/doto/800.css";
```

| Role | Font | Size / tracking |
|---|---|---|
| Big focused readout | **Doto 800** (dot-matrix) | 104 px desktop / 64 px < 768 px wide |
| Medium readouts (pinned metrics) | Geist 500 | 40 px, letter-spacing −0.02em |
| Labels / eyebrows | Geist Mono 400, UPPERCASE | 11 px, letter-spacing 0.16em, colour `muted` |
| Values in tables/callouts | Geist Mono 500 | 12.5–13 px, `font-variant-numeric: tabular-nums` |
| Part codes (J3, C2) | Geist Mono 500 in an inverted chip (bg `ink`, text `bg`; focused → bg `accent`) | 11 px |

Units are always shown and always in `muted` (`mm`, `°`). Numbers never jump width: always use
tabular numbers.

---

## Phase 0: Guard rails (small, do first)

1. **Elbow regression test (Python).** In `tests/test_pose2d_invariants.py`, add
   `test_elbow_points_toward_bb_2d`. Use the existing `_feasible_2d_joints()` helper, then:
   - Compute the signed side of the elbow relative to the line shoulder→hand:
     `side(P) = (hx-sx)*(P.y-sy) - (hy-sy)*(P.x-sx)`.
   - Assert `sign(side(elbow)) == sign(side(BB=(0,0)))`.
   - Also assert `elbow.y < max(shoulder.y, hand.y)` (the elbow is not above the arm line).
2. **Frontend helper.** Add a pure function `elbowPointsTowardBB(m: MannequinSketch): boolean` in
   `web/src/geometry.ts`, next to `buildMannequin`, that performs the same check. It is unused
   for now; Phase 5 uses it in a dev-mode assertion.
3. Run `make test` and `cd web && npx tsc --noEmit`. Commit: "Add elbow-direction regression test".

---

## Phase 1: Stage, lighting, materials, theme (the "look")

**Goal:** the default render matches the *lighting and material feel* of
`02-view3d-light.png`. This phase adds no new overlays.

### 1.1 Dependencies

`cd web && npm i @react-three/postprocessing@^2.19.1 postprocessing@^6.39.5`
(v2 is the line that supports React 18 + R3F v8, which this repo uses. **Do not** install v3.)

### 1.2 Theme plumbing: `web/src/theme3d.ts`

- Define `Theme3D` with every token from §2. Material tokens are plain objects,
  e.g. `frameMat: { color, roughness, clearcoat, clearcoatRoughness, metalness }`.
- `useTheme3D()` returns `[themeName, setThemeName]`. It persists to `localStorage` key
  `flowfit.3d.theme`, default `"light"`. Wrap every localStorage read and write in `try/catch`.
- In `BikeScene3D`, hold the theme state and pass `theme: Theme3D` down into `SceneContent`.
  Pass it as a prop, not through context, because `SceneContent` is memoised and props keep that
  explicit.
- Add a toolbar button (existing first toolbar row, right side, before "Dev"): label `Light` /
  `Dark`, class `tab-pill`.

### 1.3 Replace material constants in `BikeScene3D.tsx`

The module-level JSX constants (`FRAME_MATERIAL`, `COCKPIT_MATERIAL`, `MANNEQUIN_BODY_MATERIAL`,
`MANNEQUIN_JOINT_MATERIAL_ELEM`, `MANNEQUIN_OUTLINE_MATERIAL`, `TYRE_MATERIAL`, `RIM_MATERIAL`,
`SPOKE_MATERIAL`, `ACCENT_MATERIAL`, `CRANK_MATERIAL`, `HOOD_MATERIAL`, `GROUND_MATERIAL`,
`JOINT_MATERIAL`) are theme-independent today. Replace them with this pattern:

```tsx
// Build once per theme; share instances (do not create a material per mesh).
function useMaterials3D(theme: Theme3D) {
  const mats = useMemo(() => ({
    frame: new THREE.MeshPhysicalMaterial({ ...theme.frameMat }),
    alloy: new THREE.MeshPhysicalMaterial({ ...theme.alloy }),
    rubber: new THREE.MeshStandardMaterial({ ...theme.rubber }),
    tanwall: new THREE.MeshStandardMaterial({ ...theme.tanwall }),
    spoke: new THREE.MeshStandardMaterial({ ...theme.spoke }),
    rider: new THREE.MeshPhysicalMaterial({ ...theme.rider }),
    helmet: new THREE.MeshPhysicalMaterial({ ...theme.helmet }),
  }), [theme]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}
```

Use it as `<mesh material={mats.frame}>…</mesh>`. Pass `mats` to the child components
(`TubeMesh`, `Wheel3D`, `Drivetrain3D`, `Hoods3D`, `SaddleMesh`, `HandlebarMesh`,
`MannequinPartMesh`, `AnimatedLegs`) as a prop.

Specific changes:
- **Delete the inverted-hull outline** from `MannequinPartMesh` and `MannequinSphereMesh`: remove
  every `<mesh scale={OUTLINE_SCALE…}>` child and `MANNEQUIN_OUTLINE_MATERIAL`. Keep
  `OUTLINE_SCALE` only if something else still uses it; otherwise delete it too. The frontal-area
  probe's `isOutline` check can stay (it becomes a harmless no-op).
- **Delete `<JointSpheres>`** from the render (the orange balls at BB, axles and head tube). Keep the
  function only if dev mode uses it; otherwise remove it.
- Joint spheres and limbs both use `mats.rider` (one clay material, no two-tone).
- `ACCENT_MATERIAL` (the old orange rim stripe): remove the stripe. Accent is reserved for metrics.
- Tyres: add a **tan-wall band**. That is a second, thinner torus
  (`radius = wheelRadius - 26`, `tube = 7`) using `mats.tanwall`, inside the tyre torus. Look at
  `Wheel3D` to find the tyre torus args and mirror them.
- Update `AnimatedLegs.tsx` to take `material` props instead of its own hardcoded materials. Look
  for its `<meshStandardMaterial` usages.

### 1.4 Stage and lighting (in `SceneContent`)

Replace the lighting block (the `ambientLight`, two `directionalLight`s, `Environment` with
`Lightformer`s, the ground `circleGeometry` and `ContactShadows`) with:

```tsx
<color attach="background" args={[theme.bg]} />
<fog attach="fog" args={[theme.bg, camDist * 1.6, camDist * 3.5]} />
<group name="stage-root">
  <hemisphereLight args={[theme.name === "light" ? "#FFFAF2" : "#D9E2EC",
                          theme.name === "light" ? "#B3A898" : "#0B0B0C",
                          theme.name === "light" ? 0.9 : 0.55]} />
  <directionalLight /* key: soft top light, casts shadows */
    position={[center[0] + 600, center[1] + 3200, center[2] - 700]}
    intensity={3.0} color="#FFF1DE" castShadow
    shadow-mapSize={[quality === "high" ? 4096 : 2048, quality === "high" ? 4096 : 2048]}
    shadow-bias={-0.0004} shadow-radius={quality === "high" ? 10 : 4}
    shadow-camera-left={-span} shadow-camera-right={span}
    shadow-camera-top={span} shadow-camera-bottom={-span}
    shadow-camera-near={100} shadow-camera-far={9000} />
  <directionalLight /* rim: separates silhouette from background */
    position={[center[0] - 1600, center[1] + 900, center[2] + 1600]}
    intensity={theme.name === "light" ? 1.0 : 2.2} color="#DFE8F2" />
  <Environment resolution={128} frames={1}>{/* keep the existing 3 Lightformers, intensities ×0.5 */}</Environment>
  <mesh rotation-x={-Math.PI / 2} position={[groundX, groundY - 1, 0]} receiveShadow>
    <planeGeometry args={[40000, 40000]} />
    <meshStandardMaterial color={theme.floor} roughness={1} metalness={0} />
  </mesh>
</group>
```

- `span` = `sceneBounds(geo).span` (already computed in `BikeScene3D`; pass it down).
- **Directional light targets:** a directionalLight aims at its `target` object, which defaults to
  the origin (the BB). That is fine here because the BB is near the scene centre. If shadows look
  clipped, add `<object3D ref={targetRef} position={center} />` and set `light.target = targetRef.current`.
- Set `castShadow` and `receiveShadow` on **every** bike and rider mesh. The simplest way is a
  `useLayoutEffect` in `SceneContent` that traverses the `mannequin-root`, `mannequin-legs` and bike
  groups after each geometry change and sets both flags. Alternatively add the props per mesh.
- `<Canvas>` in `BikeScene3D`:
  - add `shadows`;
  - change `gl` to `{ antialias: true, alpha: false, toneMapping: THREE.AgXToneMapping, toneMappingExposure: theme.name === "light" ? 1.05 : 1.15 }`;
  - set `camera.fov` to **30** (was 45) for a flatter, product-shot perspective, and recompute
    `camDist` in the `useMemo` from `tan(15°) ≈ 0.268` instead of `0.414`.
- CSS: in `web/src/App.css`, `.bike3d-canvas-wrapper` currently has a brown `radial-gradient`
  background. Replace it with `background: var(--bike3d-bg)`, and set `--bike3d-bg` inline on
  the wrapper from `theme.bg`.

### 1.5 Ambient occlusion and quality toggle

```tsx
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
...
{quality === "high" && (
  <EffectComposer multisampling={0}>
    <N8AO aoRadius={120} intensity={2.2} distanceFalloff={1} halfRes={false} />
    <SMAA />
  </EffectComposer>
)}
```
- Units are mm, so `aoRadius` 120 means 12 cm. Tune within 80–160 until the contact AO at
  crotch/saddle, armpits and tube junctions is visible but subtle. Compare against the mock-up.
- `quality` state lives in `BikeScene3D`: `"high" | "low"`. Persist it in localStorage
  (`flowfit.3d.quality`, with try/catch). Default to `"low"` when
  `window.matchMedia("(max-width: 768px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4`,
  otherwise `"high"`.
- Add a toolbar button `HQ` (active state = high).
- If `N8AO` is not exported by the installed version (check with `tsc`), use `SSAO` from the same
  package with `radius={0.12} intensity={25}`, and say so in the commit message.

### 1.6 Protect the frontal-area probe and GLB export

- In `web/src/AeroTools.tsx`: `NON_AERO_GROUP_NAMES = new Set(["analytics-root", "ghost-root", "stage-root"])`.
- In the probe's `measure()`: save `scene.fog`, set `scene.fog = null` before `gl.render`, and restore
  it in `finally`. Otherwise fog darkens the white silhouette and breaks the `> 128` threshold.
- In `SceneExporter`: before `exporter.parse`, find `scene.getObjectByName("stage-root")`, set
  `visible = false`, then restore it in both callbacks. `GLTFExporter` defaults to `onlyVisible: true`.

### Phase 1 acceptance

- [ ] Light theme is the default; the toggle switches to dark and persists across reloads.
- [ ] No outlines, no orange joint balls, no brown gradient.
- [ ] The rider and bike cast soft shadows on the floor, and the rider's arms and torso shade the frame.
- [ ] The floor fades into the background with no visible horizon line (fog equals bg).
- [ ] Frontal area with "+ Bike" off matches the pre-change value within ±1% (measure before and after on the default fit and write both numbers in the commit message).
- [ ] GLB export still downloads, and re-importing it via dev mode shows no giant floor plane.
- [ ] `HQ` off: no AO, and shadow map 2048.
- [ ] `npx tsc --noEmit` clean; `make test` green; screenshot taken in both themes.

---

## Phase 2: Spec-sheet overlays and callouts

**Goal:** replace the floating green/amber/red chips with the spec-sheet language: hairlines,
part-coded callouts, a spec panel and a ground ruler.

### 2.1 Metric registry: new file `web/src/fitMetrics.ts`

This is the single definition of every fit metric. The HUD, callouts, Metric Rail (Phase 3) and fit
history (Phase 4) all read it. **Move** the maths out of `MetricsHud` into here; do not duplicate it.

```ts
export type MetricId =
  | "knee_ext_bdc" | "knee_flex_tdc" | "hip" | "trunk" | "shoulder" | "elbow_flex"
  | "kops" | "saddle_height" | "setback" | "drop" | "reach";

export interface MetricDef {
  id: MetricId;
  code: string;          // part code shown in chips: J1..J6 joints, C1..C5 contact/components
  label: string;         // "Knee extension · BDC"
  short: string;         // "KNEE EXT"
  unit: "°" | "mm";
  bandKey?: keyof PosturePreset;  // for band status; undefined → no status dot
  /** Returns null when the metric cannot be computed (e.g. no stroke LUT). */
  compute: (ctx: MetricCtx) => number | null;
  /** 3D anchor for the callout leader line (world mm). */
  anchor: (ctx: MetricCtx) => [number, number, number] | null;
  /** Optional arc rays (vertex, rayA, rayC) in 2D sagittal coords for angle metrics. */
  arc?: (ctx: MetricCtx) => { v: ContactPoint; a: ContactPoint; c: ContactPoint } | null;
}
export interface MetricCtx {
  m: MannequinSketch;               // 2D mannequin
  lut?: PedalStrokeLUT;
  pts: Map<string, [number, number, number]>;  // geo.points by name
}
export const METRICS: MetricDef[] = [ /* order = rail order */ ];
export function computeAll(ctx: MetricCtx): Partial<Record<MetricId, number>>;
```

Use the existing formulas exactly (they are in `MetricsHud` and `DimensionLines3D`):

| id | code | compute | anchor |
|---|---|---|---|
| knee_ext_bdc | J3 | `180 - lut.kneeFlexionBdcDeg` | `knee_l` point |
| knee_flex_tdc | J4 | `lut.kneeFlexionTdcDeg` | `knee_r` point |
| hip | J2 | `angleAtPoint(m.shoulder, m.hip, m.knee)` | `hip_l` |
| trunk | J1 | `atan2(shoulder−hip)` in degrees | `spine_joint` |
| shoulder | J5 | `angleAtPoint(m.hip, m.shoulder, m.elbow)` | `shoulder_l` |
| elbow_flex | J6 | `180 - angleAtPoint(m.shoulder, m.elbow, m.hands)` | `elbow_l` |
| kops | C5 | `lut.kopsOffsetMm` | `knee_l` (projected) |
| saddle_height | C1 | `saddle.y` (BB-relative, as `DimensionLines3D`) | `saddle` |
| setback | C2 | `-saddle.x` | `saddle` |
| drop | C3 | `saddle.y - mean(hoods_l.y, hoods_r.y)` | `hoods_l` |
| reach | C4 | `mean(hoods.x) - saddle.x` | `hoods_l` |

Then refactor `MetricsHud` to render from `METRICS` + `computeAll`. At the end of Phase 2 the HUD
is removed and replaced by the spec panel, but refactor it first so nothing regresses mid-phase.

### 2.2 Callouts: new file `web/src/Callouts3D.tsx`

A DOM overlay (absolutely positioned `div` over the canvas, like `MetricsHud`). It is **not**
drei `<Html>` per label, because a single overlay is crisper and lets you avoid overlaps.

- Inside the Canvas, a small component `ScreenProjector` runs in `useFrame`, throttled to
  ~15 Hz. For each visible metric anchor, it projects to screen pixels:
  `v.clone().project(camera)` → `x=(v.x+1)/2*w, y=(1-v.y)/2*h`. It writes the results into a ref
  that the DOM overlay reads, via a `setState` at the same throttle.
- Each callout is:
  - a 3 px dot at the anchor;
  - a 1 px leader polyline (diagonal, then horizontal for 110 px);
  - a label: `[CODE chip] SHORT value unit`, e.g. `[J3] KNEE EXT 150°`.
  Draw leaders in one full-size `<svg>` with `pointer-events: none`.
- **Placement:** each metric has a preferred direction (`dx, dy` in px). Joints on the rider's
  back (trunk, hip) go up-right. Arms (elbow, shoulder) go up-left. Knee goes down-right. Cockpit
  (drop, reach) goes up-left. Saddle goes right. Then run a simple overlap pass: sort labels by y;
  if a label's box intersects a previous one, push it down by the overlap + 6 px. Clamp to the
  canvas with 24 px insets. Hide a callout whose anchor is behind the camera (`v.z > 1`).
- **Visibility rule:** by default show callouts only for the **focused and pinned** metrics
  (Phase 3). Until Phase 3 exists, show knee_ext_bdc, trunk and elbow_flex.
- Colours: leader and dot use `ink` at 70% opacity. For the focused metric they use `accent` at
  100%, and the code chip background becomes `accent`.

### 2.3 In-scene hairlines (replace `JointArc` styling)

In `FitAnalytics3D.tsx`:
- `JointArc` / `KneeArcAnimated`: change from a 6 mm-thick filled ring to a **hairline** arc,
  using `<Line lineWidth={1}>` from drei with the same arc sampling. Also draw two short 170 mm ray
  segments from the vertex along both rays. Colour: `accent` if the metric is focused, else `ink`
  at 55% opacity.
- **Remove** the `<Html>` chip labels from `JointArc` and `DimLine`. The DOM callouts replace them.
- `DimLine`: 1 px `ink` line with 2 px end ticks (short perpendicular lines) instead of spheres.
  Remove `DIM_COLOR` / `KOPS_COLOR` hex constants and use theme tokens (`KOPS` → `muted`).
- All analytics lines stay under `analytics-root`, with `depthTest={false}` and
  `renderOrder={9}` so they draw over the rider.

### 2.4 Ground ruler (new component in `FitAnalytics3D.tsx`: `GroundRuler`)

- Lies on the floor (`y = groundY + 1`) at `z = -(stanceWidth/2 + 260)` (drive side, in front of
  the camera's default ¾ view).
- Runs from `rear_axle.x` rounded down to 50 mm, to `front_axle.x` rounded up.
- Ticks every 25 mm (length 30 mm, `faint`), and every 100 mm (length 70 mm, `ink` 70%).
- Accent ticks (length 160 mm) at rear axle, BB (x=0) and front axle.
- DOM labels (via the same projector): `R.AXLE`, `BB 0`, `F.AXLE · WB {wheelbase}` in Geist Mono
  10 px, colour `muted`.
- Toggled with the existing **Dimensions** button (with dimension lines).

### 2.5 Spec panel and header (replace `MetricsHud`)

New `SpecPanel` DOM overlay, top-right of the canvas wrapper, 290 px wide (see
`02-view3d-light.png`):
- Section `COMPONENTS`: rows `Saddle height`, `Saddle setback`, `Stem` (`{len} × {angle}` with unit
  `mm·°`), `Spacers`, `Crank`. The values come from `geo.components`; look at the keys in
  `Components` in `types.ts`.
- Section `FRAME`: `Stack / Reach`, `Seat / Head` angles, from `geo.frame`.
- A black bar (`ink` bg, `bg` text) with `DROP  {n} mm`.
- Row layout: `grid-template-columns: 1fr auto 44px` (label, value, unit). Rules are 1 px `faint`.
- Header, top-left of the canvas: `FLOWFIT` (Geist 700, 20 px) + meta line in Geist Mono
  `FIT {n or "—"} · {preset name uppercase} · {dd.mm.yy}`.
- Footer, bottom-left: band legend `● IN BAND ● NEAR ● OUT` in the band colours. Bottom-right: a
  camera readout in `muted`, e.g. `VIEW ¾ · FOV 30 · UNITS MM`.
- On screens narrower than 768 px: the spec panel collapses into a "Specs" pill that opens it as
  a bottom sheet. The header stays; the footer is hidden.

### 2.6 Toolbar restyle

The three toolbars above the canvas are styled for a dark background (`App.css` `.bike3d-toolbar
…`). Re-theme them with CSS variables set from the theme on `.bike3d-container`
(`--b3-ink`, `--b3-muted`, `--b3-faint`, `--b3-bg`, `--b3-accent`):
- Pills: transparent bg, 1 px `faint` border, `ink` text, Geist Mono 11 px uppercase with
  0.12em tracking. Active pill: `ink` bg, `bg` text.
- Keep every existing control; only the styling changes.

### Phase 2 acceptance

- [ ] No green/amber/red chips remain in the 3D scene. Band status appears only as small dots.
- [ ] Callouts never overlap each other and never leave the canvas at the three camera presets.
- [ ] The spec panel numbers equal the 2D view's numbers for the same fit (spot-check saddle height, setback, drop).
- [ ] Ruler wheelbase = `front_axle.x − rear_axle.x` rounded.
- [ ] Mobile width (390 px): panel collapses; nothing overflows horizontally.
- [ ] tsc clean, tests green, screenshots in light + dark at side, ¾ and front presets.

---

## Phase 3: Metric Rail (focus one metric, or pin several)

**Problem:** the product owner is unsure whether the big readout should be fixed. Solution:
the rider chooses, and the choice is fast.

### 3.1 Interaction spec

- A horizontal **Metric Rail** sits along the bottom edge of the canvas (above the footer).
  There is one chip per `METRICS` entry that has a non-null value. Each chip shows:
  `[CODE] SHORT  value unit  ●(band dot)`.
- **Click** a chip → that metric becomes **focused** (single). **Click again** → unfocus, falling
  back to the default `knee_ext_bdc`.
- **Shift-click or ⌘/Ctrl-click** → **pin** or unpin the metric. At most 3 pinned. Pinning a 4th
  replaces the oldest pin and flashes that chip briefly (150 ms opacity pulse).
- **Keyboard** (when the canvas wrapper has focus; give it `tabIndex={0}`): `1`–`9` focuses the Nth
  rail metric, `Shift+1..9` pins it, `Esc` clears pins and resets focus to the default.
- **Click a joint in 3D** → focuses the matching joint metric. Implement it with invisible hit
  spheres (radius 45 mm, `visible={false}` material but still raycastable: use
  `<meshBasicMaterial transparent opacity={0} depthWrite={false} />`) at each `anchor`, under
  `analytics-root`, with R3F `onClick` / `onPointerOver` (cursor → pointer). On hover, show that
  metric's callout at 60% opacity even when it is not focused.
- State lives in `BikeScene3D`: `focused: MetricId`, `pinned: MetricId[]`. Persist it to
  localStorage `flowfit.3d.metrics` (try/catch).

### 3.2 Readout area (top-right, above the spec panel; the panel shifts down)

- **Only focused, none pinned:** eyebrow label (Geist Mono 11 px, `muted`), then the value in
  **Doto 800 at 104 px** with a `°`/`mm` unit superscript in `muted`. Below that:
  - a **band gauge**: an 8 px track (`faint`), with the band's `[min,max]` segment filled `ink`
    and a 2 px × 20 px `accent` marker at the current value. The track range is band ± 1.5 × band
    width. Tick labels at min, max and the track ends (Geist Mono 10 px).
  - the delta line (Phase 4; hidden until then).
- **Pinned ≥ 1:** the big readout shows the focused metric. Below it, pinned metrics are listed
  as **medium readouts** (Geist 500, 40 px), each with an eyebrow and a mini gauge (4 px track).
- Values animate when they change: tween over 180 ms (ease-out). While tweening, round to the
  displayed precision (integers for ° and mm; KOPS uses signed integers).
- Callouts (Phase 2) show focused + pinned metrics only. The focused one is accent-coloured.

### 3.3 Where the old HUD toggle goes

Remove the `HUD` toolbar button. The rail + readout replace it. Keep `Angles` (arcs on/off),
`Dimensions` (dim lines + ruler on/off) and `KOPS`.

### Phase 3 acceptance

- [ ] Click, Shift-click, keys `1`–`9`, `Esc` and joint click all behave as specified.
- [ ] The big number never changes width while tweening (tabular figures / monospace).
- [ ] The rail scrolls horizontally on mobile; there is no page-level horizontal scroll.
- [ ] Knee extension shown in the readout equals the 2D view's value for the same fit.

---

## Phase 4: Fit history + ghost + delta

**Goal:** save fits, pick one to compare against, and show a ghost rider plus deltas on every metric.

### 4.1 Backend: model (`bikegeo_api/models_db.py`)

Add a model following the `Bike` pattern:

```python
class Fit(Base):
    __tablename__ = "fit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    schema_version: Mapped[int] = mapped_column(nullable=False, default=1)
    inputs_json: Mapped[dict] = mapped_column(JSON, nullable=False)    # to restore the fit
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False)  # to compare without recompute
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    user: Mapped[User] = relationship(back_populates="fits")
```

Add `fits: Mapped[list["Fit"]] = relationship(back_populates="user", cascade="all, delete-orphan")`
to `User`. There are no migrations: `init_db()` → `create_all` creates the new table on startup.
Existing dev DBs (`bikegeo.db`) gain the table automatically because it is a *new* table.

### 4.2 Backend: schemas (`bikegeo_api/schemas_fits.py`, new)

Pydantic v2 models (match the style of `schemas_catalog.py`):
- `FitIn`: `name: str` (1–120 chars, stripped), `inputs: dict`, `snapshot: FitSnapshot`.
- `FitSnapshot`:
  - `metrics: dict[str, float]` (keys must be the `MetricId` strings);
  - `mannequin_points: list[SnapPoint]` (max 64 items);
  - `components: dict[str, float | None]`;
  - `frame_label: str | None`.
- `SnapPoint`: `name: str` (max 40), `pos: tuple[float, float, float]`.
- `FitSummary`: `id, name, created_at, metrics, frame_label`. The list endpoint returns summaries
  only (no points, no inputs).
- `FitOut`: all fields.
- `FitRename`: `name`.

**Size:** `RequestSizeLimitMiddleware` caps requests at 64 KB. A snapshot is ~25 points plus ~11
metrics plus inputs, which is about 5–10 KB. Fine, but add a test that a maximal payload stays
under 64 KB.

### 4.3 Backend: router (`bikegeo_api/routers/fits.py`, new; include in `main.py`)

All routes use `Depends(current_user)`. **Every query filters by `user_id == user.id`.** Another
user's fit must return **404** (not 403), so fits cannot be enumerated.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/fits` | list own fits newest-first → `{"fits": [FitSummary]}` (limit 200) |
| POST | `/fits` | create → 201 `FitOut` |
| GET | `/fits/{id}` | own fit → `FitOut`, else 404 |
| PATCH | `/fits/{id}` | rename → `FitOut` |
| DELETE | `/fits/{id}` | 204 |

Vite proxy: `/solve` is proxied to :8000 per `CLAUDE.md`. Check `web/vite.config.ts` and add
`/fits` to the proxy config exactly the way `/bikes` and `/auth` are configured.

### 4.4 Backend tests (`bikegeo_api/tests/test_fits.py`, new)

Copy the `_register` helper pattern from `test_bikes.py`. Cover:
1. unauthenticated → 401 on all routes;
2. create → list shows it, and the summary has no `inputs`;
3. get own → 200; get other user's → 404; delete other user's → 404;
4. rename; delete; list is empty afterwards;
5. validation: empty name → 422; 65 points → 422;
6. ordering is newest first (create two, compare).

Run `make test`.

### 4.5 Frontend: API + hook

- `web/src/fits/api.ts`: `listFits`, `getFit`, `createFit`, `renameFit`, `deleteFit`. Copy the
  `jsonOrThrow` pattern from `web/src/catalog/api.ts` and use `credentials: "include"`.
- `web/src/fits/useFitHistory.ts`: holds `fits: FitSummary[]`, `compareTo: FitOut | null`, and
  `loading` / `error`. It loads when `useAuth().user` is set and clears on logout.
- **Signed-out users:** the Save button reads `Sign in to save fits` and links to `/login`.
  Session-only comparison still works through the existing **Snapshot ghost** button (see 4.7).

### 4.6 Capturing a fit (in `FitBuilderMode.tsx`)

- `inputs`: an object with every piece of state needed to restore the builder:
  `selection, components, tyreSize, riderFit, preset, trunkAngleOverride, backBendOverride,
  hoodPresetId, bodyMeasurements, pedalPresetId, shoePresetId, fitMode, targetSaddleHeightMm`.
  These are the `useState`s near the top of `FitBuilderMode`, around lines 165–201. Add
  `inputs.v = 1`.
- `snapshot.metrics`: `computeAll(ctx)` from `fitMetrics.ts`.
- `snapshot.mannequin_points`: `geo3d.points.filter(p => p.group === "mannequin")` with
  **legs at crank 0°** (the static pose already in `geo3d`).
- `snapshot.components`: `components`. `frame_label`: brand + model + size of the selected frame.
- **Restore** ("Load" in the history menu): set each piece of state from `inputs`. Guard against
  missing keys (use defaults) and ignore unknown ones.

### 4.7 UI

In the 3D view's top-left header area, next to `FIT n`:
- **`Save fit`** button → a small inline name input (default `Fit {n+1} · {preset}`) → Enter saves.
- **`Compare ▾`** menu: `None`, `Session snapshot` (only if one exists), then saved fits newest
  first (`name · dd.mm · knee 148°`). Each row has `Load` and `Delete` (confirm first) actions.
- The ProfilePage gains a **"My fits"** section listing them (name, date, frame, key metrics),
  with Load (navigates to `/` with `?fit={id}`, and FitBuilderMode loads it on mount) and Delete.

### 4.8 Ghost + deltas

- Unify both sources into one type, `CompareTarget = { label, metrics, points, edges }`:
  - the existing session snapshot (`takeSnapshot` in `BikeScene3D.tsx`);
  - a saved fit (points from `snapshot.mannequin_points`, edges = the mannequin edges of the
    current `geo`, because edge topology is constant).
- `GhostMannequin` (`AeroTools.tsx`): restyle its material to
  `color = theme.accent, opacity = 0.20 (light) / 0.22 (dark), depthWrite: false`.
  **Only draw the ghost where it differs:** skip ghost parts whose endpoints are all within 2 mm
  of the current rider's points (otherwise the whole body tints orange). Use the Phase 5 limb
  builder once it exists; until then the capsule is fine.
- Also draw 1 px `accent` hairlines for the ghost's drive-side leg and torso (like
  `03-view3d-dark.png`), under `ghost-root`.
- **Deltas:** for each metric, `delta = current − compare.metrics[id]`.
  - The readout shows `▲ 3°` or `▼ 2 mm` (`accent`), then `vs {label} ({old value})` in `muted`.
    Hide it when `|delta| < 0.5`.
  - The rail chip shows a small `+3`/`−2` suffix in `accent`.
  - The gauge shows a second, 40%-opacity marker at the old value.
  - The spec panel rows show a `+n`/`−n` accent suffix column when component values differ.
- **Small-delta legibility:** if every ghost displacement is under 6 mm, draw 1 px accent hairlines
  only, without the translucent ghost body, because a 4 mm ghost is unreadable as volume.

### Phase 4 acceptance

- [ ] Backend tests pass (`make test`).
- [ ] Save → reload page → Compare lists the fit → the ghost and deltas appear.
- [ ] Load restores every control in FitBuilder exactly (visually diff the 2D view before/after).
- [ ] Another account cannot see or load my fits (check manually with two browsers).
- [ ] With only a 3 mm saddle change, the delta reads `▲ 3 mm` and hairlines are visible.
- [ ] The frontal-area probe ignores the ghost (it is under `ghost-root`).

---

## Phase 5: Anatomical rider + new helmet (second pass, part 1)

**Goal:** replace the capsule mannequin with a believable, neutral "tailor's dummy" figure. Keep
the same joints; only the skinning changes.

### 5.1 One shared limb builder: `web/src/riderMesh.ts` (new)

```ts
/** Lathe along +Y with rounded caps. prof(t) = radius at t∈[0,1] along the bone. */
export function limbGeometry(len: number, prof: (t: number) => number,
                             seg = 28, lat = 40): THREE.LatheGeometry;
/** Orient a mesh/group so local +Y runs from a to b. */
export function orientBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void;
```

Algorithm for `limbGeometry`:
- Build 2D profile points `(r, y)`:
  1. a bottom cap quarter-circle of radius `prof(0)` (9 samples, from angle −90° to 0°, centred at y=0);
  2. body samples `t = i/seg`, `r = prof(t)`, `y = t*len`;
  3. a top cap quarter-circle of radius `prof(1)` centred at y=len.
- Then call `new THREE.LatheGeometry(points, lat)` and `computeVertexNormals()`.
- For **elliptical** cross-sections, call `geometry.scale(sx, 1, sz)` *before* orienting. After
  `orientBetween` in the sagittal plane, local Z stays world Z (lateral), because the rotation
  axis is Z.

Both `MannequinPartMesh` (static) **and** `AnimatedLegs` must use these functions. For
`AnimatedLegs`, build each segment's geometry once per fit (inside its existing `dims` `useMemo`),
then only update transforms per frame (it already does this with `setSegment`).

### 5.2 Segment profiles (replace `MANNEQUIN_EDGE_SPEC` radii)

Keep the weight scaling (`scaleRadius(base, weightKg, sensitivity)`, same sensitivities as today).
The profiles below are **base radii in mm for a 75 kg / 1800 mm rider**. Multiply by
`scaleRadius(1, weightKg, sensitivity)` and by `rider.height/1800` where noted.
`bump(t,c,w) = exp(-((t-c)^2)/(2w^2))`, `lerp(a,b,t)`.

| Segment (edge group) | Profile `r(t)` (t=0 at proximal joint) | Cross-section scale (sx, sz) |
|---|---|---|
| mannequin_thigh (hip→knee) | `lerp(80, 52, t) + 10*bump(t,0.30,0.20)` | (1.0, 0.92) |
| mannequin_shin (knee→ankle) | `lerp(46, 30, t) + 14*bump(t,0.28,0.13)` (calf) | (1.0, 0.9) |
| mannequin_foot → **shoe** (ankle→cleat, extend 40 mm past the cleat along the same direction) | `lerp(40, 26, t)` | (1.0, 0.85); shoe uses `mats.helmet` |
| mannequin_upper_arm | `lerp(44, 36, t) + 5*bump(t,0.40,0.20)` | (1, 1) |
| mannequin_forearm | `lerp(38, 24, t) + 6*bump(t,0.22,0.15)` | (1, 0.85) |
| mannequin_hand (wrist→hand, extend 30 mm) | mitten: `lerp(26, 22, t)` | (0.8, 1.25) |
| mannequin_neck | constant `52 * h` | (1, 1) |

**Torso (replaces lower + upper torso capsules and the `spine_joint` ball).** One lofted trunk from
`hip_center` to `shoulder_center`, with profile
`r(t) = 108 − 20*bump(t,0.45,0.16) + 16*bump(t,0.85,0.12)` (waist pinch, chest) and
cross-section (sx 0.72 front-to-back, sz 1.30 lateral). The spine is not straight when
`backBendDeg ≠ 0`, so build it in two lathe halves (hip→spine_joint, spine_joint→shoulder_center)
using the corresponding `t` ranges [0,0.4] and [0.4,1]. Also add a sphere at `spine_joint` of radius
`r(0.4)`, scaled by the same (sx, sz), to hide the seam.

**Pelvis:** a lathe between `hip_l` and `hip_r`, `r(t) = 92 − 8*bump(t,0.5,0.3)`, cross-section
(sx 1.0, sz: n/a because the axis is lateral). Shift it 20 mm rearward (−X) so the glutes sit
over the saddle.

**Shoulder yoke:** a lathe between `shoulder_l` and `shoulder_r`, `r = 50`. Add a deltoid sphere at
each shoulder, `r = 52`.

**Joints:** keep knee, elbow and ankle spheres, but set their radius = the adjacent profile radius
at the joint (so there is no visible ball). Remove the articulation gaps: set `GAP_FRACTION = 0`
for the new builder.

### 5.3 Head, neck, helmet

- **Head:** an ellipsoid, *not* a sphere. `SphereGeometry(1, 48, 32)` scaled to
  `(100, 112, 78) * h` (x = length front-back, y = height, z = width). Centre = `head_center`.
  Rotate about Z to align local +X with the gaze direction: compute
  `neckAngle = atan2(head_center.y − neck_base_center.y, head_center.x − neck_base_center.x)`, then
  `gaze = neckAngle − 80°`. With a typical neck at ~70°, the rider looks ~10° below horizontal, up the road
  (this matches `mockups/src/scene3.js`).
- **The head must be smaller than in the mock-ups.** The old joint spec used radius 88 (176 mm
  diameter sphere), which is too big. With the ellipsoid above, the width is 156 mm.
- **Helmet** (road helmet, not a bowl). Build it in the *head's local frame* (x = gaze forward,
  y = up, z = lateral):
  1. Start from `SphereGeometry(1, 64, 32, 0, 2π, 0, 0.62π)` (upper ~62% of a sphere).
  2. For each vertex `(x,y,z)`:
     - `z *= 0.86`; `y *= 0.78`;
     - if `x < 0` (rear): `x *= 1.28`; `y -= 0.18 * (−x)^2` (the tail kicks down and back);
     - if `x > 0` (front): `x *= 1.06`.
  3. Scale the result by `(116, 122, 95) * h` so it sits ~12 mm proud of the head ellipsoid. Offset
     it by `(−10, 16, 0) * h` in head-local space (the values used in the mock-up).
  4. Recompute normals. Material `mats.helmet` (clearcoat).
  5. **Vents:** add 4 shallow dark slots as separate thin boxes
     (`BoxGeometry(60*h, 4, 14*h)`) using `mats.rubber`, placed on the shell top at
     x = −30, 0, 30, 55 (head-local, mm·h). Rotate each to follow the shell normal: raycast from
     above onto the shell geometry, or approximate with a y-offset from the ellipse equation.
     This step is optional; skip it if it looks noisy.
  6. **Straps:** do not model them.
  - Acceptance: from the side, the silhouette has a rounded front brow, a long flat top and a
    tail that ends ~20 mm behind the back of the head. From the front, it is narrower than the
    shoulders by a wide margin. Compare against the side profile of any modern road helmet photo;
    the result must not read as a bowl or hemisphere.
- `MANNEQUIN_JOINT_SPEC.head_center` stays only for the frontal-area probe's bounding if needed;
  the ellipsoid replaces its visual.

### 5.4 Checks

- In dev mode (`devMode` state in `BikeScene3D`), call `elbowPointsTowardBB(mannequin2D)`. If it
  returns false, `console.warn`. It should never fire.
- Frontal area will change slightly because the body volumes changed. That is expected: record the
  before and after numbers in the commit message. It must stay within ±8% for the default fit. If
  not, the torso or helmet cross-sections are wrong.
- The ghost (Phase 4) should now use `limbGeometry` too (same profiles, ghost material).

### Phase 5 acceptance

- [ ] No visible capsules or balls; joints are seamless.
- [ ] Elbows bend down and back in every preset (endurance, race, fast), with the trunk slider at its min and max.
- [ ] The head is proportionate (compare shoulder width to head width: roughly 2.5–3 : 1).
- [ ] The helmet passes the silhouette check in 5.3.
- [ ] Pedalling animation plays smoothly: legs use the same profiles, and there are no seams at the knee through the full stroke.
- [ ] Rider weight 55 kg vs 95 kg visibly changes limb thickness (the power law still applies).
- [ ] tsc clean; screenshots at side, ¾ and front in both themes.

---

## Phase 6: Bike shapes (second pass, part 2)

**Goal:** the bike reads as a modern road bike, not a stick diagram. Positions still come from the
edge graph.

1. **Tapered tubes:** reuse `limbGeometry` from `riderMesh.ts` with linear profiles.
   | tube | r start → end (mm) |
   |---|---|
   | down_tube | 24 → 20 (BB → head tube) |
   | seat_tube | 17 → 15 |
   | top_tube | 15 → 17 |
   | head_tube | 23 → 19 (bottom → top; the tapered steerer) |
   | chainstay | 13 → 8 |
   | seatstay | 9 → 6. Also move its upper end 35 mm down the seat tube ("dropped stays"). |
   | seatpost | 13 constant, `alloy` |

   Update `TUBE_RADIUS` / `buildTubes` in `bike3d.ts` to carry `radiusStart` / `radiusEnd`
   (keep `radius` for compatibility = mean). `TubeMesh` then uses `limbGeometry`.
2. **Curved fork blades:** replace the straight `head_tube_bottom → fork_l/r` tubes with
   `TubeGeometry` along a `QuadraticBezierCurve3(crown, crown + htDown*200 + (8,0,0), dropout)`,
   radius 11, 40 segments. `htDown` = the unit vector from `head_tube_top` to `head_tube_bottom`.
   Add a fork crown: a lathe between the two blade tops, r = 20.
3. **Junction fillets:** a sphere at `bb` (r 30, `frame`), at `seat_cluster` (r 18), and at
   `head_tube_top` / `head_tube_bottom` (r = head tube radius + 2).
4. **Chainring:** replace the two flat discs in `Drivetrain3D` (and any chainring in `AnimatedLegs`:
   check its `CHAINRING_*` constants) with `ExtrudeGeometry` from a gear `Shape`: 50 teeth, outer
   radius 108, root radius 102, inner hole radius 84, depth 4. Add a 4-arm spider (tapered lathes
   from the BB to r = 90) and a simple chain (two 3.5 mm tubes from the ring's top and bottom
   tangents to a cassette cylinder r 48 at the rear axle, `z = CHAINRING_Z`).
5. **Deep rims:** in `Wheel3D`, replace the rim with a `LatheGeometry` profile around the axle:
   `[(R-28,-11),(R-80,-7),(R-85,0),(R-80,7),(R-28,11)]` (R = wheel radius; 55 mm deep rim),
   rotated so the lathe axis = world Z. Spokes end at `R-84`.
6. **Crank arms:** tapered lathes (r 13 → 9) instead of constant cylinders, in both
   `Drivetrain3D` and `AnimatedLegs`.

### Phase 6 acceptance

- [ ] Positions are unchanged: dev-mode "Export JSON" before and after is byte-identical in `points`.
- [ ] Frontal area with "+ Bike" changes by < 5%.
- [ ] Disc-wheel toggle still works.
- [ ] Screenshots in both themes look like the mock-ups' bike (tapered tubes, curved fork, toothed ring, deep rims).

---

## Appendix A: file map

| File | Phases | Change |
|---|---|---|
| `web/src/theme3d.ts` | 1 | **new**: tokens + `useTheme3D` |
| `web/src/BikeScene3D.tsx` | 1–6 | materials, stage, lights, AO, toolbar, state for theme/quality/metrics/compare |
| `web/src/AeroTools.tsx` | 1, 4 | `stage-root` exclusion, fog off during probe, ghost restyle + diff-only |
| `web/src/FitAnalytics3D.tsx` | 2, 3 | hairline arcs, dims without chips, `GroundRuler`, focus colouring |
| `web/src/fitMetrics.ts` | 2 | **new**: metric registry |
| `web/src/Callouts3D.tsx` | 2 | **new**: projector + DOM callouts + spec panel + header/footer |
| `web/src/MetricRail.tsx` | 3 | **new**: rail + readouts + gauges |
| `web/src/fits/api.ts`, `web/src/fits/useFitHistory.ts` | 4 | **new** |
| `web/src/FitBuilderMode.tsx` | 4 | capture/restore inputs, `?fit=` loading, pass compare props |
| `web/src/ProfilePage.tsx` | 4 | "My fits" section |
| `web/src/riderMesh.ts` | 5 | **new**: `limbGeometry`, `orientBetween`, head/helmet builders |
| `web/src/bike3d.ts` | 5, 6 | profile specs replace radii; tube start/end radii |
| `web/src/AnimatedLegs.tsx` | 1, 5, 6 | theme materials, shared limb builder, chainring/cranks |
| `web/src/geometry.ts` | 0 | `elbowPointsTowardBB` helper only |
| `web/src/App.css` | 1–3 | canvas bg var, toolbar/overlay styles |
| `web/src/main.tsx` | 1 | font imports |
| `bikegeo_api/models_db.py`, `schemas_fits.py`, `routers/fits.py`, `main.py` | 4 | fit history API |
| `bikegeo_api/tests/test_fits.py` | 4 | **new** tests |
| `tests/test_pose2d_invariants.py` | 0 | elbow test |

## Appendix B: common mistakes to avoid

- Creating a new `THREE.Material` per mesh per render. Use the shared `useMaterials3D` instances.
- Forgetting to dispose imperatively created geometries (`useEffect(() => () => geo.dispose(), [geo])`).
- Putting the floor, ruler or ghost outside a `NON_AERO_GROUP_NAMES` group, which silently corrupts the frontal-area numbers.
- Using drei `<Text>`: it fetches a font from a CDN and the CSP blocks it. Use DOM overlays or `<Html>`.
- Changing the IK or point positions to "make it look better". Never. Change skinning only.
- Letting the accent colour leak into non-focused UI. Accent means "the thing you're looking at, or what changed".
- Installing `@react-three/postprocessing@3` (needs React 19 / R3F 9).
