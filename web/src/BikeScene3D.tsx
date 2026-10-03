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
import { Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { EffectComposer, SSAO, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  Geometry3DResponse,
  Geometry3DPoint,
  buildTubes,
  buildBikeMeshes,
  buildHoods,
  getWheelCenters,
  Tube3D,
  LEG_POINT_NAMES,
  LEG_EDGE_GROUPS,
} from "./bike3d";
import { AnimatedLegs } from "./AnimatedLegs";
import { DebugProvider, debugMaterial, useDbg, useDebugOn } from "./debug";
import { buildRiderMeshes, tPosePoints, type P3 } from "./riderMesh";
import { GeometryCache } from "./scene3d/geometryCache";
import { useContextRestore } from "./scene3d/contextLoss";
import { MatsProvider, useMats, useNeedsNormals } from "./scene3d/materials";
import { buildBar, buildHoodMeshes } from "./cockpit3d";
import { buildTracedRailGeometry, buildTracedSaddleGeometry } from "./saddle3d";
import { SADDLE_CONTACT_U, SWORKS_POWER, contactHeight, contactX, lerpTable, type SaddleTrace } from "./saddleModels";
import { TOKENS, material3d, type Theme } from "./design/tokens";
import { useTheme } from "./design/useTheme";
import {
  ArcHairline,
  DimensionLines3D,
  GroundRuler,
  KneeArcLive,
  KopsIndicator,
  rulerLayout,
} from "./FitAnalytics3D";
import { Callouts3D, ScreenProjector, type ProjectTarget, type ProjectedMap } from "./Callouts3D";
import { Overlay3D } from "./scene3d/Overlay3D";
import { METRICS, computeAll, type MetricId, type Vec3, useMetricFocus } from "./fitMetrics";
import {
  ASSUMED_CD,
  FrontalAreaProbe,
  GhostMannequin,
  type GhostSnapshot,
  type MeasureFrontalArea,
} from "./AeroTools";
import { legPoseAt, type PedalStrokeLUT, type PosturePreset } from "./geometry";
import type { MannequinSketch } from "./types";

// Materials come from scene3d/materials.tsx (theme tokens); only the cockpit tube set stays here.
const COCKPIT_TUBE_NAMES = new Set([
  "steerer",
  "stem",
  "bar",
  "bar_ramp",
  "bar_drop",
  "seatpost",
]);

// ── Saddle geometry ────────────────────────────────────────────────────────────
//
// Fizik Arione R1: 300 × 130 mm, flat profile, extremely narrow pointed nose,
//                  gentle 4 mm convex crown, diagonal wing-flex cut slots, no cutout.
// Specialized S-Works Power: 240 × 143 mm, lofted from side and top photos (saddleModels.ts,
//                  saddle3d.ts): traced plan, side profile, through-hole and carbon rails.

export type SaddleType = "arione" | "power";

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

interface ParamSaddleSpec {
  kind: "param";
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

/** Saddle traced from product photos; shape, rails and contact height all come from the trace. */
interface TracedSaddleSpec {
  kind: "traced";
  label: string;
  trace: SaddleTrace;
  contactU: number;
}

type SaddleSpec = ParamSaddleSpec | TracedSaddleSpec;

// Measurements derived from manufacturer specs and reference images.
const SADDLE_DETAIL: Record<SaddleType, SaddleSpec> = {
  /**
   * Fizik Arione R1 — 302 × 130 mm
   * Ultra-long flat race saddle: needle-point nose, narrow flat body, gentle
   * convex crown. Distinctive diagonal wing-flex cut notches at nose junction.
   */
  arione: {
    kind: "param",
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

  power: { kind: "traced", label: "Power", trace: SWORKS_POWER, contactU: SADDLE_CONTACT_U },
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
function buildSaddleGeometry(spec: ParamSaddleSpec): THREE.BufferGeometry {
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
  arione: buildSaddleGeometry(SADDLE_DETAIL.arione as ParamSaddleSpec),
  power:  buildTracedSaddleGeometry(SWORKS_POWER),
};
const TRACED_RAIL_GEO: Partial<Record<SaddleType, THREE.BufferGeometry[]>> = {
  power: buildTracedRailGeometry(SWORKS_POWER),
};

/** Cylinder between two THREE.Vector3 points, used for rails and clamp. */
function RailTube({
  a, b, r = 3.5,
}: {
  a: THREE.Vector3; b: THREE.Vector3; r?: number;
}) {
  const M = useMats();
  const dbg = useDbg();
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
      {dbg("saddle_rail", <primitive object={M.m.rail} attach="material" />)}
    </mesh>
  );
}

export function SaddleMesh({
  geo,
  saddleType,
}: {
  geo: Geometry3DResponse;
  saddleType: SaddleType;
}) {
  const M = useMats();
  const dbg = useDbg();
  const ptMap = new Map(geo.points.map((p) => [p.name, p.pos]));
  const sp = ptMap.get("saddle");
  if (!sp) return null;

  const [sx, sy, sz] = sp;
  const spec = SADDLE_DETAIL[saddleType];
  const body = (
    <mesh geometry={SADDLE_GEO[saddleType]}>
      {dbg("saddle", <primitive object={M.m.saddle} attach="material" />)}
    </mesh>
  );

  if (spec.kind === "traced") {
    // Contact = side-profile top at contactU, placed on the world saddle point; y = 0 is the rail centreline
    const cx = contactX(spec.trace, spec.contactU);
    const rs = lerpTable(spec.trace.railHalfSpread, cx);
    return (
      <group position={[sx - cx, sy - contactHeight(spec.trace, spec.contactU), sz]}>
        {body}
        {TRACED_RAIL_GEO[saddleType]?.map((g, i) => (
          <mesh key={i} geometry={g}>
            {dbg("saddle_rail", <primitive object={M.m.saddleRail} attach="material" />)}
          </mesh>
        ))}
        {/* Clamp crossbar under the contact station */}
        <RailTube a={new THREE.Vector3(cx, 0, -rs - 7)} b={new THREE.Vector3(cx, 0, rs + 7)} r={5} />
      </group>
    );
  }

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
      {body}

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

/** Frame tubes (non-mannequin edges; the straight handlebar edges are replaced by the swept bar) and their points. */
export function frameTubesFor(geo: Geometry3DResponse) {
  const framePts = geo.points.filter((p) => p.group !== "mannequin");
  const frameEdges = geo.edges.filter((e) => !e.group.startsWith("mannequin") && !BAR_EDGE_KEYS.has(`${e.a}→${e.b}`));
  return {
    frameTubes: buildTubes(framePts, frameEdges),
    framePtMap: new Map(framePts.map((p) => [p.name, p.pos] as [string, [number, number, number]])),
  };
}

/** The static bike (tapered frame, curved fork, deep carbon rims, rotors, cassette, derailleur, chain, hoods). */
export function BikeStatic({
  geo, tubes, wheelRadius, discRear,
}: { geo: Geometry3DResponse; tubes: Tube3D[]; wheelRadius: number; discRear: boolean }) {
  const M = useMats();
  const debug = useDebugOn();
  // Shape-keyed geometry cache: the sliders mostly move parts, so rebuilding only what changed shape keeps ticks cheap.
  const needsNormals = useNeedsNormals();
  const cache = useMemo(() => new GeometryCache(needsNormals), [needsNormals]);
  useEffect(() => () => cache.disposeAll(), [cache]);
  const { bike, hoods, legacyHoods } = useMemo(() => {
    cache.begin();
    const mats = { frame: M.m.frame, carbon: M.m.carbon, tyre: M.m.tyre, spoke: M.m.spoke, alloy: M.m.alloy, rotor: M.m.rotor, bottle: M.m.bottle, tape: M.m.tape };
    const ck = geo.cockpit;
    const ckMats = { carbon: M.m.carbon, hood: M.m.hood, lever: M.m.lever, pad: M.m.tape, alloy: M.m.alloy };
    const pivot = geo.points.find((p) => p.name === "stem_pivot")?.pos ?? null;
    let cockpitGroup: THREE.Group;
    if (ck) {
      cockpitGroup = new THREE.Group();
      cockpitGroup.add(buildBar(ck, pivot, ckMats, debug, cache));
      cockpitGroup.add(buildHoodMeshes(ck, ckMats, debug, cache));
    } else {
      cockpitGroup = buildHoods(geo.points, mats, debug); // older JSON without a cockpit model (uncached: disposed below)
    }
    const bike = buildBikeMeshes(geo.points, tubes, wheelRadius, mats, { discRear, debug, integratedStem: ck?.build === "integrated", cache });
    return { bike, hoods: cockpitGroup, legacyHoods: ck ? null : cockpitGroup };
  }, [geo, tubes, wheelRadius, discRear, M, debug, cache]);
  // Sweep after commit: the previous group is still in the scene during render and must not lose its geometry.
  useEffect(() => cache.end(), [bike, hoods, cache]);
  useEffect(() => () => legacyHoods?.traverse((o) => (o as THREE.Mesh).geometry?.dispose()), [legacyHoods]);
  return (
    <>
      <primitive object={bike} />
      <primitive object={hoods} />
    </>
  );
}

/** The static clay rider (legs only when no stroke LUT is available; otherwise AnimatedLegs owns them). */
export function RiderStatic({ geo, weightKg, includeLegs, tPose }: { geo: Geometry3DResponse; weightKg: number; includeLegs: boolean; tPose?: { groundY: number; centerX: number } }) {
  const M = useMats();
  const debug = useDebugOn();
  const needsNormals = useNeedsNormals();
  const cache = useMemo(() => new GeometryCache(needsNormals), [needsNormals]);
  useEffect(() => () => cache.disposeAll(), [cache]);
  const group = useMemo(() => {
    const pts = new Map(geo.points.filter((p) => p.group === "mannequin").map((p) => [p.name, p.pos as P3]));
    const heightMm = geo.rider?.height ?? 1800;
    cache.begin();
    const built = tPose
      ? buildRiderMeshes(tPosePoints(pts, tPose.groundY, tPose.centerX, heightMm), M.m.clay, { weightKg, heightMm, includeLegs: true, feet: true }, cache)
      : buildRiderMeshes(pts, M.m.clay, { weightKg, heightMm, includeLegs, handRollDeg: geo.cockpit?.hoodRollDeg ?? 0 }, cache);
    if (debug) {
      // debug colours by body part (the legend's torso / arm / leg / shoe slots; the head is part of "torso")
      const PART = { torso: "torso", head: "torso", arm: "arm", leg: "leg", shoe: "shoe" } as const;
      built.traverse((o) => {
        const part = o.userData.part as keyof typeof PART | undefined;
        if (part && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = debugMaterial(PART[part]);
      });
    }
    return built;
  }, [geo, weightKg, includeLegs, M, tPose, cache, debug]);
  useEffect(() => cache.end(), [group, cache]);
  return <primitive object={group} />;
}

// ── Curved handlebar ─────────────────────────────────────────────────────────

/**
 * Straight bar edges (clamp→top→hoods→drop) replaced with a Catmull-Rom sweep
 * per side: tops run laterally, ramp forward into the hoods, then the drop
 * curls forward, down, and back toward the rider.
 */
const BAR_EDGE_KEYS = new Set([
  "bar_clamp→bar_top_r", "bar_clamp→bar_top_l",
  "bar_top_r→hoods_r", "bar_top_l→hoods_l",
  "hoods_r→bar_drop_r", "hoods_l→bar_drop_l",
]);

const BAR_TUBE_RADIUS = 11;

function HandlebarMesh({ ptMap }: { ptMap: Map<string, [number, number, number]> }) {
  const M = useMats();
  const dbg = useDbg();
  const bc = ptMap.get("bar_clamp");
  const geoms = useMemo(() => {
    if (!bc) return null;
    const out: THREE.TubeGeometry[] = [];
    for (const side of ["l", "r"] as const) {
      const bt = ptMap.get(`bar_top_${side}`);
      const h = ptMap.get(`hoods_${side}`);
      const d = ptMap.get(`bar_drop_${side}`);
      if (!bt || !h || !d) return null;
      const s = side === "r" ? 1 : -1; // +Z is the rider's right
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
        {dbg("bar", M.carbon)}
      </mesh>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g}>
          {dbg("bar", M.carbon)}
        </mesh>
      ))}
    </group>
  );
}

// ── Drivetrain + hoods hints ─────────────────────────────────────────────────

function orientedMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: React.ReactNode,
  key?: string | number
) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 1) return null;
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  return (
    <mesh key={key} position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
      <cylinderGeometry args={[radius, radius, len, 12, 1]} />
      {material}
    </mesh>
  );
}

/** Crank arms to each pedal, pedal bodies, and a chainring at the BB.
    Takes the merged point list so cranks follow the override mannequin's
    opposed leg pose. */
export function Drivetrain3D({ points }: { points: Geometry3DPoint[] }) {
  const M = useMats();
  const ptMap = new Map(points.map((p) => [p.name, p.pos]));
  const bb = ptMap.get("bb");
  const cleatR = ptMap.get("cleat_r");
  const cleatL = ptMap.get("cleat_l");
  if (!bb) return null;

  const arms = [cleatR, cleatL].filter(Boolean) as [number, number, number][];

  return (
    <group>
      {/* Chainring on the drive side (rider's right = +Z) */}
      <mesh position={[bb[0], bb[1], 48]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[100, 100, 4, 40, 1]} />
        {M.carbon}
      </mesh>
      <mesh position={[bb[0], bb[1], 44]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[78, 78, 3, 40, 1]} />
        {M.carbon}
      </mesh>
      {/* Crank arms + pedal bodies */}
      {arms.map((cleat, i) => {
        const spindle = new THREE.Vector3(cleat[0], cleat[1] - 12, cleat[2]);
        return (
          <group key={i}>
            {orientedMesh(new THREE.Vector3(bb[0], bb[1], cleat[2] * 0.85), spindle, 9, M.carbon, `arm-${i}`)}
            <mesh position={spindle.toArray()}>
              <boxGeometry args={[96, 16, 58]} />
              {M.carbon}
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Rubber hood bodies extending forward from the hood contact points */
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
      // The stage (lights, floor) is not part of the model.
      const stage = scene.getObjectByName("stage-root");
      const wasVisible = stage?.visible ?? true;
      if (stage) stage.visible = false;
      const restore = () => {
        if (stage) stage.visible = wasVisible;
      };
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
          restore();
        },
        (err: ErrorEvent) => {
          restore();
          console.error("GLTFExporter error:", err);
        },
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

// ── Main scene content (inside Canvas) ───────────────────────────────────────

// Memoized so host re-renders that don't change scene inputs (the 200 ms
// crank-scrub mirror, toolbar-only state) skip re-walking the scene graph.
const SceneContent = React.memo(function SceneContent({
  geo,
  attachedAssets,
  onExportReady,
  target,
  showMannequin,
  tPose,
  debugParts,
  saddleType,
  show2dOverlay,
  mannequin2D,
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
  onMeasureReady,
  ghost,
  theme,
  quality,
  span,
  camDist,
  focused,
  pinned,
  hovered,
  onFocusMetric,
  onHoverMetric,
  onProject,
  projectTargets,
}: {
  focused: MetricId;
  pinned: MetricId[];
  hovered: MetricId | null;
  onFocusMetric: (id: MetricId) => void;
  onHoverMetric: (id: MetricId | null) => void;
  onProject: (px: ProjectedMap<string>) => void;
  projectTargets: ProjectTarget[];
  theme: Theme;
  quality: Quality;
  span: number;
  camDist: number;
  geo: Geometry3DResponse;
  attachedAssets: AttachedAsset[];
  onExportReady: (fn: () => void) => void;
  target: [number, number, number];
  showMannequin: boolean;
  tPose: boolean;
  debugParts: boolean;
  saddleType: SaddleType;
  show2dOverlay: boolean;
  mannequin2D?: MannequinSketch;
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
  onMeasureReady: (fn: MeasureFrontalArea) => void;
  ghost: GhostSnapshot | null;
}) {
  // Frame tubes (non-mannequin edges only). The straight handlebar edges are
  // replaced by the swept HandlebarMesh.
  const { frameTubes, framePtMap } = useMemo(() => frameTubesFor(geo), [geo]);

  const effPtMap = useMemo(
    () => new Map(geo.points.map((p) => [p.name, p.pos])),
    [geo]
  );
  const hipR = effPtMap.get("hip_r");
  const hipL = effPtMap.get("hip_l");
  const bbPt = effPtMap.get("bb") ?? ([0, 0, 0] as [number, number, number]);

  const wheelRadius = geo.frame.wheel_radius ?? 311;

  // Ground sits at the bottom of the wheels
  const { rear, front } = getWheelCenters(geo.points);
  const axleY = Math.min(rear?.[1] ?? 0, front?.[1] ?? 0);
  const groundY = axleY - wheelRadius;
  const groundX = ((rear?.[0] ?? 0) + (front?.[0] ?? 0)) / 2;

  const tokens = TOKENS[theme];
  const mat3d = material3d[theme];
  const light = theme === "light";
  // The light stage reads a touch darker than the page token once lit (as in mock-up 02): match the clear colour to it.
  const stageBg = useMemo(() => new THREE.Color(tokens.bg).multiplyScalar(light ? 0.86 : 1), [tokens.bg, light]);
  // Every bike and rider mesh casts and receives shadows (the stage floor only receives).
  const { scene, gl, invalidate } = useThree();
  const restoreKey = useContextRestore();
  // Frames render on demand (Canvas frameloop="demand"): ask for one when anything the scene shows has changed.
  // Prop changes that reach the scene graph invalidate by themselves; this covers the ones that do not (overlay toggles,
  // focus / hover highlights, theme and quality).
  useEffect(() => {
    invalidate();
  }, [invalidate, geo, theme, quality, showAngles, showDimensions, showKops, focused, pinned, hovered]);
  // DEV: shader programs / geometries on the GPU. Both should stay flat while a slider drags (`window.__glInfo()`).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const info = () => ({ programs: gl.info.programs?.length ?? 0, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
    (window as unknown as { __glInfo?: () => unknown; __scene?: THREE.Scene }).__glInfo = info;
    (window as unknown as { __scene?: THREE.Scene; __gl?: THREE.WebGLRenderer }).__scene = scene;
    (window as unknown as { __gl?: THREE.WebGLRenderer }).__gl = gl;
    const id = window.setInterval(() => console.debug("[gl]", JSON.stringify(info())), 1000);
    return () => window.clearInterval(id);
  }, [gl, scene]);
  useEffect(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(o.parent && o.parent.name === "stage-root")) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [scene, geo, tPose, showMannequin, discWheels, debugParts, strokeLUT, weightKg, stanceWidth, attachedAssets]);

  return (
    <DebugProvider key={restoreKey} value={debugParts}>
    <MatsProvider theme={theme}>
      {/* Stage: theme background + fog, soft key/rim lights with shadows, matte floor.
          Everything here lives under stage-root so the frontal-area probe and GLB export skip it. */}
      <color attach="background" args={[stageBg]} />
      <fog attach="fog" args={[stageBg, camDist * 1.6, camDist * 3.5]} />
      <group name="stage-root">
        <hemisphereLight args={[light ? "#FFFAF2" : "#D9E2EC", light ? "#B3A898" : "#0B0B0C", light ? 0.9 : 0.55]} />
        <directionalLight
          position={[target[0] + 600, target[1] + 3200, target[2] - 700]}
          intensity={3.0}
          color="#FFF1DE"
          castShadow={quality !== "mobile"}
          shadow-mapSize={quality === "high" ? [4096, 4096] : [2048, 2048]}
          shadow-bias={-0.0004}
          shadow-radius={quality === "high" ? 10 : 4}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
          shadow-camera-near={100}
          shadow-camera-far={9000}
        />
        <directionalLight position={[target[0] - 1600, target[1] + 900, target[2] + 1600]} intensity={light ? 1.0 : 2.2} color="#DFE8F2" />
        {quality !== "mobile" && (
          <Environment resolution={128} frames={1}>
            <Lightformer intensity={0.8} position={[0, 4000, 0]} rotation-x={Math.PI / 2} scale={[6000, 6000, 1]} />
            <Lightformer intensity={0.4} position={[4000, 1500, 2500]} rotation-y={-Math.PI / 3} scale={[3000, 2000, 1]} />
            <Lightformer intensity={0.25} color="#f7dcc0" position={[-3500, 800, -2000]} rotation-y={Math.PI / 3} scale={[2500, 1500, 1]} />
          </Environment>
        )}
        <mesh rotation-x={-Math.PI / 2} position={[groundX, groundY - 1, 0]} receiveShadow>
          <planeGeometry args={[40000, 40000]} />
          <meshStandardMaterial color={mat3d.floor} roughness={1} metalness={0} />
        </mesh>
      </group>

      {/* Bike: tapered frame, fork, wheels, drivetrain parts, hoods (see bike3d.ts) */}
      {!tPose && <BikeStatic geo={geo} tubes={frameTubes} wheelRadius={wheelRadius} discRear={discWheels} />}

      {/* Swept handlebar */}
      {!tPose && !geo.cockpit && <HandlebarMesh ptMap={framePtMap} />}

      {/* Clay rider (segmented lathe limbs; see riderMesh.ts). T-pose stands on the floor under the pelvis. */}
      {tPose ? (
        <RiderStatic geo={geo} weightKg={weightKg} includeLegs tPose={{ groundY, centerX: (effPtMap.get("hip_center")?.[0] ?? 0) }} />
      ) : (
        showMannequin && <RiderStatic geo={geo} weightKg={weightKg} includeLegs={!strokeLUT} />
      )}

      {/* Animated legs + crankset (replaces the static drivetrain while the
          stroke LUT is available) */}
      {tPose ? null : strokeLUT && hipR && hipL ? (
        <AnimatedLegs
          lut={strokeLUT}
          hipR={hipR}
          hipL={hipL}
          bb={bbPt}
          halfStance={stanceWidth / 2}
          weightKg={weightKg}
          heightMm={geo.rider?.height ?? 1800}
          crankAngleRef={crankAngleRef}
          playing={playing}
          cadenceRpm={cadenceRpm}
          showLegs={showMannequin}
        />
      ) : (
        <Drivetrain3D points={geo.points} />
      )}

      {/* Saddle */}
      {!tPose && <SaddleMesh geo={geo} saddleType={saddleType} />}

      {/* Attached custom assets */}
      {!tPose && attachedAssets.map((asset, i) => (
        <AttachedAssetMesh key={i} asset={asset} geo={geo} />
      ))}

      {/* Fit analytics (excluded from the frontal-area probe) */}
      <group name="analytics-root" visible={!tPose}>
        {mannequin2D && (
          <>
            {METRICS.map((d) => {
              const arc = d.arc?.({ m: mannequin2D, lut: strokeLUT, pts: effPtMap });
              if (!arc) return null;
              const isFocus = d.id === focused;
              const isPin = pinned.includes(d.id);
              if (!isFocus && !isPin && !showAngles) return null;
              const zFor: Record<string, number> = {
                hip: (hipR?.[2] ?? 100) + 85,
                trunk: (hipR?.[2] ?? 100) + 85,
                shoulder: (effPtMap.get("shoulder_r")?.[2] ?? 185) + 70,
                elbow_flex: (effPtMap.get("elbow_r")?.[2] ?? 185) + 60,
                knee_ext_bdc: stanceWidth / 2 + 75,
                knee_flex_tdc: -(stanceWidth / 2 + 75),
              };
              return (
                <ArcHairline
                  key={d.id}
                  vertex={arc.v}
                  rayA={arc.a}
                  rayC={arc.c}
                  z={zFor[d.id] ?? 0}
                  kind={isFocus ? "hot" : isPin ? "pin" : "dim"}
                  theme={theme}
                  radius={d.id === "trunk" ? 100 : d.id === "elbow_flex" ? 65 : d.id === "shoulder" ? 75 : 85}
                />
              );
            })}
            {showAngles && strokeLUT && playing && (
              <KneeArcLive lut={strokeLUT} crankAngleRef={crankAngleRef} hip={strokeLUT.hip} z={stanceWidth / 2 + 75} theme={theme} />
            )}
            {/* invisible 45 mm hit spheres: click a joint to focus its metric */}
            {METRICS.map((d) => {
              const p = d.anchor({ m: mannequin2D, lut: strokeLUT, pts: effPtMap });
              if (!p) return null;
              return (
                <mesh
                  key={`hit-${d.id}`}
                  position={p}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusMetric(d.id);
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    onHoverMetric(d.id);
                    document.body.style.cursor = "pointer";
                  }}
                  onPointerOut={() => {
                    onHoverMetric(null);
                    document.body.style.cursor = "";
                  }}
                >
                  <sphereGeometry args={[45, 12, 12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              );
            })}
          </>
        )}
        {showKops && strokeLUT && (
          <KopsIndicator lut={strokeLUT} crankAngleRef={crankAngleRef} z={stanceWidth / 2 + 75} theme={theme} />
        )}
        {showDimensions && !tPose && (() => {
          const saddle = effPtMap.get("saddle");
          const hl = effPtMap.get("hoods_r");
          const hr = effPtMap.get("hoods_l");
          if (!saddle || !hl || !hr) return null;
          const barW = geo.components.bar_width ?? 400;
          const hoods: [number, number, number] = [(hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2, 0];
          return (
            <>
              <DimensionLines3D saddle={saddle} hoods={hoods} z={-(barW / 2 + 120)} theme={theme} />
              {rear && front && <GroundRuler rearX={rear[0]} frontX={front[0]} groundY={groundY} stanceWidth={stanceWidth} theme={theme} />}
            </>
          );
        })()}
        {show2dOverlay && mannequin2D && <Overlay2D mannequin2D={mannequin2D} />}
      </group>

      {/* Ghost position comparison */}
      {ghost && !tPose && (
        <GhostMannequin
          snapshot={ghost}
          weightKg={weightKg}
          current={effPtMap as Map<string, [number, number, number]>}
          theme={theme}
        />
      )}

      {/* Frontal-area probe (registers its measure fn with the host) */}
      <FrontalAreaProbe onReady={onMeasureReady} />

      <ScreenProjector targets={projectTargets} onProject={onProject} />

      {/* Orbit controls — damped, clamped above the ground plane */}
      <OrbitControls
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={500}
        maxDistance={15000}
      />

      {/* Export hook */}
      <SceneExporter onExportReady={onExportReady} />
    </MatsProvider>
    </DebugProvider>
  );
});

// ── Camera view presets ───────────────────────────────────────────────────────

type CameraPresetKind = "side" | "front" | "threeq" | "cockpit" | "rider";

/** Frame-rate-independent exponential damp toward a target vector. */
function damp3(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  current.lerp(target, 1 - Math.exp(-lambda * dt));
}

function CameraPresetRig({
  request,
  center,
  camDist,
  points,
}: {
  request: { kind: CameraPresetKind; nonce: number } | null;
  center: [number, number, number];
  camDist: number;
  points: Map<string, [number, number, number]>;
}) {
  const { camera, controls, invalidate } = useThree();
  const goalRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!request) return;
    if (request.kind === "cockpit" || request.kind === "rider") {
      const l = points.get("hoods_l"), r = points.get("hoods_r"), clamp = points.get("bar_clamp"), head = points.get("head_center");
      if (!l || !r || !clamp) return;
      const mid = new THREE.Vector3((l[0] + r[0]) / 2, (l[1] + r[1]) / 2 - 30, 0);
      if (request.kind === "rider" && head) {
        // Rider's eye: from just in front of the head, looking down at the stem cap and bars.
        goalRef.current = { pos: new THREE.Vector3(head[0] + 60, head[1] + 10, 0), target: new THREE.Vector3(clamp[0] + 40, clamp[1] - 20, 0) };
      } else {
        // Cockpit: three-quarter front view, close in on the bars and hoods.
        goalRef.current = { pos: mid.clone().add(new THREE.Vector3(470, 210, 400)), target: mid };
      }
      invalidate();
      return;
    }
    const [cx, cy, cz] = center;
    const pos: [number, number, number] =
      request.kind === "side"
        ? [cx, cy + camDist * 0.06, cz + camDist]
        : request.kind === "front"
        ? [cx + camDist, cy + camDist * 0.06, cz]
        : [cx + camDist * 0.5, cy + camDist * 0.3, cz + camDist * 0.8];
    goalRef.current = {
      pos: new THREE.Vector3(...pos),
      target: new THREE.Vector3(cx, cy, cz),
    };
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  useFrame((state, dt) => {
    const goal = goalRef.current;
    if (!goal) return;
    damp3(camera.position, goal.pos, 7, dt);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      damp3(orbit.target, goal.target, 7, dt);
      orbit.update?.();
    }
    // Stop once the camera is within 0.5 mm of the goal, so the loop goes idle; otherwise ask for the next frame.
    if (camera.position.distanceTo(goal.pos) < 0.5) goalRef.current = null;
    else state.invalidate();
  });
  return null;
}

/** "mobile" (narrow viewport): no shadows, environment map or SSAO, and a capped pixel ratio. */
type Quality = "high" | "low" | "mobile";
const QUALITY_KEY = "flowfit.3d.quality";

function readQuality(): Quality {
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 768px)").matches) return "mobile";
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === "high" || v === "low") return v;
  } catch {
    /* storage blocked */
  }
  return (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high";
}

// ── Public component ──────────────────────────────────────────────────────────

/** Fit to compare against (the D-ui `CompareTarget` shape): ghost + deltas. */
export interface Compare3D {
  label: string;
  metrics: Partial<Record<MetricId, number>>;
  points: Geometry3DPoint[];
}

interface BikeScene3DProps {
  /** Comparison fit; takes precedence over the in-session snapshot ghost. */
  compare?: Compare3D | null;
  /** dev-only component colouring (src/debug.tsx) */
  debugParts?: boolean;
  geo: Geometry3DResponse;
  mannequin2D?: MannequinSketch;
  weightKg?: number;
  strokeLUT?: PedalStrokeLUT;
  stanceWidth?: number;
  postureBands?: PosturePreset;
  /** cockpit focus: start on the cockpit camera and offer the rider's-eye view */
  focus?: "cockpit";
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
  geo, mannequin2D, weightKg = 75,
  strokeLUT, stanceWidth, postureBands, compare, debugParts = false, focus: sceneFocus,
}) => {
  const [theme] = useTheme();
  const [quality, setQualityState] = useState<Quality>(readQuality);
  const setQuality = (q: Quality) => {
    setQualityState(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* ignore */
    }
  };
  const { focused, pinned, focus, togglePin, reset } = useMetricFocus();
  const [hovered, setHovered] = useState<MetricId | null>(null);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [px, setPx] = useState<ProjectedMap<string>>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const [devMode, setDevMode] = useState(false);
  const [showMannequin, setShowMannequin] = useState(true);
  const [tPose, setTPose] = useState(false);
  const [show2dOverlay, setShow2dOverlay] = useState(false);
  const [saddleType, setSaddleType] = useState<SaddleType>("power");
  const [cameraRequest, setCameraRequest] = useState<{ kind: CameraPresetKind; nonce: number } | null>(null);
  // Cockpit focus opens on the cockpit camera.
  useEffect(() => {
    if (sceneFocus === "cockpit") setCameraRequest((r) => ({ kind: "cockpit", nonce: (r?.nonce ?? 0) + 1 }));
  }, [sceneFocus]);
  // Pedaling animation: crank angle lives in a ref (mutated per frame inside
  // the canvas); scrub state mirrors it at low frequency for the slider thumb.
  // 0° puts the near-side (right, +Z) leg at BDC — the pose the 2D fit view shows.
  const crankAngleRef = useRef(0);
  /** set by the Canvas: lets DOM controls outside it (crank scrub) request a frame under frameloop="demand" */
  const invalidateRef = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(false);
  const [cadenceRpm, setCadenceRpm] = useState(60);
  const [scrubDeg, setScrubDeg] = useState(0);
  // Analytics layers
  const [showAngles, setShowAngles] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showKops, setShowKops] = useState(false);
  const [discWheels, setDiscWheels] = useState(false);
  // Aero tools
  const measureFnRef = useRef<MeasureFrontalArea | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [includeBikeInArea, setIncludeBikeInArea] = useState(false);
  const [frontalAreaM2, setFrontalAreaM2] = useState<number | null>(null);
  const [ghost, setGhost] = useState<GhostSnapshot | null>(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setScrubDeg(Math.round(crankAngleRef.current) % 360);
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const handleMeasureReady = useCallback((fn: MeasureFrontalArea) => {
    measureFnRef.current = fn;
  }, []);

  const runMeasure = async () => {
    const fn = measureFnRef.current;
    if (!fn || measuring) return;
    setMeasuring(true);
    try {
      setFrontalAreaM2(await fn(includeBikeInArea));
    } finally {
      setMeasuring(false);
    }
  };

  // Current position metrics for ghost deltas
  const geoPtMap = new Map(geo.points.map((p) => [p.name, p.pos]));
  const metricCtx = mannequin2D ? { m: mannequin2D, lut: strokeLUT, pts: geoPtMap as Map<string, Vec3> } : null;
  const values = useMemo(
    () => (metricCtx ? computeAll(metricCtx) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, mannequin2D, strokeLUT],
  );
  const compareGhost = useMemo<GhostSnapshot | null>(
    () =>
      compare
        ? {
            points: compare.points,
            edges: geo.edges.filter((e) => e.group.startsWith("mannequin")),
            trunkAngleDeg: compare.metrics.trunk ?? 0,
            dropMm: compare.metrics.drop ?? 0,
            frontalAreaM2: null,
          }
        : null,
    [compare, geo],
  );
  const was = useMemo<Partial<Record<MetricId, number>> | undefined>(
    () => compare?.metrics ?? (ghost ? { trunk: ghost.trunkAngleDeg, drop: ghost.dropMm } : undefined),
    [compare, ghost],
  );
  const shownIds = useMemo(() => Array.from(new Set<MetricId>([focused, ...pinned])), [focused, pinned]);
  const hoverOnly = hovered && !shownIds.includes(hovered) ? hovered : null;
  const projectTargets = useMemo<ProjectTarget[]>(() => {
    const out: ProjectTarget[] = [];
    if (metricCtx) {
      for (const id of [...shownIds, ...(hoverOnly ? [hoverOnly] : [])]) {
        const p = METRICS.find((d) => d.id === id)?.anchor(metricCtx);
        if (p) out.push({ key: id, pos: p });
      }
    }
    if (showDimensions) {
      const r = geoPtMap.get("rear_axle");
      const f = geoPtMap.get("front_axle");
      if (r && f) {
        const wheelR = geo.frame.wheel_radius ?? 311;
        const groundY = Math.min(r[1], f[1]) - wheelR;
        rulerLayout(r[0], f[0], groundY, stanceWidth ?? 155).labels.forEach((l, i) => out.push({ key: `ruler:${i}`, pos: l.pos }));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, mannequin2D, strokeLUT, shownIds, hoverOnly, showDimensions, stanceWidth]);
  const rulerLabels = ["R.AXLE", "BB 0", `F.AXLE · WB ${Math.round((geoPtMap.get("front_axle")?.[0] ?? 0) - (geoPtMap.get("rear_axle")?.[0] ?? 0))}`];
  const saddlePt = geoPtMap.get("saddle");
  const hoodsRPt = geoPtMap.get("hoods_r");
  const hoodsLPt = geoPtMap.get("hoods_l");
  const currentDropMm =
    saddlePt && hoodsRPt && hoodsLPt
      ? saddlePt[1] - (hoodsRPt[1] + hoodsLPt[1]) / 2
      : 0;
  const currentTrunkDeg = mannequin2D
    ? (Math.atan2(
        mannequin2D.shoulder.y - mannequin2D.hip.y,
        mannequin2D.shoulder.x - mannequin2D.hip.x
      ) * 180) / Math.PI
    : 0;

  const takeSnapshot = () => {
    const pts = geo.points
      .filter((p) => p.group === "mannequin")
      .map((p) => ({
        ...p,
        pos: [...p.pos] as [number, number, number],
      }));
    // Freeze the legs at the current crank angle so the ghost keeps its pose
    if (strokeLUT) {
      const theta = crankAngleRef.current;
      const right = legPoseAt(strokeLUT, theta);
      const left = legPoseAt(strokeLUT, theta + 180);
      const hs = (stanceWidth ?? 155) / 2;
      const setback = strokeLUT.ankleSetbackMm;
      const set = (name: string, x: number, y: number, z: number) => {
        const p = pts.find((q) => q.name === name);
        if (p) p.pos = [x, y, z];
      };
      set("knee_r", left.knee.x, left.knee.y, hs);
      set("ankle_r", left.ankle.x - setback, left.ankle.y, hs);
      set("cleat_r", left.cleat.x, left.cleat.y, hs);
      set("knee_l", right.knee.x, right.knee.y, -hs);
      set("ankle_l", right.ankle.x - setback, right.ankle.y, -hs);
      set("cleat_l", right.cleat.x, right.cleat.y, -hs);
    }
    setGhost({
      points: pts,
      edges: geo.edges.filter((e) => e.group.startsWith("mannequin")),
      trunkAngleDeg: currentTrunkDeg,
      dropMm: currentDropMm,
      frontalAreaM2,
    });
  };
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

  // Derive camera position from the scene bounding box so the whole bike fits.
  // Memoized so `center` stays referentially stable for the memoized scene.
  const { center, camDist, camPos, span } = useMemo(() => {
    const { center, span } = sceneBounds(geo);
    // fov=30° half-angle 15°, tan(15°) ≈ 0.268 → distance = span/2 / 0.268 * 1.55 (padding, leaves room for the Metric Rail)
    const camDist = (span / 2 / 0.268) * 1.55;
    const camPos: [number, number, number] = [
      center[0] + camDist * 0.15,   // slight rightward offset
      center[1] + camDist * 0.25,   // slightly above centre
      camDist,
    ];
    return { center, camDist, camPos, span };
  }, [geo]);
  const tCenter = useMemo<[number, number, number]>(() => {
    const r = geoPtMap.get("rear_axle");
    const f = geoPtMap.get("front_axle");
    const g0 = Math.min(r?.[1] ?? 0, f?.[1] ?? 0) - (geo.frame.wheel_radius ?? 311);
    return [geoPtMap.get("hip_center")?.[0] ?? center[0], g0 + (geo.rider?.height ?? 1800) * 0.5, 0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, center]);
  const viewCenter = tPose ? tCenter : center;

  return (
    <div className="bike3d-container">
      {/* Toolbar */}
      <div className="bike3d-toolbar">
        <div className="seg-control seg-control--dark" role="tablist" aria-label="Camera preset">
          {([
            ["side", "Side"],
            ["threeq", "¾"],
            ["front", "Front"],
            ...(sceneFocus === "cockpit" ? [["cockpit", "Cockpit"], ["rider", "Rider's eye"]] : []),
          ] as [CameraPresetKind, string][]).map(([kind, label]) => (
            <button
              key={kind}
              className="seg-control__btn"
              title={`${label} view (click again to reset)`}
              onClick={() => setCameraRequest((r) => ({ kind, nonce: (r?.nonce ?? 0) + 1 }))}
            >
              {label}
            </button>
          ))}
        </div>
        {devMode ? (
          <>
            <button className="tab-pill" onClick={() => exportFnRef.current?.()}>
              Export .glb
            </button>
            <button className="tab-pill" onClick={() => exportJson(geo)}>
              Export JSON
            </button>
            <button className="tab-pill" onClick={() => exportCsv(geo)}>
              Export CSV
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
        ) : null}
        <button
          className={`tab-pill ${showMannequin ? "tab-pill--active" : ""}`}
          onClick={() => setShowMannequin((v) => !v)}
        >
          Rider
        </button>
        <button
          className={`tab-pill ${tPose ? "tab-pill--active" : ""}`}
          onClick={() => {
            setTPose((v) => !v);
            setCameraRequest((r) => ({ kind: "front", nonce: (r?.nonce ?? 0) + 1 }));
          }}
        >
          T-pose
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
        {strokeLUT && (
          <>
          <button
            className={`tab-pill ${playing ? "tab-pill--active" : ""}`}
            onClick={() => setPlaying((v) => !v)}
            title={playing ? "Pause pedaling" : "Play pedaling"}
          >
            {playing ? "⏸ Pause" : "▶ Pedal"}
          </button>
          </>
        )}
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
        {strokeLUT && (
          <button
            className={`tab-pill ${showKops ? "tab-pill--active" : ""}`}
            onClick={() => setShowKops((v) => !v)}
          >
            KOPS
          </button>
        )}
          <button
            className={`tab-pill ${discWheels ? "tab-pill--active" : ""}`}
            onClick={() => setDiscWheels((v) => !v)}
            title="Rear aero disc wheel"
          >
            Disc
          </button>
        <button
          className={`tab-pill ${toolsOpen ? "tab-pill--active" : ""}`}
          onClick={() => setToolsOpen((v) => !v)}
          title="Crank, cadence and aero tools"
        >
          Tools
        </button>
        {quality !== "mobile" && (
          <button
            className={`tab-pill ${quality === "high" ? "tab-pill--active" : ""}`}
            style={{ marginLeft: "auto" }}
            title="High quality: ambient occlusion and larger shadow maps"
            onClick={() => setQuality(quality === "high" ? "low" : "high")}
          >
            HQ
          </button>
        )}
        {import.meta.env.DEV && (
        <button
          className={`tab-pill ${devMode ? "tab-pill--active" : ""}`}
          onClick={() => setDevMode((v) => !v)}
        >
          Dev
        </button>
        )}
      </div>

      {/* Pedaling animation + analytics layers */}
      {toolsOpen && strokeLUT && (
        <div className="bike3d-toolbar bike3d-toolbar--anim">
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
                invalidateRef.current();
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
              invalidateRef.current();
              setScrubDeg(270);
              setPlaying(false);
            }}
          >
            3 o'clock
          </button>
          <span className="bike3d-layer-sep" />
        </div>
      )}

      {/* Aero tools */}
      {toolsOpen && (
      <div className="bike3d-toolbar bike3d-toolbar--anim">
        <button
          className="tab-pill"
          onClick={runMeasure}
          disabled={measuring}
          title="Silhouette frontal-area measurement from the front (aero) view"
        >
          {measuring ? "Measuring…" : "Frontal area"}
        </button>
        <button
          className={`tab-pill ${includeBikeInArea ? "tab-pill--active" : ""}`}
          onClick={() => setIncludeBikeInArea((v) => !v)}
          title="Include the bike in the silhouette (rider-only by default)"
        >
          + Bike
        </button>
        {frontalAreaM2 !== null && (
          <span className="bike3d-aero-chip">
            FA {frontalAreaM2.toFixed(3)} m² · CdA ≈ {(frontalAreaM2 * ASSUMED_CD).toFixed(3)} m²
            <em> (Cd {ASSUMED_CD}, hoods)</em>
          </span>
        )}
        <span className="bike3d-layer-sep" />
        <button
          className="tab-pill"
          onClick={takeSnapshot}
          title="Freeze the current position as a translucent ghost for comparison"
        >
          Snapshot ghost
        </button>
        {ghost && (
          <>
            <button className="tab-pill" onClick={() => setGhost(null)}>
              Clear ghost
            </button>
            <span className="bike3d-aero-chip">
              Δtrunk {(currentTrunkDeg - ghost.trunkAngleDeg) >= 0 ? "+" : ""}
              {(currentTrunkDeg - ghost.trunkAngleDeg).toFixed(1)}°
              {" · "}Δdrop {(currentDropMm - ghost.dropMm) >= 0 ? "+" : ""}
              {(currentDropMm - ghost.dropMm).toFixed(0)} mm
              {ghost.frontalAreaM2 !== null && frontalAreaM2 !== null && (
                <>
                  {" · "}ΔFA {(frontalAreaM2 - ghost.frontalAreaM2) >= 0 ? "+" : ""}
                  {(frontalAreaM2 - ghost.frontalAreaM2).toFixed(3)} m²
                </>
              )}
            </span>
          </>
        )}
      </div>
      )}

      {/* Canvas wrapper — explicit height so R3F gets a non-zero pixel size.
          The canvas is transparent; the wrapper carries a gradient backdrop. */}
      <div className="bike3d-canvas-wrapper" ref={wrapRef} tabIndex={0} style={{ ["--bike3d-bg" as string]: TOKENS[theme].bg }}>
        <Canvas
          shadows={quality !== "mobile"}
          dpr={[1, 2]}
          frameloop="demand"
          onCreated={({ invalidate }) => { invalidateRef.current = invalidate; }}
          camera={{ position: camPos, fov: 30, near: 1, far: 50000 }}
          gl={{
            alpha: false,
            antialias: true,
            toneMapping: THREE.AgXToneMapping,
            toneMappingExposure: theme === "light" ? 0.92 : 1.15,
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <SceneContent
            geo={geo}
            attachedAssets={attachedAssets}
            onExportReady={handleExportReady}
            target={viewCenter}
            showMannequin={showMannequin}
            tPose={tPose}
            debugParts={debugParts}
            saddleType={saddleType}
            show2dOverlay={show2dOverlay}
            mannequin2D={mannequin2D}
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
            onMeasureReady={handleMeasureReady}
            ghost={compareGhost ?? ghost}
            theme={theme}
            quality={quality}
            span={span}
            camDist={camDist}
            focused={focused}
            pinned={pinned}
            hovered={hovered}
            onFocusMetric={focus}
            onHoverMetric={setHovered}
            onProject={setPx}
            projectTargets={projectTargets}
          />
          {quality === "high" && (
            <EffectComposer multisampling={0}>
              <SSAO radius={0.12} intensity={25} worldDistanceThreshold={2000} worldDistanceFalloff={500} worldProximityThreshold={120} worldProximityFalloff={60} />
              <SMAA />
            </EffectComposer>
          )}
          <CameraPresetRig request={cameraRequest} center={viewCenter} camDist={tPose ? camDist * 1.35 : camDist} points={geoPtMap} />
        </Canvas>
        {/* Callouts (focused + pinned; hover previews at 60%) and the ground-ruler labels */}
        {box.w > 0 && !tPose && (
          <div className="b3-callouts">
            <Callouts3D px={px as ProjectedMap<MetricId>} focused={focused} show={shownIds} width={box.w} height={box.h} values={values} />
            {hoverOnly && (
              <div style={{ opacity: 0.6 }}>
                <Callouts3D px={px as ProjectedMap<MetricId>} focused={focused} show={[hoverOnly]} width={box.w} height={box.h} values={values} />
              </div>
            )}
            {showDimensions &&
              rulerLabels.map((l, i) =>
                px[`ruler:${i}`] ? (
                  <span key={l} className="b3-ruler-label" style={{ left: px[`ruler:${i}`]!.x, top: px[`ruler:${i}`]!.y }}>
                    {l}
                  </span>
                ) : null,
              )}
          </div>
        )}
        {!tPose && <Overlay3D
          geo={geo}
          bands={postureBands}
          values={values}
          was={was}
          fitLabel={compare ? `VS ${compare.label.toUpperCase()}` : undefined}
          focused={focused}
          pinned={pinned}
          onFocus={focus}
          onTogglePin={togglePin}
          onReset={reset}
          specsOpen={specsOpen}
          onToggleSpecs={() => setSpecsOpen((v) => !v)}
        />}
      </div>
    </div>
  );
};
