/**
 * saddle3d.ts — 3D saddle lofted from a traced SaddleTrace (saddleModels.ts).
 *
 * Each row is a cross-section at x: plan half-width from the top photo, top/underside heights from
 * the side photo, a hand-set lateral crown, and the traced through-hole. Rows bunch towards the nose
 * and tail (cosine spacing) where the plan outline turns. The K columns either side of the centre
 * span exactly the hole's half-width on hole rows, so the hole edge is a mesh line, not a staircase.
 *
 * Local frame matches saddleModels.ts: x forward (0 = mid-length), y up (0 = rail centreline), z lateral.
 */
import * as THREE from "three";

import { holeHalfWidthAt, lerpTable, type SaddleTrace } from "./saddleModels";

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const U = 180;          // cross-sections, nose → tail
const HALF = 32;        // columns per side (V = 2·HALF)
const K = 8;            // columns per side reserved for the hole span
const SHELL = 6;        // shell thickness at the rim (mm)
const ROLL = 5;         // how far the top rolls down into the flank at the rim (mm)
const NOSE_CAP = 5;     // mm over which the nose tip closes
const CURVE_HW = 20;    // half-width (mm) below which crown and roll shrink, so the narrow nose tip stays solid
const OUT_OF_HOLE_S = 0.25; // |s| of column K on rows without a hole (uniform spacing)
const SPAN_EASE = 12;       // mm over which column K eases from a hole end to uniform spacing

export function buildTracedSaddleGeometry(s: SaddleTrace): THREE.BufferGeometry {
  const V = 2 * HALF, V1 = V + 1, nPts = (U + 1) * V1;
  const pos = new Float32Array(nPts * 6); // top surface, then underside
  const holeRow = new Uint8Array(U + 1);
  const { lip, depth, frontX } = s.channel;
  const holeFrontX = s.holeHalfWidth[s.holeHalfWidth.length - 1][0];
  const holeFrontHW = s.holeHalfWidth[s.holeHalfWidth.length - 1][1];
  const [holeRearX, holeRearHW] = s.holeHalfWidth[0];

  for (let ui = 0; ui <= U; ui++) {
    const x = (s.length / 2) * Math.cos((Math.PI * ui) / U);
    // Nose cap: over the last NOSE_CAP mm the width rounds off to nothing and the top and underside
    // close onto their midline, so the tip is a rounded point rather than a flat end wall.
    const cap = Math.sqrt(Math.max(0, 1 - Math.max(0, (x - (s.length / 2 - NOSE_CAP)) / NOSE_CAP) ** 2));
    const hw = Math.max(0.2, lerpTable(s.halfWidth, x) * cap);
    const hh = holeHalfWidthAt(s, x);
    holeRow[ui] = hh > 0 ? 1 : 0;
    const top0 = lerpTable(s.top, x), bot0 = lerpTable(s.bottom, x), mid = (top0 + bot0) / 2;
    const yTop = mid + (top0 - mid) * Math.sqrt(cap);
    const yBot = mid + (bot0 - mid) * Math.sqrt(cap);
    const narrow = Math.min(1, hw / CURVE_HW);
    const crown = lerpTable(s.crown, x) * narrow;
    const roll = ROLL * narrow;
    const exp = Math.max(0.1, lerpTable(s.crownExp, x));
    const ch = yTop - Math.max(0, crown);
    // recessed channel: around the hole (shallowing to nothing at its rear end, so the rear of the hole
    // cuts cleanly through the cover), and running on ahead of it (carbon base visible) to frontX,
    // shallowing out over the last 15 mm
    let r = 0, d = depth;
    if (hh > 0) {
      r = hh + lip;
      d = depth * smoothstep(holeRearX, holeRearX + 3 * lip, x);
    } else if (x > holeFrontX && x < frontX) {
      r = (holeFrontHW + lip) * Math.sqrt(1 - (x - holeFrontX) / (frontX - holeFrontX));
      d = depth * (1 - smoothstep(frontX - 15, frontX, x));
    }
    // Column K sits on the hole edge, and ahead of the hole on the channel floor's edge (r − lip, which
    // equals the hole's half-width at its front end) so neither crease zigzags across the columns. Past
    // the hole ends it eases out to the uniform spacing over SPAN_EASE mm: continuous across the hole
    // ends (a jump shows as a step) and never collapsing to a point (which fans into slivers).
    let span = hh;
    if (hh <= 0 && x < holeRearX) {
      span = holeRearHW + (OUT_OF_HOLE_S * hw - holeRearHW) * smoothstep(0, SPAN_EASE, holeRearX - x);
    } else if (hh <= 0) {
      span = Math.max(r - lip, OUT_OF_HOLE_S * hw * smoothstep(0, SPAN_EASE, x - holeFrontX));
    }
    const sh = Math.min(0.9, span / hw);

    for (let vi = 0; vi <= V; vi++) {
      const k = vi - HALF, a = Math.abs(k);
      const sAbs = a <= K ? (a / K) * sh : sh + ((a - K) / (HALF - K)) * (1 - sh);
      const z = Math.sign(k) * sAbs * hw;
      let y = ch + crown * (1 - Math.pow(sAbs, exp)) - roll * smoothstep(0.8, 1, sAbs) ** 2;
      if (r > 0) y -= d * (1 - smoothstep(r - lip, r, Math.abs(z)));
      // underside: the traced base along the centre, rising to a thin rim at the edge (never below the
      // base, where the shell is thinner than SHELL)
      const yb = Math.min(yBot + Math.pow(sAbs, 3) * Math.max(0, y - SHELL - yBot), y - 1.5 * cap);
      const i = (ui * V1 + vi) * 3;
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
      pos[nPts * 3 + i] = x; pos[nPts * 3 + i + 1] = yb; pos[nPts * 3 + i + 2] = z;
    }
  }

  const idx: number[] = [];
  const T = (ui: number, vi: number) => ui * V1 + vi;
  const B = (ui: number, vi: number) => nPts + ui * V1 + vi;
  const inHole = (ui: number, vi: number) =>
    holeRow[ui] && holeRow[ui + 1] && vi >= HALF - K && vi < HALF + K;

  for (let ui = 0; ui < U; ui++) {
    for (let vi = 0; vi < V; vi++) {
      if (inHole(ui, vi)) continue;
      const a = T(ui, vi), b = a + 1, c = T(ui + 1, vi), d = c + 1;
      idx.push(a, c, b, b, c, d);                        // top — normal up
      const e = B(ui, vi), f = e + 1, g = B(ui + 1, vi), h = g + 1;
      idx.push(e, f, g, f, h, g);                        // underside — normal down
    }
  }
  // Nose (+x) and tail (−x) walls
  for (let vi = 0; vi < V; vi++) {
    idx.push(T(0, vi), T(0, vi + 1), B(0, vi), T(0, vi + 1), B(0, vi + 1), B(0, vi));
    idx.push(T(U, vi), B(U, vi), T(U, vi + 1), T(U, vi + 1), B(U, vi), B(U, vi + 1));
  }
  // Rim walls (−z, +z)
  for (let ui = 0; ui < U; ui++) {
    idx.push(T(ui, 0), B(ui, 0), T(ui + 1, 0), T(ui + 1, 0), B(ui, 0), B(ui + 1, 0));
    idx.push(T(ui, V), T(ui + 1, V), B(ui, V), T(ui + 1, V), B(ui + 1, V), B(ui, V));
  }
  // Hole walls: sides face into the hole; the end rows close it fore and aft
  let first = -1, last = -1;
  for (let ui = 0; ui < U; ui++) {
    if (!(holeRow[ui] && holeRow[ui + 1])) continue;
    if (first < 0) first = ui;
    last = ui + 1;
    const l = HALF - K, r = HALF + K;
    idx.push(T(ui, l), T(ui + 1, l), B(ui, l), T(ui + 1, l), B(ui + 1, l), B(ui, l));
    idx.push(T(ui, r), B(ui, r), T(ui + 1, r), T(ui + 1, r), B(ui, r), B(ui + 1, r));
  }
  if (first >= 0) {
    for (let vi = HALF - K; vi < HALF + K; vi++) {
      idx.push(T(first, vi), B(first, vi), T(first, vi + 1), T(first, vi + 1), B(first, vi), B(first, vi + 1));
      idx.push(T(last, vi), T(last, vi + 1), B(last, vi), T(last, vi + 1), B(last, vi + 1), B(last, vi));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The two rails as tubes along the traced rail centreline, splayed per `railHalfSpread`. */
export function buildTracedRailGeometry(s: SaddleTrace, radius = 4): THREE.BufferGeometry[] {
  return [-1, 1].map((side) => {
    const pts = s.railLine.map(([x, y]) => new THREE.Vector3(x, y, side * lerpTable(s.railHalfSpread, x)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, radius, 10, false);
  });
}
