# 3D Geometry & Rendering Overview

## Coordinate System

Origin: bottom bracket (BB), units: millimeters.

- **X** — forward (travel direction)
- **Y** — up
- **Z** — lateral (positive = rider's left)

---

## 2D Solved Input

### Frame (2D, sagittal plane)

`synthesize_bike()` in `bikegeo_core/geometry.py` takes parametric frame specs (stack, reach, angles, bb_drop, chainstay, fork length) and computes named 2D contact/structural points: wheel axles, head tube ends, seat tube, saddle clamp, steerer, stem, bars.

All frame points live at Z=0 (centerline).

### Rider Mannequin (2D, sagittal plane)

`buildMannequin()` in `web/src/geometry.ts` runs forward/inverse kinematics from contact points (saddle, hoods, cleats) using circle intersections (`circleIntersections()`) to resolve joint positions: cleat, ankle, knee, hip, shoulder, elbow, wrist. Returns a flat set of named 2D points.

The frontend re-runs this at interactive speed when the trunk angle slider changes (overriding the backend result).

---

## 3D Expansion (2D → 3D)

### Frame

Frame structural points are copied into 3D at Z=0. No bilateral expansion needed — the frame is symmetric and rendered as single centerline tubes. Bilateral elements (chainstays, seatstays, fork blades) are represented as two separate edges, each at ±Z offsets derived from tyre/frame dimensions.

### Mannequin

`solve_pose_3d()` (`bikegeo_core/mannequin3d.py`) and `buildMannequin3DPoints()` (`web/src/geometry.ts:639`) bilaterally expand the 2D sagittal joints into a full 3D skeleton:

| Width parameter | Default | Applied to |
|---|---|---|
| `stance_width` | 155 mm | foot/cleat lateral spread |
| `hip_width` | 200 mm | pelvis separation |
| `shoulder_width` | derived | shoulder separation |
| `hood_width` | derived | handlebar width |

Every leg and arm joint is duplicated at `+Z` (left) and `−Z` (right). Hip and shoulder get center-points plus bilateral counterparts. The torso is a single segment between `hip_center` and `shoulder_center`.

The frontend re-runs bilateral expansion from the current 2D solve and **replaces** the backend mannequin data at render time (see the `mannequin3DOverride` path in `FitBuilderMode.tsx:260`).

---

## Geometry Data Structures

Defined in `web/src/bike3d.ts`:

```ts
type Geometry3DPoint = { name: string; pos: [x, y, z]; group: string }
type Geometry3DEdge  = { a: string; b: string; group: string }
type Tube3D          = { start: [x,y,z]; end: [x,y,z]; radius: number; group: string }
```

`buildTubes()` (`bike3d.ts:99`) converts the point+edge graph into `Tube3D` cylinders by looking up each edge name in `TUBE_RADIUS` (a named table of outer radii in mm — e.g. down_tube=16, leg=55, arm=35).

---

## Saddle Mesh (Procedural)

`buildSaddleGeometry()` (`BikeScene3D.tsx:238`) produces a closed `THREE.BufferGeometry` from a parametric surface:

- **Grid**: U=96 (nose→tail) × V=48 (left→right)
- Per-profile curves sampled with Catmull-Rom splines (`_sampleCR()`):
  - `widthCurve` — half-width vs. u
  - `heightCurve` — centerline height vs. u
  - `crownCurve` — lateral crown amplitude
  - `crownExpCurve` — crown shape exponent (flat wing vs. round)
  - `cutout` — optional central relief channel with Gaussian steepness
  - `wingFlexCuts` — diagonal Gaussian slot depressions (Arione only)
- **Surfaces**: top crown, bottom shell (8 mm thickness), nose/tail walls, left/right edge walls
- Quads that fall entirely inside a through-hole zone are skipped
- `computeVertexNormals()` applied for smooth shading

Two saddle specs are defined: **Arione R1** (302×130 mm, narrow nose) and **Power S-Works** (243×143 mm, blunt nose, body geometry channel). Geometries are built once at module load and swapped by saddle type at render time.

---

## Scene Composition & Rendering

### Stack

React Three Fiber (R3F) → Three.js → WebGL 2.0. No custom GLSL — all materials use Three.js built-in `meshStandardMaterial` (PBR).

### Camera

`sceneBounds()` (`BikeScene3D.tsx:575`) computes an axis-aligned bounding box over all 3D points. Camera distance = `(span/2 / tan(22.5°)) × 1.3`, positioned slightly right (+15%) and up (+25%) of center, FOV=45°. `OrbitControls` allows free tumbling.

### Render Order & Components

| Layer | Component | Geometry |
|---|---|---|
| Frame | `TubeMesh` | `CylinderGeometry(r, r, len, 12)` per edge |
| Joints | sphere mesh | `SphereGeometry(12mm)` at each point |
| Wheels | `Wheels` | `TorusGeometry(R, 14mm tyre, 16, 80)` × 2 |
| Saddle | `SaddleMesh` | pre-built `BufferGeometry` + bilateral rail cylinders |
| Imported assets | GLB/GLTF loader | attached components (shoes, etc.) |
| 2D overlay | `mannequin2D` | optional sagittal-plane skeleton |

### Cylinder Alignment

All tube/rail cylinders share the same quaternion alignment pattern:

```ts
const quat = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),   // default cylinder axis
  dir.normalize()               // desired edge direction
);
```

Position set to edge midpoint, scale to edge length.

### Materials

| Material | Color | Metalness | Roughness | Notes |
|---|---|---|---|---|
| Frame | `#9aa5b8` | 0.55 | 0.25 | steel-like |
| Mannequin | `#c8a87a` | 0.0 | 0.65 | flesh, 80% opacity |
| Wheels | `#3a3a3a` | 0.3 | 0.45 | dark rubber |
| Joints | `#b0bbd0` | 0.65 | 0.2 | chrome |

### Lighting

- Ambient: intensity 0.7
- Main directional: `[1000, 1500, 800]`, intensity 1.4
- Fill directional: `[-500, 600, -600]`, intensity 0.5

---

## End-to-End Data Flow

```
User input (BikeSelection, RiderFit, Components)
  │
  ├─ 2D synthesis (frontend, interactive):
  │    synthesizeBike() + buildMannequin()
  │    → named 2D points (sagittal plane, Z=0)
  │
  ├─ POST /geometry3d (backend):
  │    solve_setup() → synthesize_bike() → build_export()
  │    → solve_pose_3d()  (bilateral 3D expansion)
  │    → Geometry3DResponse { points[], edges[], metrics }
  │
  ├─ Frontend override (trunk angle slider):
  │    buildMannequin() → buildMannequin3DPoints()
  │    → replaces mannequin group in geo.points/edges
  │
  └─ Render (BikeScene3D):
       buildTubes()  →  TubeMesh × N  (cylinders)
       SaddleMesh    →  parametric BufferGeometry
       Wheels        →  Torus × 2
       Joints        →  Sphere × N
       GLTF assets   →  attached components
       Canvas → WebGL rasterization → display
```

---

## Key File Reference

| Concern | File |
|---|---|
| Frame 2D synthesis | `bikegeo_core/geometry.py` |
| Mannequin 2D IK | `web/src/geometry.ts` (`buildMannequin`) |
| 3D bilateral expansion (backend) | `bikegeo_core/mannequin3d.py` |
| 3D bilateral expansion (frontend) | `web/src/geometry.ts` (`buildMannequin3DPoints`) |
| 3D point/edge export | `bikegeo_core/geometry_export.py` |
| API endpoint | `bikegeo_api/main.py` (`/geometry3d`) |
| Tube radii & buildTubes | `web/src/bike3d.ts` |
| Saddle parametric mesh | `web/src/BikeScene3D.tsx` (`buildSaddleGeometry`) |
| Scene composition & render | `web/src/BikeScene3D.tsx` (`SceneContent`) |
| Data flow orchestration | `web/src/FitBuilderMode.tsx` |
