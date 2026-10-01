# FlowFit site redesign: master plan (multi-agent)

> **This is the master document.** `docs/plans/3d-instrument-redesign.md` is a detailed sub-plan for the 3D view.
> Where the two disagree, **this document wins**.
>
> **Audience:** several implementing agents working in parallel cloud sessions, one per track (§6). Every agent
> reads §0–§5 in full, then its own track section, then its kickoff prompt (§9).

---

## 0. Why

FlowFit is being redesigned end to end around a design direction called **"Instrument"**: precision as the cool factor.

**Who it's for:** data-literate amateur racers aged 30–55 (UK Cat 2–4, TrainerRoad or TrainingPeaks users, buyers
of PNS, MAAP or Rapha). They care about details and exactness. They are nerdy about numbers, not "gamer" nerdy.

**What's wrong today:**
- The site shell uses cream `#faf0e2`, Barlow Condensed from Google Fonts, orange-tinted borders and a dark-brown stage.
- There are about 46 hex and 98 rgba literals in a single 2265-line `App.css`, plus inline status hexes in TSX.
- The 3D view looks like a prototype: capsules, toon outlines and chips.

**Target look:**
- A calm spec-sheet with hairlines, mono tabular figures and part-coded callouts.
- One hot accent, used only for "what you're looking at" and "what changed".
- Light by default, with dark available **site-wide**.

**Key product features that span surfaces:**
- **Metric registry:** one definition of every fit metric, used by the 2D view, 3D view, summary and history.
- **Metric Rail:** click a chip to focus a metric, Shift-click to pin up to 3.
- **Fit history:** save fits and compare them via a ghost rider and deltas.

## 1. Decisions (from the product owner; do not re-litigate)

| Topic | Decision |
|---|---|
| Scope | **Full site redesign**: shell, Fit Builder (2D and 3D), Fit Transfer, Add bike, Profile, Auth. |
| Theme | **Light default**; **dark applies to the whole site** via one toggle. |
| Brand | **Decided: direction 01 "Contact"** (`mockups/00-brand-directions.png`): the contact-triangle mark and safety orange `#FF4F00`. The accent and mark still live only in tokens and one `BrandMark` component. |
| Rider | **A segmented clay mannequin with a toned male road-racer base**, plus a tonal Fresnel rim (§5.5). The blended-surface body and kit colours were tried and rejected. |
| Bike | **A modern disc road bike**, never a fixie: 2× groupset (chainrings, front and rear derailleurs, cassette, chain), flat-mount disc brakes + rotors, STI hoods and levers, dropped stays, sloping top tube, aero post, bottle and cage. Carbon-black deep rims and black tyres; **no light rim bands or tan walls**. The frame colourway is "Moss" (tokens). |
| Fit history | **Build it** (server-side, signed-in users). |
| Metric readout | Not fixed. It uses the **Metric Rail** (focus 1, pin up to 3). |
| Rejected looks | Lo-fi, VHS, grain, neon, bloom, glowing grids, cartoon or toon shading, black outlines, loud multi-colour. Never add these. |
| Execution | **Separate cloud sessions**, one per track, each with its own branch and PR into `main`. Agents open PRs; **they do not merge**. |

## 2. Reference mock-ups (`docs/plans/mockups/`)

| File | Shows |
|---|---|
| `00-brand-directions.png` | The three brand directions, in light and dark |
| `01-app-fit-builder-2d-light.png` | **The canonical app screen:** nav, controls column, 2D side view, readout, Metric Rail, results column with fit history |
| `10-helmet-vs-photos.png` | Helmet model vs Evade 4 product photos (side / front / rear) |
| `09-head.png` | Head (no helmet), side / front / ¾ |
| `06/07/08-rider-*.png` | **The current rider figure** (side, rear ¾ showing the calves, front ¾) (older helmet shown; the helmet has since been removed) |
| `05-fresnel-options.png` | **The rider figure and Fresnel options:** clay / tonal rim / focus rim + x-ray ghost / dark |
| `02-view3d-light.png` | 3D view, light (default) |
| `03-view3d-dark.png` | 3D view, dark |
| `src/` | The throwaway source for the images, with exact CSS values and mesh recipes. **Reference only**; see `src/README.md`. |

**Mock-up caveats:**
- The mock-ups use simplified geometry (`src/geom.js`), so their numbers differ from the app. The **app's
  `web/src/geometry.ts` is the source of truth for every position and angle.**
- The elbow in the new mock-ups follows the app's rule (it bends down and back). The app is already correct, so keep it that way.
- The 3D camera looks from the rider's **left** (+Z), because the near-side leg (left, at BDC) is the one fit metrics are
  measured on. That is also the app's default camera.

## 3. Non-negotiable rules (all tracks)

1. **Never change geometry or IK** (`bikegeo_core/`, `buildMannequin`, `buildGeometry3D`, `circleIntersections`).
   Change only how things are drawn. The 2D and 3D views must keep agreeing by construction.
2. **No colour literals** in TSX or CSS outside `web/src/design/tokens.css` and `web/src/design/tokens.ts`. Use tokens.
3. **No CDN fonts or scripts.** Fonts come from `@fontsource/*`. The CSP blocks CDN font loads, and drei `<Text>` must not be used.
4. **Accent discipline:** accent is only for the focused metric, deltas/ghost, the primary CTA and the active nav/tab
   underline. Band status uses the band colours as **small dots only**, never as chip fills.
5. **Numbers:** always tabular (`font-variant-numeric: tabular-nums` or mono). Units are always shown, always in `muted`.
6. **Stay in your lane:** only edit files your track owns (§6.1). If you need a change in someone else's file, write it in
   your PR description under "Requests for other tracks". Do not make the change yourself.
7. **Contracts (§7) are frozen.** Changing one requires a note in the PR plus updating this doc in the same PR.
8. Verify before every push:
   - `cd web && npx tsc --noEmit` is clean;
   - `make test` is green;
   - screenshots of your surfaces in **light and dark** at 1600×1000 and 390×844, attached to the PR description (see §8).

---

## 4. Design system (track DS; everything else depends on it)

### 4.1 Tokens (`web/src/design/tokens.css` + mirrored `tokens.ts`)

CSS variables on `:root[data-theme="light"]` (default) and `:root[data-theme="dark"]`. `tokens.ts` exports the same
values as JS for three.js and SVG (`TOKENS.light.accent`, …), plus a `useTheme()` hook (see 4.4).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#E6E1D8` | `#111213` | page background, 3D scene background + fog |
| `--surface` | `#EDE9E2` | `#18191B` | stage panels, inputs |
| `--surface-2` | `#F4F1EC` | `#1F2022` | popovers, sheets |
| `--ink` | `#161616` | `#E8E6E1` | text, hairlines, active pills (bg) |
| `--muted` | `#6B655D` | `#8B8984` | labels, units, secondary text |
| `--faint` | `rgba(22,22,22,.16)` | `rgba(232,230,225,.16)` | borders, rules |
| `--faint-2` | `rgba(22,22,22,.08)` | `rgba(232,230,225,.07)` | row rules, gauge track |
| `--accent` | `#FF4F00` | `#FF5A1F` | see rule 3.4 |
| `--accent-text` | `#D94300` | `#FF6A33` | accent used as text on bg (contrast-safe) |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | text on an accent fill |
| `--band-in` | `#1E7D43` | `#3FB67A` | status dot |
| `--band-near` | `#B8860B` | `#E0B341` | status dot |
| `--band-out` | `#C02828` | `#FF6B6B` | status dot |
| `--frame` | `#4A5240` (Moss) | `#8E9A7C` | bike frame paint (2D fill, 3D material) |
| `--carbon` | `#141516` | `#141516` | rims, seatpost, stem, cranks, derailleur bodies, saddle |
| `--alloy` | `#2A2C2F` | `#2A2C2F` | chainrings, cassette, calipers, pulleys |
| `--rotor` | `#9A9FA6` | `#9A9FA6` | disc rotors |
| `--tyre` | `#1A1A1A` | `#1A1A1A` | tyres, bar tape |
| `--clay` | `#8C8276` | `#7D8085` | rider mannequin (single clay tone) |
| `--rim` | `#FFFBF3` | `#D6DDE6` | Fresnel rim tint |
| `--kit-light` | `#EDEAE4` | `#D9D5CD` | light kit accents (reserved; no helmet for now) |
| `--bottle` | `#D6CFC2` | `#4B4D50` | bottle |

3D-only material parameters (roughness, clearcoat, …) stay in `tokens.ts` under `material3d`. The values are in
the 3D plan §2.

**Type** (`@fontsource/geist` 500/700, `@fontsource/geist-mono` 400/500, `@fontsource/doto` 800), imported once in `main.tsx`:

| Token | Value |
|---|---|
| `--font-sans` | `'Geist', system-ui, sans-serif` |
| `--font-mono` | `'Geist Mono', ui-monospace, monospace` |
| `--font-dot` | `'Doto', 'Geist Mono', monospace` |
| Label/eyebrow | mono 400, 10.5–11 px, UPPERCASE, `letter-spacing: .14–.18em`, `--muted` |
| Body | sans 500, 12.5–13 px |
| Section title | sans 600, 13–15 px, `letter-spacing: -.01em` |
| Value | mono 500, 12.5–13 px, tabular |
| Medium readout | sans 500, 38–40 px, `letter-spacing: -.02em` |
| Big readout | dot 800, 104 px (3D) / 72 px (2D stage) / 56 px (mobile) |

**Spacing:** 4 px base (`--s-1: 4px` … `--s-8: 32px`). **Radius:** `0` everywhere except the status dot (50%).
**Borders:** 1 px `--faint`. **Shadows:** none, except popovers (`0 8px 24px rgba(0,0,0,.12)`).

### 4.2 Primitives (`web/src/design/`)

Restyle the existing shared components **in place** (keep their props so call sites don't change), and add the new ones.
Each gets an entry on the `/design` route (4.3).

| Component | Status | Spec (see `mockups/src/app.css` / `ff.css` for exact values) |
|---|---|---|
| `SliderCard` (`components/SliderCard.tsx`) | restyle | mono label left, mono value + unit right, 1 px track, 2×12 px ink thumb, optional band ticks; keep the −/+ steppers as small ghost buttons |
| `CollapsibleSection` | restyle | no card; 1 px top rule; title sans 600 13 px; eyebrow mono muted on the right; chevron hairline |
| `PresetPills` | restyle → segmented look | a joined row of equal cells; active = ink fill, bg text |
| `MetricCard` | restyle | label mono muted, value mono 500; the `color` prop maps to a status dot, **not** text colour |
| `Pill` / `Button` | new | variants: `ghost` (1 px faint border), `active` (ink fill), `primary` (accent fill, `--on-accent` text); mono 10.5 px uppercase .14em |
| `Segmented` | new | used for view switch (Side/Front/3D), Contact/Saddle height, theme |
| `StatusDot` | new | 7 px circle, `in` / `near` / `out` |
| `PartCode` | new | inverted chip (`--ink` bg, `--bg` text; `hot` → accent bg), mono 500 11 px |
| `Readout` | new | `size: "big" \| "medium"`, value, unit, eyebrow, optional delta line |
| `BandGauge` | new | track (`--faint-2`), band segment (`--ink`), `now` marker (accent 3×20), optional `was` marker (accent 40%), scale labels |
| `MetricChip` + `MetricRail` | new | chip: code, short label, value, delta (accent-text), status dot, key hint; states `focused` (accent border + 2 px inset underline), `pinned` (ink border + "PINNED" tab) |
| `SpecTable` | new | rows `label · value · unit · delta`, section headers, optional inverted summary bar |
| `CalloutLayer` | new | DOM overlay taking `anchors: {id, x, y}[]` in **screen px** + per-id preferred direction; draws dot, leader (diagonal then 140 px horizontal) and a `PartCode` label; runs the overlap-avoidance pass (sort by y, push down, clamp to the container). **Shared by the 2D and 3D views.** |
| `BrandMark` | new | the contact-triangle SVG (3 dots + hairline triangle, pedal dot in accent) + wordmark. The only place brand lives. |
| `ThemeToggle` | new | the `◐ LIGHT` / `◑ DARK` pill |

### 4.3 `/design` route

A dev-only route (`import.meta.env.DEV` guard) that renders every primitive in both themes side by side. It is the
visual contract: other tracks screenshot against it.

### 4.4 Theme plumbing

- `useTheme()` → `[theme, setTheme]`. It persists `localStorage["flowfit.theme"]` (wrap in try/catch) and sets
  `document.documentElement.dataset.theme`.
- The initial value is the stored theme, else `"light"`. **Do not** follow the OS preference by default: light is the brand default.
- The 3D plan's `useTheme3D` is replaced by this hook. The 3D view reads `TOKENS[theme]`.

### 4.5 Metric registry (`web/src/fitMetrics.ts`)

Owned by DS, because the 2D view, 3D view, summary and history all consume it. The spec is in the 3D plan §2.1. Additions:
- `formatMetric(id, value)` gives the display string (integers; KOPS is signed).
- `formatDelta(id, delta)` gives `▲ 3°`, `▼ 2 mm`, or `""` when |delta| < 0.5.
- `DEFAULT_FOCUS = "knee_ext_bdc"`.
- A `useMetricFocus()` hook: `{ focused, pinned, focus(id), togglePin(id), reset() }`, persisted to
  `localStorage["flowfit.metrics"]`. **Shared by the 2D and 3D views**, so switching views keeps the selection.
- `MetricsHud` in `BikeScene3D.tsx` must be refactored to use the registry. Coordinate that with track C: DS lands the
  registry with no UI changes, and C switches the HUD over.

### 4.6 CSS restructure (DS does this first, as a no-visual-change commit)

Split `web/src/App.css` into `web/src/styles/`, following the existing section boundaries:

| File | Contents |
|---|---|
| `base.css` | resets, typography |
| `shell.css` | mode nav |
| `builder.css` | mode layouts, tiers, fit summary, mobile sheets |
| `controls.css` | slider, pills, fields, collapsible |
| `stage2d.css` | geometry, annotation, mannequin, joint-angle classes |
| `stage3d.css` | `bike3d-*` |
| `transfer.css` | |
| `forms.css` | auth, add bike |
| `profile.css` | |

Import them all from `App.tsx` in the original cascade order. **Verify with before/after screenshots that nothing
visual changed.** Then do the token swap:
- Replace every hex/rgba literal with tokens. Map the old `--accent` to `--accent`, and the cream-on-dark rgba values to `--ink` in dark.
- Remove the Barlow `<link>` from `web/index.html`.

---

## 5. Surface specs

### 5.1 Shell (track A)

- **Top nav, 56 px:**
  - `BrandMark` on the left.
  - Tabs FIT BUILDER · FIT TRANSFER · ADD BIKE in mono 11 px .14em, `--muted`. The active tab is `--ink` with a 2 px accent underline.
  - On the right: `ThemeToggle`, then the account (email, or Sign in/Register as ghost pills).
  - The old two-line tab subtitles are removed.
- 1 px `--faint` rules between regions. No cards or shadows.
- **Auth pages:** a centred 380 px column on `--bg`, with `BrandMark`, form fields (1 px border, `--surface`, mono labels) and a primary Pill.
- **Profile:**
  - Header: eyebrow ACCOUNT, email in sans 600 24 px, "Joined …" in muted mono.
  - Sections: **My fits** (from track D; leave a slot component `<MyFitsSection/>` that D fills) and **My submitted bikes** (SpecTable-style rows).
- **Add bike:** tabs become `Segmented`; the form uses the restyled fields; size blocks are `SpecTable`-like grids.
- **Fit Transfer:** same page skeleton as Fit Builder (controls | stage | results where applicable). Frame A and Frame B cards
  become two SpecTables with compare colours. **The Frame B compare colour becomes `--ink` dashed vs Frame A `--ink`
  solid; accent marks only the differences.** Its SVG uses the same `stage2d.css` classes as the builder.

### 5.2 Fit Builder layout (track B)

Grid `272px 1fr 292px` (see `01-app-fit-builder-2d-light.png`). Regions are extracted into components first (§6.2).

- **Left: ControlsColumn.** Three tiers, labelled `[01] RIDER`, `[02] POSTURE`, `[03] BIKE`, where the number is a boxed mono chip.
  Keep every existing control and its state; only the presentation changes. Advanced sections stay collapsed by default.
- **Centre: Stage.**
  - A toolbar row of 48 px: `Segmented` SIDE/FRONT/3D, then `LAYERS ▾` (popover restyled on `--surface-2`), `ANGLES`,
    `DIMENSIONS` and `KOPS` toggles as Pills, then on the right `COMPARE {fit} ▾` (track D) and fullscreen.
  - The stage background is `--surface`.
  - **The readout sits top-right of the stage and the Metric Rail along the bottom, in all three views.**
- **Right: ResultsColumn.**
  - FIT SUMMARY: "n of 6 in band", then rows of `StatusDot · name · value · delta`.
  - Warnings: 1 px bordered notes, with a band-coloured eyebrow such as `● NEAR · KOPS`.
  - Fit Analysis, Coordinates, Seatpost and Geometry: collapsible `SpecTable`s.
  - FIT HISTORY (track D slot): list plus a primary `SAVE FIT` Pill.
- **Mobile (< 1100 px):** the stage comes first; Controls and Results open as bottom sheets from a bottom bar, as today but restyled.
  Under 760 px the Metric Rail scrolls horizontally, and the readout shrinks to 56 px and moves above the stage.

### 5.3 2D side view (track B)

Restyle only. Positions come from the existing `bike` / `mannequin` sketches in `FitBuilderMode`. Target is `01-app-fit-builder-2d-light.png`.

| Layer (existing classes) | New look |
|---|---|
| ground / `geometry-ground` | 1 px `--ink` @ 60% plus a **mm ruler** (25 mm minor ticks at 22% opacity, 100 mm major, accent ticks at R.AXLE / BB / F.AXLE, mono labels) |
| wheels (`Wheel2D`) | tyre = `--tyre` stroke 28 mm; **carbon deep rim** = `--carbon` band 44 mm (solid, never light); spokes 2.2 mm `--alloy`; hub; near-side **disc rotor** ring + 6 spokes in `--rotor`; flat-mount caliper |
| frame lines (`geometry-frame--*`) | **filled tapered polygons** in `--frame`, using the same radius table as the 3D tubes (shared `web/src/design/bikeProfiles.ts`: `down_tube 24→20`, …; see 3D plan §6). Curved fork = quadratic path. BB fillet circle. |
| cockpit / seatpost / cranks / drivetrain | `--carbon` / `--alloy` fills: aero seatpost, stem, spacers, drop bar in `--tyre` (tape), STI hood + lever; **52/36 chainrings** (tooth outlines), cassette (11 rings), front derailleur, rear derailleur with two pulleys, chain routed through them; bottle + cage on the seat tube. Draw order for the left-side view: far wheel parts → far limbs → drivetrain (drive side is far) → frame → near hardware (rotors, calipers, near crank) → near body → head → bars/hoods → near glove. |
| saddle (`SaddleShape`) | `--ink` fill |
| mannequin (`geometry-mannequin__flesh/line/head`) | **SUPERSEDED, see §5.5 (clay polygons + rim filter).** Previously: the same body primitives as 3D (`web/src/design/riderBody.ts`, §5.5), evaluated in 2D: each primitive's distance at its own mid-plane z, smooth-min combined, then drawn as **anti-aliased per-kit-region fills** (skin / jersey / bib / sock; hems follow the split planes). Either rasterise to a canvas `<image>` at ≤2 mm/cell (as the mock-up does), or contour with marching squares into SVG paths. Far-side limbs at 62% opacity *behind* the bike; near body in front, with a thin darker edge. Head = ellipse + jaw + brow masses; helmet = the side silhouette of the §5.5 helmet recipe (top line φ=0, bottom edge φ=1) in `--kit-light`, with the side vent channels as dark strokes; wrap glasses; ponytail for the female base. Shoes in `--kit-light` with a `--carbon` sole. |
| skeleton overlay (`__line`) | 2 mm `--ink` @ 55% bones; joints = `--surface` circles with ink stroke |
| joint angle arcs (`JointAngleArc`) | hairline arcs, **no text in the SVG**: labels go through `CalloutLayer`. Focused metric arc + rays in accent; pinned in ink 60%; others hidden unless ANGLES is on (then ink 35%). |
| annotations (`BikeFitAnnotations`, `BikeGeometryAnnotations`, `ann-*`) | dimension lines with end ticks, 55% ink; labels mono 10 px muted (e.g. `DROP 82`). Toggled by DIMENSIONS. |
| targets (`geometry-target`) | small ink crosshair (registration mark), not coloured crosses |
| ghost (new, track D data) | previous fit's drive-side leg and torso as an accent **dashed** hairline, plus a `FIT 02 ┄` label |

- **Colour hot-spots to remove:** the inline status hexes `#4cbf7e / #e8a33c / #e05252` (FitBuilderMode ~:385, :1317,
  :1345), `#d4880a`, trunk arc `#5fb8c4`, the front-view `rgba(240,53,0,.35)`, and inline head fills. Use tokens instead.
- **Front view:** the same language: rider in the §5.5 body projected front-on (skin/kit tokens), bike in `--frame` / `--carbon`, hairline measurements.
- **Callouts in 2D:** anchors are converted mm → screen px with the SVG's `getScreenCTM()`, then passed to `CalloutLayer`.

### 5.5 Rider figure and Fresnel shading (track E owns; the 2D and 3D views consume)

`mockups/src/{kit.js,rider3.js,fresnel.js,draw2d.js}` is the working reference (`05-fresnel-options.png` and `02/03` show the result).

- **Representation:** a **segmented clay mannequin**, one neutral clay material (`--clay`), built from lathe limbs with
  anatomical profiles. There is no kit colouring, and **no** single blended/SDF surface: that was tried and rejected.
- **Base physique:** modelled on **Freddy Ovett's build**: a tall, lean, toned male road racer (1800 mm / 75 kg base).
  - **Shoulders and torso:** broad, capped deltoids (60×70×56, set 34 mm outboard of the shoulder joints). V-taper torso
    (waist pinch at t≈0.36, width scale 1.08→1.6 towards the chest, a deep flat back, lat masses). A moderate trapezius
    slope and a neck of r 54→49. Tight glutes. **No pec masses.**
  - **Muscles are built into the limb surfaces, not added as blobs** (`rider3.js#muscleLimb`): each lathe vertex's radius
    gets `amp·gauss(t)·max(0, cos θ)^spread` towards a world direction. Thigh: rectus/vastus at the front, a VMO teardrop at
    the front-medial just above the knee, a vastus lateralis sweep, hamstrings. **Calves:** gastrocnemius medial (amp 26)
    and lateral (amp 18) heads on the **posterior** side of the upper shin, soleus tapering to a slim ankle.
    Arms: biceps, triceps, deltoid insertion, forearm brachioradialis.
  - The exact numbers are in `rider3.js`. **Lengths and joint positions always come from the app's IK**; the base only sets
    radii and shapes, scaled by `(weightKg / 75)^sensitivity` per segment. A female base in the same style is a later decision.
- **Fresnel (tonal rim light)**, `fresnel.js#withFresnel`: a rim term mixed into the material colour. It is **not** emissive
  and has no bloom.
  - Light theme: rim `#FFFBF3`, strength ≈ 0.38, power 4. Dark theme: rim `#D6DDE6`, strength ≈ 0.5.
  - **Focused limb:** an accent rim (strength 0.6, power 3.6) instead of any fill colour.
  - **Comparison ghost:** a Fresnel-only transparent shell in accent (alpha = rim term). It needs a lit material, because
    `MeshBasicMaterial` has no normals. Render it in a separate pass so only the outer silhouette shows, not internal part edges.
  - **Pending product decision:** level 2 (tonal rim only) vs level 2+3 (plus the focus rim and x-ray ghost). The recommendation is 2+3.
- **2D:** the same profiles drawn as clay polygons, with an SVG filter that erodes the alpha and flood-fills the ring to give an
  inner rim (tonal), plus an accent ring on the focused limb (`draw2d.js#clayDefs`, `clayFigure`).
- **Head** (`rider3.js`, head-local frame: +x gaze, +y up; gaze = neck angle − 78°):
  - **Head:** one deformed ellipsoid (`headDeform`) rather than separate nose and chin blobs: a skull of 96×118×76, a
    flattened face plane, a squarer jaw that narrows gently below the equator, and a subtle nose ridge and chin built
    into the surface. Small ears.
  - **Helmet: none for now (decided).** The rider is shown bare-headed in both 2D and 3D, and no track builds a helmet.
    For reference only: the last explored option (a lofted shell traced from Evade 4 photos, closed nose, 18 mm thickness)
    is in `mockups/src/buildloft.mjs` and `mockups/10-helmet-vs-photos.png`, in case a helmet is revisited later.
  - **Future upgrade:** a professionally modelled (CC0 or licensed) generic aero-road helmet and athletic body as GLB assets,
    fitted to the IK joints. This is the route to a fully detailed, photoreal look. It must not be a replica of a branded
    product.
  - **2D:** the head profile is the z=0 slice of `headDeform`, so 2D and 3D share one model.
  - **Reference:** `mockups/09-head.png`.
- **Build: calibrated to measured widths from a reference photo of a pro rider.**
  - **Method:** the product owner measured the photo in the Rider Proportion Gauge (a click-to-measure page).
    - The scale comes from the wheel diameter (680 mm).
    - Each width is taken square to its bone, at 25%, 50% and 75% along it (torso at 30%, 50% and 70%), so the
      different poses don't matter.
    - Our model was measured the same way: the silhouette width of each limb's own mesh, square to the same bone.
  - **Fit:** `CAL` in `mockups/src/rider3.js` holds a multiplier per station: linear between stations, flat beyond.
    It scales both the base profile and the muscle bulges (torso: front-to-back depth only). Every station is within
    1.3% of the reference.
  - **Reference widths (mm, side view):**

    | Part | 25% / 30% | 50% | 75% / 70% |
    |---|---|---|---|
    | Thigh | 193 | 178 | 141 |
    | Calf | 132 | 128 | 96 |
    | Upper arm | 110 | 94 | 79 |
    | Forearm | 87 | 76 | 55 |
    | Torso (stomach / lower chest / chest) | 242 | 258 | 275 |
    | Neck | — | 114 | — |
  - **2D:** the side view applies the same `calAt(segment, t)` to its silhouette profiles.
  - The mock-up pose uses trunk 36°, so the elbows bend (~27°). Real poses come from the app's IK.

### 5.6 3D view (tracks C and E)

Follow `3d-instrument-redesign.md`, with these amendments:
- **Theme and tokens:** use `useTheme()` and `TOKENS` from DS. Drop `useTheme3D` and the local token table.
- **Shared components:** `fitMetrics`, `useMetricFocus`, `CalloutLayer`, `Readout`, `BandGauge` and `MetricRail` come from DS. Do not re-implement them.
- **Camera:** the default camera stays on +Z (the rider's left, the near-side leg), as today.
- **Accent:** `#FF4F00` (brand direction 01), via tokens.
- **Anatomy:** profile functions come from `riderBody.ts` and `bikeProfiles.ts` (shared with 2D). Track E owns those
  files; DS creates them as stubs holding the plan's numbers.

---

## 6. Tracks

### 6.1 Ownership table (who may edit what)

| Track | Branch | Owns (may edit) | Must not edit |
|---|---|---|---|
| **DS**: design system | `claude/redesign-ds` | `web/src/design/**`, `web/src/styles/**` (creates it), `web/src/App.css` (split + delete), `web/index.html`, `web/src/main.tsx`, `web/src/fitMetrics.ts`, `web/src/components/{SliderCard,CollapsibleSection,PresetPills,MetricCard}.tsx`, `web/package.json`/lock, `/design` route in `App.tsx` (route line only) | anything else |
| **A**: shell + pages | `claude/redesign-shell` | `App.tsx` (Header/Shell), `auth/**`, `ProfilePage.tsx`, `AddBikeMode.tsx`, `FitTransferMode.tsx`, `styles/{shell,forms,profile,transfer}.css` | builder, stage, 3D |
| **B**: builder + 2D | `claude/redesign-builder-2d` | `FitBuilderMode.tsx` + the new extracted files (`builder/ControlsColumn.tsx`, `builder/ResultsColumn.tsx`, `builder/StageToolbar.tsx`, `builder/Stage2DSide.tsx`, `builder/Stage2DFront.tsx`), `components/{BikeParts2D,SaddleShape}.tsx`, `BikeAnnotations.tsx`, `styles/{builder,controls,stage2d}.css` | 3D files, backend |
| **C**: 3D view | `claude/redesign-3d` | `BikeScene3D.tsx`, `FitAnalytics3D.tsx`, `AeroTools.tsx`, `Callouts3D.tsx` (thin adapter to `CalloutLayer`), `styles/stage3d.css` | `riderMesh.ts`, `bike3d.ts`, `AnimatedLegs.tsx` (track E) |
| **D-api**: fits backend | `claude/redesign-fits-api` | `bikegeo_api/{models_db.py,schemas_fits.py,routers/fits.py,main.py}`, `bikegeo_api/tests/test_fits.py`, `web/vite.config.ts` (the `/fits` proxy line only) | frontend |
| **D-ui**: fits frontend | `claude/redesign-fits-ui` | `web/src/fits/**`, `web/src/fits/MyFitsSection.tsx`, `web/src/fits/FitHistoryPanel.tsx`, `web/src/fits/CompareMenu.tsx` | it plugs into slots provided by A (Profile), B (ResultsColumn, StageToolbar) and C (ghost props). Where a slot is missing, request it in the PR. |
| **E**: meshes | `claude/redesign-meshes` | `web/src/riderMesh.ts`, `web/src/bike3d.ts`, `web/src/AnimatedLegs.tsx`, `web/src/design/riderBody.ts`, `web/src/design/bikeProfiles.ts`, `tests/test_pose2d_invariants.py` (elbow test) | `BikeScene3D.tsx` (C wires the new builders in; E exposes them) |

### 6.2 Work breakdown per track

**DS**, in order, each as its own commit:
1. Split `App.css` into `styles/*.css` with no visual change (before/after screenshots identical).
2. Tokens + fonts + theme hook.
3. Swap literals to tokens.
4. Restyle the four shared components.
5. Add the new primitives.
6. `fitMetrics.ts` + `useMetricFocus`.
7. `riderBody.ts` / `bikeProfiles.ts` stubs holding the plan's numbers.
8. The `/design` route.

Open **PR 1 after step 3** (the unblocker for A and B), and **PR 2 after step 8**.

**A:**
1. Nav + ThemeToggle.
2. Auth pages.
3. Profile, with an empty `<MyFitsSection/>` slot rendered only when signed in (a default no-op export in `fits/MyFitsSection.tsx`, if D-ui hasn't landed yet; coordinate).
4. Add bike.
5. Fit Transfer layout + SVG classes.

**B:**
1. **Extraction PR (no behaviour change):** split `FitBuilderMode.tsx` into the `builder/` components listed. Keep all state in `FitBuilderMode`.
2. ControlsColumn restyle.
3. ResultsColumn restyle + slots `historySlot` / `compareSlot`.
4. Stage toolbar.
5. 2D side view restyle (§5.3) using `riderBody` / `bikeProfiles`.
6. 2D `CalloutLayer` + readout + Metric Rail.
7. Front view restyle.
8. Mobile.

**C:** the 3D plan's Phases 1–3 (stage, materials, overlays, Metric Rail wiring), using DS components. Expose a
`compare?: CompareTarget` prop for D-ui's ghost. Then Phase 4.8 (ghost + deltas) once D-ui lands.

**D-api:** the 3D plan §4.1–4.4 (model, schemas, router, tests). It can start **immediately**.

**D-ui:** the 3D plan §4.5–4.7: API client, `useFitHistory`, capture/restore of inputs, `FitHistoryPanel`,
`CompareMenu`, `MyFitsSection`, and the `?fit=` loader. It plugs into the slots from A, B and C.

**E:** the 3D plan Phases 5–6 plus Phase 0's elbow test. It exports `buildRiderMeshes(...)` / `buildBikeMeshes(...)`
for C to call, and fills the profile modules that the 2D view also consumes.

### 6.3 Dependency graph and merge order

```
            ┌──────────── D-api (day 0) ─────────────────────────────┐
            │                                                        ▼
DS PR1 ─┬─► A ─────────────────────────────────────────────┐    D-ui ──► C 4.8 (ghost+delta)
        ├─► B (extraction PR first, then restyle) ─────────┤      ▲
        └─► DS PR2 ─┬─► C (Phases 1–3) ────────────────────┼──────┘
                    └─► E (meshes; after C Phase 1 lands) ─┘
```

Merge order into `main`:
1. DS PR1
2. B extraction
3. D-api
4. DS PR2
5. A, B, C (any order; they own disjoint files)
6. E
7. D-ui
8. C ghost/delta

Every track **merges `main` into its branch** after each upstream merge (no rebases on shared branches).

---

## 7. Contracts (frozen interfaces)

| Contract | Owner | Shape |
|---|---|---|
| Tokens | DS | the CSS variable names in §4.1 and `TOKENS[theme].<name>` in TS |
| `fitMetrics` | DS | `MetricId`, `MetricDef`, `METRICS`, `computeAll`, `formatMetric`, `formatDelta`, `DEFAULT_FOCUS` (3D plan §2.1 + §4.5 here) |
| `useMetricFocus` | DS | `{ focused: MetricId; pinned: MetricId[]; focus(id); togglePin(id); reset() }`, max 3 pins |
| `CalloutLayer` | DS | `props: { anchors: { id: MetricId; x: number; y: number; hot?: boolean }[]; width; height; prefer?: Partial<Record<MetricId, [dx, dy]>> }` |
| `riderBody` | E (stubbed by DS) | `PROFILES` (segment radius functions + mass placements for the toned base), `headDeform(x, y, z)`, `withFresnel(material, opts)`; the 2D view draws the same profiles as polygons (§5.5). |
| `bikeProfiles` | E (stubbed by DS) | `TUBE_PROFILE: Record<TubeName, [r0, r1]>`, `RIM`, `CHAINRING` |
| 3D group names | C | `stage-root`, `analytics-root`, `ghost-root`, `mannequin-root`, `mannequin-legs` |
| `CompareTarget` | D-ui | `{ label: string; metrics: Partial<Record<MetricId, number>>; points: Geometry3DPoint[] }` |
| `/fits` API | D-api | the 3D plan §4.2–4.3 |
| Builder slots | B | `ResultsColumn` props `historySlot?: ReactNode`; `StageToolbar` prop `compareSlot?: ReactNode`; `Stage2DSide` prop `compare?: CompareTarget` |
| Profile slot | A | `ProfilePage` renders `<MyFitsSection />` from `web/src/fits/MyFitsSection.tsx` |

---

## 8. Verification (every track, every PR)

1. `cd web && npx tsc --noEmit` is clean.
2. `make test` is green (D-api adds tests; E adds the elbow test).
3. Screenshots with Playwright (`executablePath: '/opt/pw-browsers/chromium'`, args
   `--use-angle=swiftshader --enable-unsafe-swiftshader`; never `playwright install`):
   - desktop 1600×1000 and mobile 390×844;
   - light and dark;
   - every surface you own.
   Compare against the mock-ups and against `/design`, then paste the images into the PR description.
4. Zero console errors or page errors while clicking through your surfaces.
5. **Regression checks:**
   - 2D numbers still equal 3D numbers for the same fit (saddle height, drop, knee extension);
   - frontal-area values are unchanged unless your track changes meshes (then quote before/after);
   - pedalling animation still plays.
6. PR description sections: *Summary*, *Screenshots*, *Contracts touched* (should be "none"), *Requests for other tracks*, *Test plan*.

---

## 9. Kickoff prompts (one per cloud session)

Each prompt is self-contained. Paste it as the first message of a new session on `t0b1n/flowfit`.

### DS

```
You are the Design System track of the FlowFit redesign. Read docs/plans/site-redesign.md fully
(it is the master plan) and docs/plans/3d-instrument-redesign.md §2 and §2.1.
Work on branch claude/redesign-ds from main. Only edit the files listed for DS in §6.1.
Do §6.2 "DS" steps in order, one commit each. Step 1 (CSS split) must produce identical screenshots.
Open PR 1 into main after step 3, and PR 2 after step 8. Do not merge.
Follow §3 rules and §8 verification. Mock-ups: docs/plans/mockups/ (exact CSS values in mockups/src/ff.css and app.css).
```

### A: shell + pages

```
You are track A (app shell + pages) of the FlowFit redesign. Read docs/plans/site-redesign.md fully.
Wait until the DS PR 1 is merged into main (tokens + fonts exist), then branch claude/redesign-shell from main.
Only edit the files listed for A in §6.1. Implement §5.1 and §6.2 "A". Use DS primitives; never add colour literals.
Target look: docs/plans/mockups/01-app-fit-builder-2d-light.png (nav) and the /design route.
Follow §3 and §8. Open a PR into main. Do not merge.
```

### B: Fit Builder + 2D view

```
You are track B (Fit Builder layout + 2D views) of the FlowFit redesign. Read docs/plans/site-redesign.md fully,
plus docs/plans/3d-instrument-redesign.md §5.2–5.3 and §6 (the shared profile numbers).
Branch claude/redesign-builder-2d from main. FIRST open a no-behaviour-change extraction PR (§6.2 "B" step 1).
After DS PR 1 is merged, merge main in and continue with §5.2, §5.3 and the rest of §6.2 "B".
Only edit B's files (§6.1). Provide the slots in §7 "Builder slots". Target: docs/plans/mockups/01-app-fit-builder-2d-light.png.
Never change geometry; restyle only. Follow §3 and §8. Open PRs into main. Do not merge.
```

### C: 3D view

```
You are track C (3D view) of the FlowFit redesign. Read docs/plans/site-redesign.md fully (the master plan)
and docs/plans/3d-instrument-redesign.md (the detailed 3D plan; the master plan wins on conflicts; see §5.6 amendments).
After DS PR 2 is merged, branch claude/redesign-3d from main. Implement 3D plan Phases 1–3 using DS primitives
(useTheme, TOKENS, fitMetrics, useMetricFocus, CalloutLayer, Readout, BandGauge, MetricRail).
Expose `compare?: CompareTarget` on BikeScene3D. Only edit C's files (§6.1).
Targets: docs/plans/mockups/02-view3d-light.png and 03-view3d-dark.png.
Protect the frontal-area probe (3D plan §1.6). Follow §3 and §8. Open a PR into main. Do not merge.
Later, after D-ui lands, do 3D plan §4.8 (ghost + deltas) in a follow-up PR.
```

### D-api: fit history backend

```
You are track D-api (fit history backend) of the FlowFit redesign. Read docs/plans/site-redesign.md §0–§3, §6, §7
and docs/plans/3d-instrument-redesign.md §4.1–4.4. Branch claude/redesign-fits-api from main now (no dependencies).
Implement the Fit model, schemas, /fits router (owner-scoped; another user's fit → 404) and tests
(bikegeo_api/tests/test_fits.py). Add the /fits proxy to web/vite.config.ts.
Only edit D-api's files (§6.1). `make test` must be green. Open a PR into main. Do not merge.
```

### D-ui: fit history frontend

```
You are track D-ui (fit history frontend) of the FlowFit redesign. Read docs/plans/site-redesign.md fully
and docs/plans/3d-instrument-redesign.md §4.5–4.8. Start after DS PR 2 and D-api are merged; branch
claude/redesign-fits-ui from main. Build web/src/fits/** (api client, useFitHistory, FitHistoryPanel,
CompareMenu, MyFitsSection, ?fit= loader, input capture/restore) and plug it into the slots from §7.
If a slot does not exist yet, write the request in your PR description instead of editing that file.
Follow §3 and §8. Open a PR into main. Do not merge.
```

### E: rider + bike meshes

```
You are track E (rider + bike meshes) of the FlowFit redesign. Read docs/plans/site-redesign.md fully and
docs/plans/3d-instrument-redesign.md Phases 0, 5 and 6, and §5.5 of the master plan (it supersedes 3D plan §5.2–5.3). Start after track C's Phase 1 is merged; branch
claude/redesign-meshes from main. Implement the shared limb builder, the anatomical rider (sculpted head, no helmet,
profiles) and the bike shapes. Fill web/src/design/riderBody.ts and bikeProfiles.ts (the 2D view consumes
them too). Add the elbow-direction regression test. Expose builders for BikeScene3D; do not edit BikeScene3D.tsx
(request wiring from track C in your PR). Never change IK or point positions. Follow §3 and §8.
Open a PR into main. Do not merge.
```
