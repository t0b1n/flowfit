/**
 * BikeScene3D.tsx — React Three Fiber 3D bike frame viewer.
 *
 * Features:
 *   - Procedural tube mesh for every frame member
 *   - Torus wheels + joint spheres
 *   - OrbitControls for free tumbling
 *   - GLB export
 *   - Named-point asset attachment (internal — populated programmatically,
 *     e.g. pre-built SRAM / Shimano shifter meshes swapped on component change)
 */

import React, { useCallback, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  Geometry3DResponse,
  Geometry3DPoint,
  Geometry3DEdge,
  buildTubes,
  getWheelCenters,
  Tube3D,
} from "./bike3d";
import type { MannequinSketch } from "./types";

// ── Material ─────────────────────────────────────────────────────────────────

const FRAME_MATERIAL = (
  <meshStandardMaterial metalness={0.55} roughness={0.25} color="#9aa5b8" />
);

const MANNEQUIN_MATERIAL = (
  <meshStandardMaterial metalness={0.0} roughness={0.65} color="#c8a87a" transparent opacity={0.8} />
);

const WHEEL_MATERIAL = (
  <meshStandardMaterial metalness={0.3} roughness={0.45} color="#3a3a3a" />
);

const JOINT_MATERIAL = (
  <meshStandardMaterial metalness={0.65} roughness={0.2} color="#b0bbd0" />
);

// ── Saddle geometry ────────────────────────────────────────────────────────────
//
// Fizik Arione R1: 300 × 130 mm, flat profile, extremely narrow pointed nose,
//                  gentle 4 mm convex crown, diagonal wing-flex cut slots, no cutout.
// Specialized S-Works Power: 243 × 143 mm, rocking-chair profile (35–50 mm),
//                  wide blunt 60 mm nose, 155 × 30 mm Body Geometry channel,
//                  U-shaped rear cross-section (wings elevated above centre).

type SaddleType = "arione" | "power";

// ── Curve utilities ────────────────────────────────────────────────────────────

function _lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function _smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Catmull-Rom spline through control points.
 * Eliminates linear faceting — smooth C1 curves through every knot.
 * Boundary phantoms via reflection so end tangents match the data slope.
 */
function _sampleCR(curve: [number, number][], u: number): number {
  const n = curve.length;
  if (n <= 1) return n === 1 ? curve[0][1] : 0;
  if (u <= curve[0][0]) return curve[0][1];
  if (u >= curve[n - 1][0]) return curve[n - 1][1];
  let i = 0;
  while (i < n - 2 && curve[i + 1][0] <= u) i++;
  const [u0, v0] = curve[i];
  const [u1, v1] = curve[i + 1];
  const t  = (u - u0) / (u1 - u0);
  const t2 = t * t, t3 = t2 * t;
  const vm1 = i > 0      ? curve[i - 1][1] : v0 - (v1 - v0);
  const v2   = i < n - 2 ? curve[i + 2][1] : v1 + (v1 - v0);
  return 0.5 * (
    2 * v0 +
    (-vm1 + v1)                 * t  +
    (2*vm1 - 5*v0 + 4*v1 - v2) * t2 +
    (-vm1 + 3*v0 - 3*v1 + v2)  * t3
  );
}

interface SaddleSpec {
  label: string;
  /** Nose-to-tail length in mm */
  length: number;
  /** Half-width profile: u=0 nose, u=1 tail */
  widthCurve: [number, number][];
  /** Center-surface height above rail level in mm */
  heightCurve: [number, number][];
  /**
   * Lateral crown amplitude in mm.
   * Positive = convex (center high); negative = concave (edges high).
   */
  crownCurve: [number, number][];
  /**
   * Crown exponent u-curve.
   * exp=2 → smooth parabola; exp<1 → flat wings with steep center.
   */
  crownExpCurve: [number, number][];
  /** Optional central relief channel */
  cutout?: {
    uStart: number; uEnd: number;
    maxDepth: number; sHalfWidth: number;
    /** Wall steepness: 1=triangular, 4=near-rectangular */
    edgeSteepness: number;
  };
  /** Arione-style diagonal wing-flex cut depressions */
  wingFlexCuts?: boolean;
  /** u position of rider contact zone */
  contactU: number;
  /** Mesh local Y at contactU, s=0 (used to align with world saddle point) */
  riderContactHeight: number;
  /** Half of rail centre-to-centre spread (standard: 22 mm) */
  railSpread: number;
  /** Local +X of rail forward end */
  railFwdX: number;
  /** Local −X of rail rear end */
  railRearX: number;
}

// Measurements derived from manufacturer specs and reference images.
const SADDLE_DETAIL: Record<SaddleType, SaddleSpec> = {
  /**
   * Fizik Arione R1 — 302 × 130 mm
   * Ultra-long flat race saddle: needle-point nose, narrow flat body, gentle
   * convex crown. Distinctive diagonal wing-flex cut notches at nose junction.
   */
  arione: {
    label: "Arione",
    length: 302,
    widthCurve: [
      // Narrow stalk nose: rounded but stays slim until ~25%
      [0,    6  ],  // rounded nose tip
      [0.05, 10 ],
      [0.10, 14 ],
      [0.17, 20 ],
      [0.25, 30 ],  // stalk transitions to wings
      [0.35, 44 ],
      [0.48, 56 ],
      [0.62, 63 ],
      [0.78, 65 ],
      [0.90, 65 ],
      [1.0,  63 ],
    ],
    heightCurve: [
      [0.0,  38 ],
      [0.20, 39 ],
      [0.50, 40 ],
      [0.75, 41 ],
      [1.0,  42 ],
    ],
    crownCurve:    [[0, 3.0], [0.5, 3.8], [1, 4.5]],
    crownExpCurve: [[0, 2.2], [1, 2.0]],  // smooth parabola throughout
    wingFlexCuts: true,
    contactU: 0.68,
    riderContactHeight: 45,  // 40 mm base + 4 mm crown at s=0
    railSpread: 22,
    railFwdX:  128,
    railRearX: -132,
  },

  /**
   * Specialized S-Works Power — 243 × 143 mm
   * Short-nose compact saddle: wide blunt nose, rocking-chair profile,
   * 155 × 30 mm Body Geometry central relief channel, near-flat rear wings.
   */
  power: {
    label: "Power",
    length: 243,
    widthCurve: [
      // Slim rounded stalk stays narrow until ~22%, then body balloons out
      [0,    12 ],  // rounded blunt nose
      [0.05, 15 ],
      [0.10, 18 ],  // narrow stalk
      [0.17, 22 ],
      [0.22, 28 ],  // stalk-to-body transition begins
      [0.30, 46 ],  // rapid widening into the body
      [0.40, 62 ],
      [0.52, 68 ],
      [0.65, 71 ],
      [0.80, 71.5],
      [1.0,  70 ],
    ],
    // Rocking-chair: nose low, mid rises, tail elevated
    heightCurve: [
      [0.0,  34 ],
      [0.18, 38 ],
      [0.40, 42 ],
      [0.62, 45 ],
      [0.82, 48 ],
      [1.0,  51 ],
    ],
    crownCurve: [
      [0.0,  6 ],
      [0.30, 8 ],
      [0.55, 6 ],
      [0.75, 4 ],
      [1.0,  4 ],
    ],
    // Rear: low exponent → flat wings + steep central drop (Body Geometry look)
    crownExpCurve: [
      [0.0,  2.0 ],
      [0.35, 1.5 ],
      [0.60, 0.8 ],
      [0.80, 0.45],
      [1.0,  0.40],
    ],
    // Body Geometry through-hole: runs from near-nose to mid-body, ~24 mm wide
    cutout: { uStart: 0.08, uEnd: 0.70, maxDepth: 80, sHalfWidth: 0.22, edgeSteepness: 5 },
    contactU: 0.68,
    riderContactHeight: 48,  // wing surface at contactU, s≈0.5: ch≈46 + crown≈4 − cut≈0 ≈ 50
    railSpread: 22,
    railFwdX:   65,
    railRearX:  -65,
  },
};

/**
 * Build a closed parametric saddle mesh with optional true through-hole.
 *
 * Local coordinate system (group origin = rail centre below contact point):
 *   X  forward (nose at +length/2),  Y  up,  Z  lateral (±halfWidth)
 *
 * u = 0 → nose (+X),  u = 1 → tail (−X),  s = 2*(vi/V)−1 ∈ [−1,1]
 *
 * Through-hole: quads where ALL 4 vertices are inside the hole zone are
 * omitted from top AND bottom surfaces, leaving an open aperture.
 */
function buildSaddleGeometry(spec: SaddleSpec): THREE.BufferGeometry {
  const U = 96, V = 48, SHELL = 8;
  const V1 = V + 1;
  const nPts = (U + 1) * V1;

  const topPos = new Float32Array(nPts * 3);
  const botPos = new Float32Array(nPts * 3);
  // 1 = vertex is inside the through-hole (quads fully inside will be omitted)
  const inHole = new Uint8Array(nPts);

  for (let ui = 0; ui <= U; ui++) {
    const u   = ui / U;
    const hw  = _sampleCR(spec.widthCurve, u);
    const ch  = _sampleCR(spec.heightCurve, u);
    const crownScale = _sampleCR(spec.crownCurve, u);
    const exp = Math.max(0.1, _sampleCR(spec.crownExpCurve, u));
    const x   = (0.5 - u) * spec.length;

    // Pre-compute cutout u-fade for this column
    let uFade = 0;
    if (spec.cutout) {
      const { uStart, uEnd } = spec.cutout;
      uFade = _smoothstep(uStart, uStart + 0.08, u) *
              (1 - _smoothstep(uEnd - 0.07, uEnd, u));
    }

    for (let vi = 0; vi <= V; vi++) {
      const s    = (vi / V) * 2 - 1;
      const absS = Math.abs(s);
      const z    = s * hw;

      // Variable-exponent crown
      const crown = crownScale * (1 - Math.pow(absS, exp));

      // Cutout channel / through-hole
      let cut  = 0;
      let hole = false;
      if (spec.cutout && absS < spec.cutout.sHalfWidth) {
        const { maxDepth, sHalfWidth, edgeSteepness } = spec.cutout;
        const sNorm = absS / sHalfWidth;
        const sFade = 1 - Math.pow(sNorm, edgeSteepness);
        cut  = maxDepth * uFade * sFade;
        // Through-hole zone: well inside both u-range and s-range
        hole = uFade > 0.90 && sNorm < 0.72;
      }

      // Arione diagonal wing-flex cut depressions (4 shallow Gaussian slots/side)
      let wingCut = 0;
      if (spec.wingFlexCuts) {
        for (let slot = 0; slot < 4; slot++) {
          const slotU = 0.24 + slot * 0.055;
          const slotS = 0.66 + slot * 0.025;
          const du    = u    - slotU;
          const ds    = absS - slotS;
          const along = (du + ds) * 0.707;
          const perp  = (-du + ds) * 0.707;
          const g = Math.exp(-0.5 * ((along / 0.030) ** 2 + (perp / 0.008) ** 2));
          wingCut = Math.max(wingCut, 2.8 * g);
        }
      }

      const ptIdx = ui * V1 + vi;
      inHole[ptIdx] = hole ? 1 : 0;

      const y = ch + crown - cut - wingCut;
      const i = ptIdx * 3;
      topPos[i    ] = x;  topPos[i + 1] = y;                      topPos[i + 2] = z;
      botPos[i    ] = x;  botPos[i + 1] = Math.max(0, y - SHELL); botPos[i + 2] = z;
    }
  }

  const allPos = new Float32Array(nPts * 6);
  allPos.set(topPos, 0);
  allPos.set(botPos, nPts * 3);

  const idx: number[] = [];

  // Returns true when all 4 quad vertices are in the through-hole → skip
  function hq(ui: number, vi: number): boolean {
    return !!(inHole[ui*V1+vi] & inHole[ui*V1+vi+1] &
              inHole[(ui+1)*V1+vi] & inHole[(ui+1)*V1+vi+1]);
  }

  // Top surface — CCW from above (normal up); skip hole quads
  for (let ui = 0; ui < U; ui++) {
    for (let vi = 0; vi < V; vi++) {
      if (hq(ui, vi)) continue;
      const a = ui*V1+vi, b = a+1, c = (ui+1)*V1+vi, d = c+1;
      idx.push(a, c, b,  b, c, d);
    }
  }
  // Bottom surface — CW from above (normal down); skip hole quads
  for (let ui = 0; ui < U; ui++) {
    for (let vi = 0; vi < V; vi++) {
      if (hq(ui, vi)) continue;
      const a = nPts+ui*V1+vi, b = a+1, c = nPts+(ui+1)*V1+vi, d = c+1;
      idx.push(a, b, c,  b, d, c);
    }
  }
  // Nose wall (+X)
  for (let vi = 0; vi < V; vi++) {
    const tA = vi, tB = vi+1, bA = nPts+tA, bB = nPts+tB;
    idx.push(tA, tB, bA,  tB, bB, bA);
  }
  // Tail wall (−X)
  for (let vi = 0; vi < V; vi++) {
    const tA = U*V1+vi, tB = tA+1, bA = nPts+tA, bB = nPts+tB;
    idx.push(tA, bA, tB,  tB, bA, bB);
  }
  // Left edge (vi=0)
  for (let ui = 0; ui < U; ui++) {
    const tA = ui*V1, tB = (ui+1)*V1, bA = nPts+tA, bB = nPts+tB;
    idx.push(tA, bA, tB,  tB, bA, bB);
  }
  // Right edge (vi=V)
  for (let ui = 0; ui < U; ui++) {
    const tA = ui*V1+V, tB = (ui+1)*V1+V, bA = nPts+tA, bB = nPts+tB;
    idx.push(tA, tB, bA,  tB, bB, bA);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(allPos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Pre-build at module load — stable references so R3F never rebuilds geometry
const SADDLE_GEO: Record<SaddleType, THREE.BufferGeometry> = {
  arione: buildSaddleGeometry(SADDLE_DETAIL.arione),
  power:  buildSaddleGeometry(SADDLE_DETAIL.power),
};

/** Cylinder between two THREE.Vector3 points, used for rails and clamp. */
function RailTube({
  a, b, r = 3.5,
}: {
  a: THREE.Vector3; b: THREE.Vector3; r?: number;
}) {
  const dir  = new THREE.Vector3().subVectors(b, a);
  const len  = dir.length();
  if (len < 0.5) return null;
  const mid  = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.normalize()
  );
  return (
    <mesh position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
      <cylinderGeometry args={[r, r, len, 8, 1]} />
      <meshStandardMaterial metalness={0.82} roughness={0.18} color="#c8c8c8" />
    </mesh>
  );
}

function SaddleMesh({
  geo,
  saddleType,
}: {
  geo: Geometry3DResponse;
  saddleType: SaddleType;
}) {
  const ptMap = new Map(geo.points.map((p) => [p.name, p.pos]));
  const sp = ptMap.get("saddle");
  if (!sp) return null;

  const [sx, sy, sz] = sp;
  const spec = SADDLE_DETAIL[saddleType];

  // Mesh group origin: local Y=0 = rail level
  // Contact zone (u=contactU, s=0) must land at world [sx, sy, sz]
  const contactLocalX = (0.5 - spec.contactU) * spec.length;
  const meshX = sx - contactLocalX;         // slide mesh so contact aligns
  const meshY = sy - spec.riderContactHeight; // lower mesh so contact is at sy

  const fwd  = spec.railFwdX;
  const rear = spec.railRearX;
  const rs   = spec.railSpread;

  return (
    <group position={[meshX, meshY, sz]}>
      {/* Saddle body */}
      <mesh geometry={SADDLE_GEO[saddleType]}>
        <meshStandardMaterial metalness={0.04} roughness={0.88} color="#0f0f0f" />
      </mesh>

      {/* Rails — bilateral, oval cross-section approximated as cylinder */}
      <RailTube a={new THREE.Vector3(fwd, 0, -rs)} b={new THREE.Vector3(rear, 0, -rs)} />
      <RailTube a={new THREE.Vector3(fwd, 0,  rs)} b={new THREE.Vector3(rear, 0,  rs)} />

      {/* Clamp crossbar — wider cylinder at x=0 (contact zone) */}
      <RailTube
        a={new THREE.Vector3(0, 0, -rs - 7)}
        b={new THREE.Vector3(0, 0,  rs + 7)}
        r={5}
      />
    </group>
  );
}

// ── Tube mesh (cylinder positioned between start and end) ─────────────────────

function TubeMesh({ tube }: { tube: Tube3D }) {
  const [sx, sy, sz] = tube.start;
  const [ex, ey, ez] = tube.end;

  const start = new THREE.Vector3(sx, sy, sz);
  const end = new THREE.Vector3(ex, ey, ez);
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 1) return null;

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  // Quaternion: default cylinder axis is Y+, rotate to align with dir
  const axis = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());

  const isMannequin = tube.group.startsWith("mannequin");

  return (
    <mesh position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
      <cylinderGeometry args={[tube.radius, tube.radius, length, 12, 1]} />
      {isMannequin ? MANNEQUIN_MATERIAL : FRAME_MATERIAL}
    </mesh>
  );
}

// ── Joint spheres at key nodes ───────────────────────────────────────────────

const JOINT_NODES = ["bb", "rear_axle", "front_axle", "head_tube_top", "head_tube_bottom"];

function JointSpheres({ geo }: { geo: Geometry3DResponse }) {
  const ptMap = new Map(geo.points.map((p) => [p.name, p.pos]));
  return (
    <>
      {JOINT_NODES.map((name) => {
        const pos = ptMap.get(name);
        if (!pos) return null;
        return (
          <mesh key={name} position={pos}>
            <sphereGeometry args={[12, 10, 10]} />
            {JOINT_MATERIAL}
          </mesh>
        );
      })}
    </>
  );
}

// ── Wheels ───────────────────────────────────────────────────────────────────

function Wheels({
  geo,
  wheelRadius,
}: {
  geo: Geometry3DResponse;
  wheelRadius: number;
}) {
  const { rear, front } = getWheelCenters(geo.points);
  const tyreRadius = 14; // visual tyre cross-section radius

  return (
    <>
      {rear && (
        <mesh position={rear}>
          <torusGeometry args={[wheelRadius - tyreRadius, tyreRadius, 16, 80]} />
          {WHEEL_MATERIAL}
        </mesh>
      )}
      {front && (
        <mesh position={front}>
          <torusGeometry args={[wheelRadius - tyreRadius, tyreRadius, 16, 80]} />
          {WHEEL_MATERIAL}
        </mesh>
      )}
    </>
  );
}

// ── Attached asset ────────────────────────────────────────────────────────────

interface AttachedAsset {
  pointName: string;
  url: string; // object URL from FileReader
}

function AttachedAssetMesh({
  asset,
  geo,
}: {
  asset: AttachedAsset;
  geo: Geometry3DResponse;
}) {
  const { scene } = useGLTF(asset.url);
  const ptMap = new Map(geo.points.map((p) => [p.name, p.pos]));
  const pos = ptMap.get(asset.pointName);
  if (!pos) return null;
  return <primitive object={scene.clone()} position={pos} />;
}

// ── GLB Export helper (lives inside Canvas to access Three.js scene) ──────────

function SceneExporter({
  onExportReady,
}: {
  onExportReady: (fn: () => void) => void;
}) {
  const { scene } = useThree();

  React.useEffect(() => {
    onExportReady(() => {
      const exporter = new GLTFExporter();
      exporter.parse(
        scene,
        (result: ArrayBuffer | Record<string, unknown>) => {
          const blob = new Blob(
            [result instanceof ArrayBuffer ? result : JSON.stringify(result)],
            { type: "model/gltf-binary" }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "bike_frame.glb";
          a.click();
          URL.revokeObjectURL(url);
        },
        (err: ErrorEvent) => console.error("GLTFExporter error:", err),
        { binary: true }
      );
    });
  }, [scene, onExportReady]);

  return null;
}

// ── Scene bounding box helpers ────────────────────────────────────────────────

function sceneBounds(geo: Geometry3DResponse): {
  center: [number, number, number];
  span: number;
} {
  if (geo.points.length === 0) return { center: [0, 0, 0], span: 2000 };
  const xs = geo.points.map((p) => p.pos[0]);
  const ys = geo.points.map((p) => p.pos[1]);
  const zs = geo.points.map((p) => p.pos[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    600 // minimum span so a tiny scene still has a sensible camera
  );
  return { center: [cx, cy, cz], span };
}

// ── 2D skeleton overlay (sagittal plane, z=0) ─────────────────────────────────

function Overlay2D({ mannequin2D }: { mannequin2D: MannequinSketch }) {
  const m = mannequin2D;
  const segments: [[number, number], [number, number]][] = [
    [[m.hip.x, m.hip.y], [m.knee.x, m.knee.y]],
    [[m.knee.x, m.knee.y], [m.ankle.x, m.ankle.y]],
    [[m.hip.x, m.hip.y], [m.shoulder.x, m.shoulder.y]],
    [[m.shoulder.x, m.shoulder.y], [m.elbow.x, m.elbow.y]],
    [[m.elbow.x, m.elbow.y], [m.hands.x, m.hands.y]],
  ];

  return (
    <>
      {segments.map(([[x1, y1], [x2, y2]], i) => {
        const start = new THREE.Vector3(x1, y1, 0);
        const end = new THREE.Vector3(x2, y2, 0);
        const dir = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();
        if (length < 1) return null;
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize()
        );
        return (
          <mesh key={i} position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
            <cylinderGeometry args={[3, 3, length, 6, 1]} />
            <meshStandardMaterial color="#00ffaa" emissive="#00ffaa" emissiveIntensity={0.4} roughness={0.5} metalness={0} />
          </mesh>
        );
      })}
    </>
  );
}

// ── Main scene content (inside Canvas) ───────────────────────────────────────

function SceneContent({
  geo,
  attachedAssets,
  onExportReady,
  target,
  showMannequin,
  saddleType,
  show2dOverlay,
  mannequin2D,
  mannequin3DOverride,
}: {
  geo: Geometry3DResponse;
  attachedAssets: AttachedAsset[];
  onExportReady: (fn: () => void) => void;
  target: [number, number, number];
  showMannequin: boolean;
  saddleType: SaddleType;
  show2dOverlay: boolean;
  mannequin2D?: MannequinSketch;
  mannequin3DOverride?: { points: Geometry3DPoint[]; edges: Geometry3DEdge[] };
}) {
  // When frontend-computed mannequin data is provided, replace backend mannequin
  // points/edges so the 3D mesh uses the correct trunk angle from forward kinematics.
  const effectivePoints = mannequin3DOverride
    ? [
        ...geo.points.filter((p) => p.group !== "mannequin"),
        ...mannequin3DOverride.points,
      ]
    : geo.points;
  const effectiveEdges = mannequin3DOverride
    ? [
        ...geo.edges.filter((e) => !e.group.startsWith("mannequin")),
        ...mannequin3DOverride.edges,
      ]
    : geo.edges;

  const allTubes = buildTubes(effectivePoints, effectiveEdges);
  const tubes = showMannequin
    ? allTubes
    : allTubes.filter((t) => !t.group.startsWith("mannequin"));
  const wheelRadius = geo.frame.wheel_radius ?? 311;

  return (
    <>
      <color attach="background" args={["#0d1117"]} />

      {/* Lighting */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[1000, 1500, 800]} intensity={1.4} />
      <directionalLight position={[-500, 600, -600]} intensity={0.5} />

      {/* Frame tubes */}
      {tubes.map((tube, i) => (
        <TubeMesh key={i} tube={tube} />
      ))}

      {/* Joints */}
      <JointSpheres geo={geo} />

      {/* Wheels */}
      <Wheels geo={geo} wheelRadius={wheelRadius} />

      {/* Saddle */}
      <SaddleMesh geo={geo} saddleType={saddleType} />

      {/* Attached custom assets */}
      {attachedAssets.map((asset, i) => (
        <AttachedAssetMesh key={i} asset={asset} geo={geo} />
      ))}

      {/* 2D skeleton overlay */}
      {show2dOverlay && mannequin2D && <Overlay2D mannequin2D={mannequin2D} />}

      {/* Orbit controls — target the scene centre so tumbling feels natural */}
      <OrbitControls makeDefault target={target} />

      {/* Export hook */}
      <SceneExporter onExportReady={onExportReady} />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface BikeScene3DProps {
  geo: Geometry3DResponse;
  mannequin2D?: MannequinSketch;
  mannequin3DOverride?: { points: Geometry3DPoint[]; edges: Geometry3DEdge[] };
}

function exportJson(geo: Geometry3DResponse) {
  const blob = new Blob([JSON.stringify(geo, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fit_data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(geo: Geometry3DResponse) {
  const rows = [
    "name,x,y,z,group",
    ...geo.points.map((p) => `${p.name},${p.pos[0].toFixed(2)},${p.pos[1].toFixed(2)},${p.pos[2].toFixed(2)},${p.group}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fit_data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export const BikeScene3D: React.FC<BikeScene3DProps> = ({ geo, mannequin2D, mannequin3DOverride }) => {
  const [devMode, setDevMode] = useState(false);
  const [showMannequin, setShowMannequin] = useState(true);
  const [show2dOverlay, setShow2dOverlay] = useState(false);
  const [saddleType, setSaddleType] = useState<SaddleType>("power");
  // attachedAssets: populated programmatically (e.g. SRAM / Shimano shifter meshes
  // swapped on component change). Dev mode exposes runtime file import for authoring.
  const [attachedAssets, setAttachedAssets] = useState<AttachedAsset[]>([]);
  const [attachPointName, setAttachPointName] = useState<string>("");
  const exportFnRef = useRef<(() => void) | null>(null);

  const handleExportReady = useCallback((fn: () => void) => {
    exportFnRef.current = fn;
  }, []);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !attachPointName) return;
    const url = URL.createObjectURL(file);
    setAttachedAssets((prev) => [
      ...prev.filter((a) => a.pointName !== attachPointName),
      { pointName: attachPointName, url },
    ]);
    e.target.value = "";
  };

  const attachablePoints = geo.points
    .filter((p) => p.group === "frame")
    .map((p) => p.name);

  // Derive camera position from the scene bounding box so the whole bike fits
  const { center, span } = sceneBounds(geo);
  // fov=45° half-angle ≈ 22.5°, tan(22.5°) ≈ 0.414 → distance = span/2 / 0.414 * 1.3 (padding)
  const camDist = (span / 2 / 0.414) * 1.3;
  const camPos: [number, number, number] = [
    center[0] + camDist * 0.15,   // slight rightward offset
    center[1] + camDist * 0.25,   // slightly above centre
    camDist,
  ];

  return (
    <div className="bike3d-container">
      {/* Toolbar */}
      <div className="bike3d-toolbar">
        {devMode ? (
          <>
            <button className="tab-pill" onClick={() => exportFnRef.current?.()}>
              Export .glb
            </button>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                className="tab-pill"
                value={attachPointName}
                onChange={(e) => setAttachPointName(e.target.value)}
              >
                <option value="">Attach mesh to…</option>
                {attachablePoints.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <label className="tab-pill" style={{ cursor: "pointer" }}>
                Import .glb
                <input
                  type="file"
                  accept=".glb,.gltf"
                  style={{ display: "none" }}
                  onChange={handleFileImport}
                  disabled={!attachPointName}
                />
              </label>
            </span>
            {attachedAssets.length > 0 && (
              <button className="tab-pill" onClick={() => setAttachedAssets([])}>
                Clear assets
              </button>
            )}
          </>
        ) : (
          <>
            <button className="tab-pill" onClick={() => exportJson(geo)}>
              Export JSON
            </button>
            <button className="tab-pill" onClick={() => exportCsv(geo)}>
              Export CSV
            </button>
          </>
        )}
        <button
          className={`tab-pill ${showMannequin ? "tab-pill--active" : ""}`}
          onClick={() => setShowMannequin((v) => !v)}
        >
          Rider
        </button>
        {mannequin2D && (
          <button
            className={`tab-pill ${show2dOverlay ? "tab-pill--active" : ""}`}
            onClick={() => setShow2dOverlay((v) => !v)}
          >
            2D overlay
          </button>
        )}
        {(Object.keys(SADDLE_DETAIL) as SaddleType[]).map((t) => (
          <button
            key={t}
            className={`tab-pill ${saddleType === t ? "tab-pill--active" : ""}`}
            onClick={() => setSaddleType(t)}
          >
            {SADDLE_DETAIL[t].label}
          </button>
        ))}
        <button
          className={`tab-pill ${devMode ? "tab-pill--active" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => setDevMode((v) => !v)}
        >
          Dev
        </button>
      </div>

      {/* Canvas wrapper — explicit height so R3F gets a non-zero pixel size */}
      <div className="bike3d-canvas-wrapper">
        <Canvas
          camera={{ position: camPos, fov: 45, near: 1, far: 50000 }}
          style={{ width: "100%", height: "100%" }}
        >
          <SceneContent
            geo={geo}
            attachedAssets={attachedAssets}
            onExportReady={handleExportReady}
            target={center}
            showMannequin={showMannequin}
            saddleType={saddleType}
            show2dOverlay={show2dOverlay}
            mannequin2D={mannequin2D}
            mannequin3DOverride={mannequin3DOverride}
          />
        </Canvas>
      </div>
    </div>
  );
};
