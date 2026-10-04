/**
 * shoe3d.ts — 3D road shoe lofted from a traced ShoeTrace (shoeModels.ts).
 *
 * Built once at length 1 (scale the mesh by the shoe length). Local frame: x = u (heel 0 → toe 1),
 * y up (0 = ground line), z lateral (+z = lateral, i.e. a right shoe; mirror z for the left).
 *
 * - upper: each row is the top half of a superellipse from the seam up to the traced top, with the
 *   traced medial / lateral half-widths. Over the collar the columns between the two opening edges
 *   span exactly the traced opening, so the lining's edge is a mesh line; there the surface drops
 *   into a dish, returned as its own geometry (the black lining).
 * - sole: the bottom half of a boxier superellipse from the seam down to the traced bottom, closed on top.
 * - BOA: a base disc and a dial per station, along the upper's surface normal on the lateral wall.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { lerpTable } from "./saddleModels";
import type { ShoeTrace } from "./shoeModels";

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const U = 140;          // rows heel → toe (cosine-bunched towards both ends)
const SIDE = 12;        // upper columns per side wall, seam → opening edge
const K = 12;           // upper columns across the top (the collar opening on collar rows)
const SOLE_V = 24;      // sole columns, lateral seam → under → medial seam
const SOLE_PROUD = 1.03;
const HEEL_CAP = 0.05;  // u over which the heel / toe close to a rounded point
const TOE_CAP = 0.03;
const SPAN = 0.5;       // top span (fraction of the half-width) on rows outside the opening
const SPAN_EASE = 0.05; // u over which the top span eases out ahead of the opening
const MAX_SPAN = 0.92;
/** The top shot's dark collar area includes the lining rolled over the padded rim: the opening proper is narrower. */
const OPENING_INSET = 0.85;
/** The opening starts this far forward of the heel tip, so the lining never reaches the heel's closing rows. */
const OPENING_START = 0.025;
/** Minimum collar wall either side of the opening (fraction of L, ≈ 9 mm). */
const COLLAR_WALL = 0.03;

export interface ShoeSection {
  /** row station (heel 0 → toe 1) */
  u: number;
  seam: number;
  top: number;
  bottom: number;
  medial: number;
  lateral: number;
  /** superellipse exponent of the upper (boxy over the collar, rounder over the toe box) */
  n: number;
}

/** Cross-section at u: traced values with the heel and toe rounded off to a point. */
export function shoeSection(s: ShoeTrace, u: number): ShoeSection {
  const k = Math.min(
    Math.sqrt(Math.max(0, 1 - Math.max(0, (HEEL_CAP - u) / HEEL_CAP) ** 2)),
    Math.sqrt(Math.max(0, 1 - Math.max(0, (u - (1 - TOE_CAP)) / TOE_CAP) ** 2)),
  );
  const top0 = lerpTable(s.top, u), seam0 = lerpTable(s.seam, u), bot0 = lerpTable(s.bottom, u);
  const mid = (top0 + bot0) / 2, sq = Math.sqrt(k);
  return {
    u,
    top: mid + (top0 - mid) * sq,
    seam: mid + (seam0 - mid) * sq,
    bottom: mid + (bot0 - mid) * sq,
    medial: Math.max(1e-4, lerpTable(s.medial, u) * k),
    lateral: Math.max(1e-4, lerpTable(s.lateral, u) * k),
    n: 4 - 1.4 * smoothstep(0.3, 0.6, u),
  };
}

/** Point on the upper at superellipse angle p ∈ [0, π] (0 = lateral seam, π/2 = top, π = medial seam). */
export function upperPoint(c: ShoeSection, p: number): [number, number] {
  const cp = Math.cos(p), sp = Math.max(0, Math.sin(p)), e = 2 / c.n;
  const z = cp >= 0 ? c.lateral * Math.pow(cp, e) : -c.medial * Math.pow(-cp, e);
  return [z, c.seam + (c.top - c.seam) * Math.pow(sp, e)];
}

/** Angle on the lateral (+) or medial (−) side whose z is `frac` of that side's half-width. */
const angleAt = (c: ShoeSection, frac: number, side: 1 | -1) => {
  const a = Math.acos(Math.pow(Math.min(1, frac), c.n / 2));
  return side === 1 ? a : Math.PI - a;
};

/** Collar opening half-widths at u ([medial, lateral], fractions of L), or null outside it. */
export function openingAt(s: ShoeTrace, u: number): [number, number] | null {
  const o = s.opening;
  if (u < Math.max(o[0][0], OPENING_START) || u > o[o.length - 1][0]) return null;
  let i = 0;
  while (i < o.length - 2 && o[i + 1][0] < u) i++;
  const [u0, m0, l0] = o[i], [u1, m1, l1] = o[i + 1];
  const t = u1 > u0 ? (u - u0) / (u1 - u0) : 0;
  // keep a heel-counter wall either side, so the opening rounds off towards the heel
  const c = shoeSection(s, u);
  return [
    Math.max(0, Math.min((m0 + (m1 - m0) * t) * OPENING_INSET, c.medial - COLLAR_WALL)),
    Math.max(0, Math.min((l0 + (l1 - l0) * t) * OPENING_INSET, c.lateral - COLLAR_WALL)),
  ];
}

function rowStations(s: ShoeTrace): number[] {
  const front = s.opening[s.opening.length - 1][0];
  const us = Array.from({ length: U + 1 }, (_, i) => (1 - Math.cos((Math.PI * i) / U)) / 2)
    .filter((u) => Math.abs(u - front) > 0.003);
  us.push(front);
  return us.sort((a, b) => a - b);
}

export interface ShoeGeometries {
  upper: THREE.BufferGeometry;
  /** the dish filling the collar opening */
  lining: THREE.BufferGeometry;
  sole: THREE.BufferGeometry;
  boaBase: THREE.BufferGeometry;
  boaDial: THREE.BufferGeometry;
}

export function buildShoeGeometries(s: ShoeTrace): ShoeGeometries {
  return { ...buildUpper(s), sole: buildSole(s), ...buildBoa(s) };
}

function buildUpper(s: ShoeTrace): { upper: THREE.BufferGeometry; lining: THREE.BufferGeometry } {
  const us = rowStations(s);
  const front = s.opening[s.opening.length - 1][0];
  const V = 2 * SIDE + K, V1 = V + 1;
  const pos = new Float32Array(us.length * V1 * 3);
  const inOpening = us.map((u) => openingAt(s, u) !== null);

  us.forEach((u, ui) => {
    const c = shoeSection(s, u);
    const op = openingAt(s, u);
    // top span edges as fractions of each half-width: the opening on collar rows, easing out to SPAN ahead of it
    let fm = SPAN, fl = SPAN;
    if (op) {
      fm = op[0] / c.medial; fl = op[1] / c.lateral;
    } else if (u > front) {
      const last = s.opening[s.opening.length - 1];
      const e = smoothstep(0, SPAN_EASE, u - front);
      const m0 = (last[1] * OPENING_INSET) / lerpTable(s.medial, front), l0 = (last[2] * OPENING_INSET) / lerpTable(s.lateral, front);
      fm = m0 + (SPAN - m0) * e;
      fl = l0 + (SPAN - l0) * e;
    }
    fm = Math.min(MAX_SPAN, fm); fl = Math.min(MAX_SPAN, fl);
    const pl = angleAt(c, fl, 1), pm = angleAt(c, fm, -1);
    const [zl, yl] = upperPoint(c, pl), [zm, ym] = upperPoint(c, pm);
    // lining dish: below the line joining the two rim edges, deepest mid-opening
    const depth = op ? s.liningDepth * smoothstep(OPENING_START, 0.08, u) : 0;

    for (let vi = 0; vi <= V; vi++) {
      let z: number, y: number;
      if (vi <= SIDE) {
        [z, y] = upperPoint(c, (vi / SIDE) * pl);
      } else if (vi >= SIDE + K) {
        [z, y] = upperPoint(c, pm + ((vi - SIDE - K) / SIDE) * (Math.PI - pm));
      } else {
        const t = (vi - SIDE) / K;
        if (op) {
          z = zl + (zm - zl) * t;
          const r = 2 * t - 1;
          y = yl + (ym - yl) * t - depth * (1 - r * r);
        } else {
          [z, y] = upperPoint(c, pl + t * (pm - pl));
        }
      }
      const i = (ui * V1 + vi) * 3;
      pos[i] = u; pos[i + 1] = y; pos[i + 2] = z;
    }
  });

  const upper: number[] = [], lining: number[] = [];
  const P = (ui: number, vi: number) => ui * V1 + vi;
  for (let ui = 0; ui < us.length - 1; ui++) {
    for (let vi = 0; vi < V; vi++) {
      const a = P(ui, vi), b = a + 1, c = P(ui + 1, vi), d = c + 1;
      const lin = inOpening[ui] && inOpening[ui + 1] && vi >= SIDE && vi < SIDE + K;
      (lin ? lining : upper).push(a, c, b, b, c, d); // outward normals (+z at vi = 0, up at the top)
    }
  }
  const mk = (idx: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos.slice(), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  return { upper: mk(upper), lining: mk(lining) };
}

function buildSole(s: ShoeTrace): THREE.BufferGeometry {
  const us = rowStations(s);
  const V1 = SOLE_V + 1, n = 6;
  const pos = new Float32Array(us.length * V1 * 3);
  us.forEach((u, ui) => {
    const c = shoeSection(s, u);
    for (let vi = 0; vi <= SOLE_V; vi++) {
      // lateral seam (+z) → underneath → medial seam
      const a = (vi / SOLE_V) * Math.PI;
      const cp = Math.cos(a), sp = Math.max(0, Math.sin(a)), e = 2 / n;
      // a touch proud of the upper so the black edge reads from the side
      const z = SOLE_PROUD * (cp >= 0 ? c.lateral * Math.pow(cp, e) : -c.medial * Math.pow(-cp, e));
      const i = (ui * V1 + vi) * 3;
      pos[i] = u; pos[i + 1] = c.seam - (c.seam - c.bottom) * Math.pow(sp, e); pos[i + 2] = z;
    }
  });
  const idx: number[] = [];
  const P = (ui: number, vi: number) => ui * V1 + vi;
  for (let ui = 0; ui < us.length - 1; ui++) {
    for (let vi = 0; vi < SOLE_V; vi++) {
      const a = P(ui, vi), b = a + 1, c = P(ui + 1, vi), d = c + 1;
      idx.push(a, b, c, b, d, c); // outward (+z at vi = 0, down underneath)
    }
    // top: lateral seam → medial seam (hidden under the upper; closes the solid)
    idx.push(P(ui, 0), P(ui + 1, 0), P(ui, SOLE_V), P(ui, SOLE_V), P(ui + 1, 0), P(ui + 1, SOLE_V));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Surface point and outward normal on the lateral wall at station u, `up` of the way from seam to top. */
export function lateralWallFrame(s: ShoeTrace, u: number, up: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const at = (uu: number, pp: number) => {
    const c = shoeSection(s, uu);
    const [z, y] = upperPoint(c, pp);
    return new THREE.Vector3(uu, y, z);
  };
  const c = shoeSection(s, u);
  const p0 = Math.asin(Math.pow(up, c.n / 2));
  const p = at(u, p0);
  const du = at(u + 0.005, p0).sub(at(u - 0.005, p0));
  const dp = at(u, p0 + 0.01).sub(at(u, p0 - 0.01));
  const n = new THREE.Vector3().crossVectors(du, dp).normalize();
  if (n.z < 0) n.negate();
  return { p, n };
}

function buildBoa(s: ShoeTrace): { boaBase: THREE.BufferGeometry; boaDial: THREE.BufferGeometry } {
  const bases: THREE.BufferGeometry[] = [], dials: THREE.BufferGeometry[] = [];
  const Y = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const b of s.boa) {
    const { p, n } = lateralWallFrame(s, b.u, b.up);
    q.setFromUnitVectors(Y, n);
    const baseH = 0.012;
    // base disc sunk a little into the upper so it sits flush on the curved wall
    const base = new THREE.CylinderGeometry(b.baseR, b.baseR * 1.05, baseH + 0.01, 28);
    m.compose(p.clone().addScaledVector(n, baseH / 2 - 0.005), q, new THREE.Vector3(1, 1, 1));
    bases.push(base.applyMatrix4(m));
    const dial = new THREE.CylinderGeometry(b.dialR * 0.94, b.dialR, b.dialH, 32);
    m.compose(p.clone().addScaledVector(n, baseH + b.dialH / 2 - 0.002), q, new THREE.Vector3(1, 1, 1));
    dials.push(dial.applyMatrix4(m));
  }
  const boaBase = mergeGeometries(bases), boaDial = mergeGeometries(dials);
  bases.forEach((g) => g.dispose()); dials.forEach((g) => g.dispose());
  return { boaBase, boaDial };
}
