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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  Geometry3DResponse,
  Geometry3DPoint,
  Geometry3DEdge,
  buildTubes,
  buildMannequinParts,
  getWheelCenters,
  Tube3D,
  MannequinPart3D,
  LEG_POINT_NAMES,
  LEG_EDGE_GROUPS,
} from "./bike3d";
import { AnimatedLegs } from "./AnimatedLegs";
import {
  BAND_COLORS,
  DimensionLines3D,
  JointArc,
  KneeArcAnimated,
  KopsIndicator,
} from "./FitAnalytics3D";
import {
  angleAtPoint,
  bandStatus,
  kneeExtensionAt,
  type PedalStrokeLUT,
  type PosturePreset,
} from "./geometry";
import type { MannequinSketch } from "./types";

// ── Material ─────────────────────────────────────────────────────────────────

const FRAME_MATERIAL = (
  <meshStandardMaterial metalness={0.55} roughness={0.25} color="#9aa5b8" />
);

const MANNEQUIN_BODY_MATERIAL = (
  <meshStandardMaterial color="#7a8fa6" roughness={0.55} metalness={0.05} />
);

const MANNEQUIN_JOINT_MATERIAL_ELEM = (
  <meshStandardMaterial color="#5c6e82" roughness={0.4} metalness={0.1} />
);

const MANNEQUIN_OUTLINE_MATERIAL = (
  <meshBasicMaterial color="#2a3540" side={THREE.BackSide} />
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

  return (
    <mesh position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
      <cylinderGeometry args={[tube.radius, tube.radius, length, 12, 1]} />
      {FRAME_MATERIAL}
    </mesh>
  );
}

// ── Mannequin primitive meshes ──────────────────────────────────────────────

/** Outline scale factor for inverted-hull outlines */
const OUTLINE_SCALE = 1.015;

function MannequinPartMesh({ part }: { part: MannequinPart3D }) {
  if (part.type === "sphere") {
    return <MannequinSphereMesh part={part} />;
  }
  // cylinder, tapered_cylinder, capsule all share directional positioning
  const [sx, sy, sz] = part.start;
  const [ex, ey, ez] = part.end;
  const start = new THREE.Vector3(sx, sy, sz);
  const end = new THREE.Vector3(ex, ey, ez);
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 1) return null;

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const axis = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
  const posArr = mid.toArray();
  const quatArr = quat.toArray() as [number, number, number, number];

  if (part.type === "capsule") {
    const bodyLength = Math.max(0, length - part.radiusStart * 2);
    return (
      <group position={posArr} quaternion={quatArr}>
        <mesh>
          <capsuleGeometry args={[part.radiusStart, bodyLength, 16, 32]} />
          {MANNEQUIN_BODY_MATERIAL}
        </mesh>
        <mesh scale={[OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE]}>
          <capsuleGeometry args={[part.radiusStart, bodyLength, 16, 32]} />
          {MANNEQUIN_OUTLINE_MATERIAL}
        </mesh>
      </group>
    );
  }

  if (part.type === "tapered_cylinder") {
    // Use average radius as a uniform capsule for rounded ends
    const avgR = (part.radiusStart + part.radiusEnd) / 2;
    const bodyLength = Math.max(0, length - avgR * 2);
    return (
      <group position={posArr} quaternion={quatArr}>
        <mesh>
          <capsuleGeometry args={[avgR, bodyLength, 16, 32]} />
          {MANNEQUIN_BODY_MATERIAL}
        </mesh>
        <mesh scale={[OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE]}>
          <capsuleGeometry args={[avgR, bodyLength, 16, 32]} />
          {MANNEQUIN_OUTLINE_MATERIAL}
        </mesh>
      </group>
    );
  }

  // cylinder — render as capsule for rounded ends
  const bodyLength = Math.max(0, length - part.radiusStart * 2);
  // Elliptical torso: widen laterally, narrow front-to-back
  const isTorso = part.group === "mannequin_upper_torso" || part.group === "mannequin_lower_torso";
  const meshScale: [number, number, number] = isTorso ? [0.85, 1.0, 1.2] : [1, 1, 1];
  return (
    <group position={posArr} quaternion={quatArr}>
      <mesh scale={meshScale}>
        <capsuleGeometry args={[part.radiusStart, bodyLength, 16, 32]} />
        {MANNEQUIN_BODY_MATERIAL}
      </mesh>
      <mesh scale={meshScale.map(s => s * OUTLINE_SCALE) as [number, number, number]}>
        <capsuleGeometry args={[part.radiusStart, bodyLength, 16, 32]} />
        {MANNEQUIN_OUTLINE_MATERIAL}
      </mesh>
    </group>
  );
}

function MannequinSphereMesh({ part }: { part: MannequinPart3D }) {
  return (
    <group position={part.start}>
      <mesh>
        <sphereGeometry args={[part.radiusStart, 32, 32]} />
        {MANNEQUIN_JOINT_MATERIAL_ELEM}
      </mesh>
      <mesh scale={[OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE]}>
        <sphereGeometry args={[part.radiusStart, 32, 32]} />
        {MANNEQUIN_OUTLINE_MATERIAL}
      </mesh>
    </group>
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

const RIM_MATERIAL = (
  <meshStandardMaterial metalness={0.6} roughness={0.3} color="#1c1c20" />
);
const HUB_MATERIAL = (
  <meshStandardMaterial metalness={0.8} roughness={0.25} color="#8a8f99" />
);
const SPOKE_MATERIAL = (
  <meshStandardMaterial metalness={0.75} roughness={0.35} color="#767b85" />
);
const DISC_MATERIAL = (
  <meshStandardMaterial metalness={0.5} roughness={0.4} color="#17171a" />
);

const SPOKE_COUNT = 24;
const HUB_FLANGE_R = 35;
const HUB_HALF_WIDTH = 42;

function Wheel({
  center,
  wheelRadius,
  disc,
}: {
  center: [number, number, number];
  wheelRadius: number;
  disc: boolean;
}) {
  const tyreRadius = 14;
  const rimOuter = wheelRadius - tyreRadius; // tyre torus centre line
  const rimCentre = rimOuter - 22;           // deep-section rim body centre line
  const rimInner = rimCentre - 20;           // where spokes terminate

  // Static radial spoke layout, alternating hub flange side
  const spokes = useMemo(() => {
    if (disc) return [];
    const out: { pos: [number, number, number]; rotZ: number; len: number; tilt: number }[] = [];
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const ang = (i / SPOKE_COUNT) * Math.PI * 2;
      const zHub = i % 2 === 0 ? HUB_HALF_WIDTH * 0.55 : -HUB_HALF_WIDTH * 0.55;
      const rSpan = rimInner - HUB_FLANGE_R;
      const len = Math.hypot(rSpan, zHub);
      const midR = (HUB_FLANGE_R + rimInner) / 2;
      out.push({
        pos: [Math.cos(ang) * midR, Math.sin(ang) * midR, zHub / 2],
        // cylinder Y-axis → rotate so it runs radially (ang − 90°), plus a
        // slight tilt toward the hub flange handled via lookAt-free math
        rotZ: ang - Math.PI / 2,
        len,
        tilt: Math.atan2(zHub, rSpan),
      });
    }
    return out;
  }, [disc, rimInner]);

  return (
    <group position={center}>
      {/* Tyre */}
      <mesh>
        <torusGeometry args={[rimOuter, tyreRadius, 16, 80]} />
        {WHEEL_MATERIAL}
      </mesh>
      {/* Deep-section rim (flattened torus) */}
      <mesh scale={[1, 1, 0.45]}>
        <torusGeometry args={[rimCentre, 20, 12, 80]} />
        {RIM_MATERIAL}
      </mesh>
      {/* Hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[14, 14, HUB_HALF_WIDTH * 2, 16, 1]} />
        {HUB_MATERIAL}
      </mesh>
      {disc ? (
        // Aero disc: shallow lenticular drum between hub and rim
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[rimInner + 8, rimInner + 8, 18, 48, 1]} />
          {DISC_MATERIAL}
        </mesh>
      ) : (
        spokes.map((s, i) => (
          <group key={i} position={s.pos} rotation={[0, 0, s.rotZ]}>
            <mesh rotation={[s.tilt, 0, 0]}>
              <cylinderGeometry args={[1.4, 1.4, s.len, 6, 1]} />
              {SPOKE_MATERIAL}
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}

function Wheels({
  geo,
  wheelRadius,
  disc,
}: {
  geo: Geometry3DResponse;
  wheelRadius: number;
  disc: boolean;
}) {
  const { rear, front } = getWheelCenters(geo.points);
  return (
    <>
      {/* Aero setup: disc rear, spoked front (a front disc is unrideable outdoors) */}
      {rear && <Wheel center={rear} wheelRadius={wheelRadius} disc={disc} />}
      {front && <Wheel center={front} wheelRadius={wheelRadius} disc={false} />}
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
    [[m.hip.x, m.hip.y], [m.spineJoint.x, m.spineJoint.y]],
    [[m.spineJoint.x, m.spineJoint.y], [m.shoulder.x, m.shoulder.y]],
    [[m.shoulder.x, m.shoulder.y], [m.neckBase.x, m.neckBase.y]],
    [[m.neckBase.x, m.neckBase.y], [m.head.x, m.head.y]],
    [[m.shoulder.x, m.shoulder.y], [m.elbow.x, m.elbow.y]],
    [[m.elbow.x, m.elbow.y], [m.wrist.x, m.wrist.y]],
    [[m.wrist.x, m.wrist.y], [m.hands.x, m.hands.y]],
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

// ── Curved handlebar ─────────────────────────────────────────────────────────

/**
 * Straight bar edges (clamp→top→hoods→drop) replaced with a Catmull-Rom sweep
 * per side: tops run laterally, ramp forward into the hoods, then the drop
 * curls forward, down, and back toward the rider.
 */
const BAR_EDGE_KEYS = new Set([
  "bar_clamp→bar_top_l", "bar_clamp→bar_top_r",
  "bar_top_l→hoods_l", "bar_top_r→hoods_r",
  "hoods_l→bar_drop_l", "hoods_r→bar_drop_r",
]);

const BAR_TUBE_RADIUS = 11;

function HandlebarMesh({ ptMap }: { ptMap: Map<string, [number, number, number]> }) {
  const bc = ptMap.get("bar_clamp");
  const geoms = useMemo(() => {
    if (!bc) return null;
    const out: THREE.TubeGeometry[] = [];
    for (const side of ["l", "r"] as const) {
      const bt = ptMap.get(`bar_top_${side}`);
      const h = ptMap.get(`hoods_${side}`);
      const d = ptMap.get(`bar_drop_${side}`);
      if (!bt || !h || !d) return null;
      const s = side === "l" ? 1 : -1;
      const pts = [
        new THREE.Vector3(bc[0], bc[1], s * 24),
        new THREE.Vector3(bt[0], bt[1], bt[2] - s * 36),
        new THREE.Vector3(bt[0] + 6, bt[1], bt[2]),
        new THREE.Vector3(h[0] - 12, h[1] + 6, h[2]),
        new THREE.Vector3(h[0] + 30, h[1] - 42, h[2]),
        new THREE.Vector3(h[0] + 16, d[1] + 26, d[2]),
        new THREE.Vector3(d[0] - 28, d[1], d[2]),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.35);
      out.push(new THREE.TubeGeometry(curve, 64, BAR_TUBE_RADIUS, 12, false));
    }
    return out;
  }, [ptMap, bc]);

  useEffect(() => () => geoms?.forEach((g) => g.dispose()), [geoms]);

  if (!bc || !geoms) return null;
  return (
    <group>
      {/* Straight clamp section across the stem faceplate */}
      <mesh position={bc} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[BAR_TUBE_RADIUS + 1, BAR_TUBE_RADIUS + 1, 52, 12, 1]} />
        {FRAME_MATERIAL}
      </mesh>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g}>
          {FRAME_MATERIAL}
        </mesh>
      ))}
    </group>
  );
}

// ── Environment & camera rig ─────────────────────────────────────────────────

/**
 * Procedural PMREM environment from three's RoomEnvironment — image-based
 * lighting with zero network fetches (drei's <Environment> presets pull HDRIs
 * from a CDN, which the CSP blocks).
 */
function ProceduralEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

export interface CameraGoal {
  pos: [number, number, number];
  target: [number, number, number];
}

/** Frame-rate-independent exponential damp toward a target vector. */
function damp3(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  current.lerp(target, 1 - Math.exp(-lambda * dt));
}

function CameraRig({
  goalRef,
  controlsRef,
}: {
  goalRef: React.MutableRefObject<CameraGoal | null>;
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const goal = goalRef.current;
    if (!goal) return;
    goalPos.set(...goal.pos);
    goalTarget.set(...goal.target);
    damp3(state.camera.position, goalPos, 7, dt);
    const controls = controlsRef.current;
    if (controls) {
      damp3(controls.target, goalTarget, 7, dt);
      controls.update();
    }
    if (state.camera.position.distanceTo(goalPos) < 2) goalRef.current = null;
  });
  return null;
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
  weightKg = 75,
  strokeLUT,
  stanceWidth = 155,
  crankAngleRef,
  playing,
  cadenceRpm,
  postureBands,
  showAngles,
  showDimensions,
  showKops,
  discWheels,
  cameraGoalRef,
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
  weightKg?: number;
  strokeLUT?: PedalStrokeLUT;
  stanceWidth?: number;
  crankAngleRef: React.MutableRefObject<number>;
  playing: boolean;
  cadenceRpm: number;
  postureBands?: PosturePreset;
  showAngles: boolean;
  showDimensions: boolean;
  showKops: boolean;
  discWheels: boolean;
  cameraGoalRef: React.MutableRefObject<CameraGoal | null>;
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

  // Frame tubes (non-mannequin edges only). The straight handlebar edges are
  // replaced by the swept HandlebarMesh.
  const framePts = effectivePoints.filter((p) => p.group !== "mannequin");
  const frameEdges = effectiveEdges.filter(
    (e) => !e.group.startsWith("mannequin") && !BAR_EDGE_KEYS.has(`${e.a}→${e.b}`)
  );
  const frameTubes = buildTubes(framePts, frameEdges);
  const framePtMap = useMemo(
    () => new Map(framePts.map((p) => [p.name, p.pos])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, mannequin3DOverride]
  );

  // Mannequin parts (sphere joints + cylinders + capsules + tapered).
  // With a stroke LUT the legs are animated by <AnimatedLegs> instead, so they
  // are excluded from the declarative part list.
  const mannequinPts = effectivePoints.filter(
    (p) => p.group === "mannequin" && !(strokeLUT && LEG_POINT_NAMES.has(p.name))
  );
  const mannequinEdges = effectiveEdges.filter(
    (e) => e.group.startsWith("mannequin") && !(strokeLUT && LEG_EDGE_GROUPS.has(e.group))
  );
  const mannequinParts = showMannequin
    ? buildMannequinParts(mannequinPts, mannequinEdges, weightKg)
    : [];

  const effPtMap = new Map(effectivePoints.map((p) => [p.name, p.pos]));
  const hipL = effPtMap.get("hip_l");
  const hipR = effPtMap.get("hip_r");
  const bbPt = effPtMap.get("bb") ?? ([0, 0, 0] as [number, number, number]);

  const controlsRef = useRef<OrbitControlsImpl>(null);

  const wheelRadius = geo.frame.wheel_radius ?? 311;

  // Ground level for the contact shadow: bottom of the wheels
  const { rear: rearAxle } = getWheelCenters(effectivePoints);
  const groundY = (rearAxle?.[1] ?? 70) - wheelRadius;

  return (
    <>
      <color attach="background" args={["#0d1117"]} />

      {/* Lighting: PMREM room environment (IBL) + key/fill directionals */}
      <ProceduralEnvironment />
      <ambientLight intensity={0.25} />
      <directionalLight position={[1000, 1500, 800]} intensity={1.0} />
      <directionalLight position={[-500, 600, -600]} intensity={0.3} />

      {/* Soft ground contact shadow (static render — frames=1) */}
      <ContactShadows
        position={[target[0], groundY + 0.5, 0]}
        scale={3200}
        far={700}
        blur={2.2}
        opacity={0.42}
        frames={1}
        resolution={512}
      />

      {/* Frame tubes */}
      {frameTubes.map((tube, i) => (
        <TubeMesh key={`frame-${i}`} tube={tube} />
      ))}

      {/* Swept handlebar */}
      <HandlebarMesh ptMap={framePtMap} />

      {/* Mannequin body parts */}
      {mannequinParts.map((part, i) => (
        <MannequinPartMesh key={`mann-${i}`} part={part} />
      ))}

      {/* Animated legs + crankset */}
      {strokeLUT && hipL && hipR && (
        <AnimatedLegs
          lut={strokeLUT}
          hipL={hipL}
          hipR={hipR}
          bb={bbPt}
          halfStance={stanceWidth / 2}
          weightKg={weightKg}
          crankAngleRef={crankAngleRef}
          playing={playing}
          cadenceRpm={cadenceRpm}
          showLegs={showMannequin}
        />
      )}

      {/* Fit analytics: joint angle arcs */}
      {showAngles && mannequin2D && postureBands && (
        <>
          <JointArc
            vertex={mannequin2D.hip}
            rayA={mannequin2D.shoulder}
            rayC={mannequin2D.knee}
            z={(hipL?.[2] ?? 100) + 85}
            label="Hip"
            value={angleAtPoint(mannequin2D.shoulder, mannequin2D.hip, mannequin2D.knee)}
            band={postureBands.hip_angle}
          />
          <JointArc
            vertex={mannequin2D.shoulder}
            rayA={mannequin2D.hip}
            rayC={mannequin2D.elbow}
            z={(effPtMap.get("shoulder_l")?.[2] ?? 185) + 70}
            label="Shoulder"
            value={angleAtPoint(mannequin2D.hip, mannequin2D.shoulder, mannequin2D.elbow)}
            band={postureBands.shoulder_flexion}
            radius={75}
          />
          <JointArc
            vertex={mannequin2D.elbow}
            rayA={mannequin2D.shoulder}
            rayC={mannequin2D.hands}
            z={(effPtMap.get("elbow_l")?.[2] ?? 185) + 60}
            label="Elbow"
            value={180 - angleAtPoint(mannequin2D.shoulder, mannequin2D.elbow, mannequin2D.hands)}
            band={postureBands.elbow_flexion}
            radius={65}
          />
          {strokeLUT ? (
            <KneeArcAnimated
              lut={strokeLUT}
              crankAngleRef={crankAngleRef}
              hip={strokeLUT.hip}
              z={stanceWidth / 2 + 75}
              band={postureBands.knee_extension}
            />
          ) : (
            <JointArc
              vertex={mannequin2D.knee}
              rayA={mannequin2D.hip}
              rayC={mannequin2D.ankle}
              z={stanceWidth / 2 + 75}
              label="Knee"
              value={angleAtPoint(mannequin2D.hip, mannequin2D.knee, mannequin2D.ankle)}
              band={postureBands.knee_extension}
              radius={80}
            />
          )}
        </>
      )}

      {/* Fit analytics: KOPS plumb line */}
      {showKops && strokeLUT && (
        <KopsIndicator
          lut={strokeLUT}
          crankAngleRef={crankAngleRef}
          z={stanceWidth / 2 + 75}
        />
      )}

      {/* Fit analytics: dimension lines (drive side so they clear the arcs) */}
      {showDimensions && (() => {
        const saddle = effPtMap.get("saddle");
        const hl = effPtMap.get("hoods_l");
        const hr = effPtMap.get("hoods_r");
        if (!saddle || !hl || !hr) return null;
        const barW = geo.components.bar_width ?? 400;
        const hoods: [number, number, number] = [
          (hl[0] + hr[0]) / 2,
          (hl[1] + hr[1]) / 2,
          0,
        ];
        return <DimensionLines3D saddle={saddle} hoods={hoods} z={-(barW / 2 + 120)} />;
      })()}

      {/* Joints */}
      <JointSpheres geo={geo} />

      {/* Wheels */}
      <Wheels geo={geo} wheelRadius={wheelRadius} disc={discWheels} />

      {/* Saddle */}
      <SaddleMesh geo={geo} saddleType={saddleType} />

      {/* Attached custom assets */}
      {attachedAssets.map((asset, i) => (
        <AttachedAssetMesh key={i} asset={asset} geo={geo} />
      ))}

      {/* 2D skeleton overlay */}
      {show2dOverlay && mannequin2D && <Overlay2D mannequin2D={mannequin2D} />}

      {/* Orbit controls — target the scene centre so tumbling feels natural */}
      <OrbitControls ref={controlsRef} makeDefault target={target} />
      <CameraRig goalRef={cameraGoalRef} controlsRef={controlsRef} />

      {/* Export hook */}
      <SceneExporter onExportReady={onExportReady} />
    </>
  );
}

// ── In-canvas metrics HUD (plain DOM overlay — crisper than drei Html) ───────

function MetricsHud({
  mannequin2D,
  strokeLUT,
  bands,
  crankAngleRef,
  playing,
}: {
  mannequin2D?: MannequinSketch;
  strokeLUT?: PedalStrokeLUT;
  bands: PosturePreset;
  crankAngleRef: React.MutableRefObject<number>;
  playing: boolean;
}) {
  const [liveKneeExt, setLiveKneeExt] = useState<number | null>(null);

  useEffect(() => {
    if (!strokeLUT || !playing) {
      setLiveKneeExt(null);
      return;
    }
    const id = setInterval(() => {
      // Near-side (left) leg — matches the animated knee arc
      setLiveKneeExt(kneeExtensionAt(strokeLUT, crankAngleRef.current + 180));
    }, 150);
    return () => clearInterval(id);
  }, [strokeLUT, playing, crankAngleRef]);

  if (!mannequin2D) return null;
  const m = mannequin2D;
  const trunk = (Math.atan2(m.shoulder.y - m.hip.y, m.shoulder.x - m.hip.x) * 180) / Math.PI;

  const rows: { label: string; text: string; color: string }[] = [
    {
      label: "Trunk",
      text: `${trunk.toFixed(0)}°`,
      color: BAND_COLORS[bandStatus(trunk, bands.trunk_angle)],
    },
    {
      label: "Hip",
      text: `${angleAtPoint(m.shoulder, m.hip, m.knee).toFixed(0)}°`,
      color: BAND_COLORS[bandStatus(angleAtPoint(m.shoulder, m.hip, m.knee), bands.hip_angle)],
    },
    {
      label: "Shoulder",
      text: `${angleAtPoint(m.hip, m.shoulder, m.elbow).toFixed(0)}°`,
      color: BAND_COLORS[bandStatus(angleAtPoint(m.hip, m.shoulder, m.elbow), bands.shoulder_flexion)],
    },
    {
      label: "Elbow flex",
      text: `${(180 - angleAtPoint(m.shoulder, m.elbow, m.hands)).toFixed(0)}°`,
      color: BAND_COLORS[bandStatus(180 - angleAtPoint(m.shoulder, m.elbow, m.hands), bands.elbow_flexion)],
    },
  ];

  if (strokeLUT) {
    const kneeExtBdc = 180 - strokeLUT.kneeFlexionBdcDeg;
    rows.push(
      {
        label: "Knee ext BDC",
        text: `${kneeExtBdc.toFixed(0)}°`,
        color: BAND_COLORS[bandStatus(kneeExtBdc, bands.knee_extension)],
      },
      {
        label: "Knee flex TDC",
        text: `${strokeLUT.kneeFlexionTdcDeg.toFixed(0)}°`,
        color: BAND_COLORS[bandStatus(strokeLUT.kneeFlexionTdcDeg, bands.knee_flexion_tdc)],
      },
      {
        label: "KOPS",
        text: `${strokeLUT.kopsOffsetMm >= 0 ? "+" : ""}${strokeLUT.kopsOffsetMm.toFixed(0)} mm`,
        color: "rgba(255,255,255,0.45)",
      },
    );
  }
  if (liveKneeExt !== null) {
    rows.push({
      label: "Knee now",
      text: `${liveKneeExt.toFixed(0)}°`,
      color: BAND_COLORS[bandStatus(liveKneeExt, bands.knee_extension)],
    });
  }

  return (
    <div className="bike3d-hud">
      <div className="bike3d-hud__title">{bands.name} posture</div>
      {rows.map((r) => (
        <div className="bike3d-hud__row" key={r.label}>
          <i className="bike3d-hud__dot" style={{ background: r.color }} />
          <span className="bike3d-hud__label">{r.label}</span>
          <span className="bike3d-hud__value">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface BikeScene3DProps {
  geo: Geometry3DResponse;
  mannequin2D?: MannequinSketch;
  mannequin3DOverride?: { points: Geometry3DPoint[]; edges: Geometry3DEdge[] };
  weightKg?: number;
  strokeLUT?: PedalStrokeLUT;
  stanceWidth?: number;
  postureBands?: PosturePreset;
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

export const BikeScene3D: React.FC<BikeScene3DProps> = ({
  geo, mannequin2D, mannequin3DOverride, weightKg = 75,
  strokeLUT, stanceWidth, postureBands,
}) => {
  const [devMode, setDevMode] = useState(false);
  const [showMannequin, setShowMannequin] = useState(true);
  const [show2dOverlay, setShow2dOverlay] = useState(false);
  const [saddleType, setSaddleType] = useState<SaddleType>("power");
  // Pedaling animation: crank angle lives in a ref (mutated per frame inside
  // the canvas); scrub state mirrors it at low frequency for the slider thumb.
  const crankAngleRef = useRef(180); // BDC — matches the static pose
  const [playing, setPlaying] = useState(false);
  const [cadenceRpm, setCadenceRpm] = useState(60);
  const [scrubDeg, setScrubDeg] = useState(180);
  // Analytics layers
  const [showAngles, setShowAngles] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showKops, setShowKops] = useState(false);
  const [showHud, setShowHud] = useState(true);
  // Visuals
  const [discWheels, setDiscWheels] = useState(false);
  const cameraGoalRef = useRef<CameraGoal | null>(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setScrubDeg(Math.round(crankAngleRef.current) % 360);
    }, 200);
    return () => clearInterval(id);
  }, [playing]);
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

  const goToView = (view: "side" | "front" | "threeQuarter" | "top") => {
    const [cx, cy] = center;
    const d = camDist;
    const positions: Record<typeof view, [number, number, number]> = {
      side: [cx, cy + 0.06 * d, d],
      front: [cx + d, cy + 0.06 * d, 0], // aero assessment view
      threeQuarter: [cx + 0.55 * d, cy + 0.32 * d, 0.75 * d],
      top: [cx - 0.08 * d, cy + d, 0.02 * d],
    };
    cameraGoalRef.current = { pos: positions[view], target: center };
  };

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
        <span className="bike3d-layer-sep" style={{ marginLeft: "auto" }} />
        <button className="tab-pill" onClick={() => goToView("side")} title="Side view (fit)">
          Side
        </button>
        <button className="tab-pill" onClick={() => goToView("front")} title="Front view (aero)">
          Front
        </button>
        <button className="tab-pill" onClick={() => goToView("threeQuarter")} title="Three-quarter view">
          ¾
        </button>
        <button className="tab-pill" onClick={() => goToView("top")} title="Top view">
          Top
        </button>
        <button
          className={`tab-pill ${devMode ? "tab-pill--active" : ""}`}
          onClick={() => setDevMode((v) => !v)}
        >
          Dev
        </button>
      </div>

      {/* Pedaling animation controls */}
      {strokeLUT && (
        <div className="bike3d-toolbar bike3d-toolbar--anim">
          <button
            className={`tab-pill ${playing ? "tab-pill--active" : ""}`}
            onClick={() => setPlaying((v) => !v)}
            title={playing ? "Pause pedaling" : "Play pedaling"}
          >
            {playing ? "⏸ Pause" : "▶ Pedal"}
          </button>
          <label className="bike3d-anim-control">
            <span>Crank {scrubDeg}°</span>
            <input
              type="range"
              min={0}
              max={359}
              value={scrubDeg}
              onChange={(e) => {
                const v = Number(e.target.value);
                crankAngleRef.current = v;
                setScrubDeg(v);
                setPlaying(false);
              }}
            />
          </label>
          <label className="bike3d-anim-control">
            <span>{cadenceRpm} rpm</span>
            <input
              type="range"
              min={30}
              max={120}
              step={5}
              value={cadenceRpm}
              onChange={(e) => setCadenceRpm(Number(e.target.value))}
            />
          </label>
          <button
            className="tab-pill"
            title="Set the near-side crank to 3 o'clock (the KOPS reference position)"
            onClick={() => {
              crankAngleRef.current = 270; // near/left leg = 270 + 180 = 90°
              setScrubDeg(270);
              setPlaying(false);
            }}
          >
            3 o'clock
          </button>
          <span className="bike3d-layer-sep" />
          <button
            className={`tab-pill ${showAngles ? "tab-pill--active" : ""}`}
            onClick={() => setShowAngles((v) => !v)}
          >
            Angles
          </button>
          <button
            className={`tab-pill ${showDimensions ? "tab-pill--active" : ""}`}
            onClick={() => setShowDimensions((v) => !v)}
          >
            Dimensions
          </button>
          <button
            className={`tab-pill ${showKops ? "tab-pill--active" : ""}`}
            onClick={() => setShowKops((v) => !v)}
          >
            KOPS
          </button>
          <button
            className={`tab-pill ${showHud ? "tab-pill--active" : ""}`}
            onClick={() => setShowHud((v) => !v)}
          >
            HUD
          </button>
          <button
            className={`tab-pill ${discWheels ? "tab-pill--active" : ""}`}
            onClick={() => setDiscWheels((v) => !v)}
            title="Rear aero disc wheel"
          >
            Disc
          </button>
        </div>
      )}

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
            weightKg={weightKg}
            strokeLUT={strokeLUT}
            stanceWidth={stanceWidth}
            crankAngleRef={crankAngleRef}
            playing={playing}
            cadenceRpm={cadenceRpm}
            postureBands={postureBands}
            showAngles={showAngles}
            showDimensions={showDimensions}
            showKops={showKops}
            discWheels={discWheels}
            cameraGoalRef={cameraGoalRef}
          />
        </Canvas>
        {showHud && postureBands && (
          <MetricsHud
            mannequin2D={mannequin2D}
            strokeLUT={strokeLUT}
            bands={postureBands}
            crankAngleRef={crankAngleRef}
            playing={playing}
          />
        )}
      </div>
    </div>
  );
};
