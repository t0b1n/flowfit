// Loft: every cross-section is the front-view arch (from the photo), scaled to the local height (side photo) and plan width.
const VENTS = process.env.VENTS === "1";
// Vents from all three photos are pressed in as shallow recesses (geometry only). No straps.
import * as THREE from 'three';
import fs from 'fs';
const S = JSON.parse(fs.readFileSync('sil.json'));
const SK = .2456, FK = .183, YTOP = 150, XF = 112;
const sideX = px => XF - (px - 160) * SK, sideY = py => YTOP - (py - 405) * SK;
const smooth = (arr, r) => arr.map((_, i) => { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const v = arr[i + k]; if (v != null) { s += v; n++; } } return s / n; });
const lin = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts.at(-1)[1]; };
// side top (px→mm), smoothed; clean bottom traced by hand (straps excluded)
const sc = S.side.cols.filter(c => c[1] >= 0 && c[0] >= 160 && c[0] <= 1236);
const topS = smooth(sc.map(c => sideY(c[1])), 3); const TOP = sc.map((c, i) => [sideX(c[0]), topS[i]]).reverse();
const BOTPX = [[160, 950], [250, 985], [450, 970], [600, 930], [780, 888], [950, 882], [1100, 866], [1236, 852]];
const BOT = BOTPX.map(([px, py]) => [sideX(px), sideY(py)]).reverse();
const XT = TOP[0][0], XN = TOP.at(-1)[0];
// front arch normalised: a(t), t∈[0,1] lateral → height fraction
const fc = S.front.cols.filter(c => c[1] >= 0); const fTop = Math.min(...fc.map(c => c[1])), fBot = 942, fHalf = (fc.at(-1)[0] - fc[0][0]) / 2, fMid = (fc.at(-1)[0] + fc[0][0]) / 2;
const archPts = []; for (let k = 0; k <= 40; k++) { const t = k / 40, px = fMid + t * fHalf; const c = fc.reduce((a, b) => Math.abs(b[0] - px) < Math.abs(a[0] - px) ? b : a); const pxr = fMid - t * fHalf; const cr = fc.reduce((a, b) => Math.abs(b[0] - pxr) < Math.abs(a[0] - pxr) ? b : a); archPts.push([t, Math.max(0, Math.min(1, (fBot - (c[1] + cr[1]) / 2) / (fBot - fTop)))]); }
const arch = t => { const a = Math.min(1, Math.abs(t)); const w = a < .95 ? 1 : Math.max(0, 1 - (a - .95) / .05); return lin(archPts, Math.min(a, .95)) * w; };
// plan half-width: max from the front photo, rounded nose, tapering tail
const WMAX = fHalf * FK;
const width = X => { const L = XN - XT, u = (X - XT) / L; const tail = Math.pow(Math.min(1, u / .22), .5), nose = Math.pow(Math.min(1, (1 - u) / .2), .45); return WMAX * Math.min(1, .55 + .45 * tail) * Math.min(1, .5 + .5 * nose) * (1 - .06 * (u - .55) ** 2); };
const NS = 320, NT = 260, pos = new Float32Array((NS + 1) * (NT + 1) * 3);
const P = (s, t) => { const X = XT + (XN - XT) * s, top = lin(TOP, X), bot = lin(BOT, X), W = width(X); return [X, bot + (top - bot) * arch(t), t * W]; };
for (let i = 0; i <= NS; i++) for (let j = 0; j <= NT; j++) { const p = P(i / NS, -1 + 2 * j / NT); pos.set(p, (i * (NT + 1) + j) * 3); }
const idx = []; for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
// press vents in along the normal, from whichever photo the surface faces
const D = (view) => S[view].dark;
const m4 = (view, px, py) => { const d = D(view), j = Math.round(py / 4), i = Math.round(px / 4); return d[j] && d[j][i] === '1' ? 1 : 0; };
const blur = (view, px, py) => { let m = 0, n = 0; for (let a = -16; a <= 16; a += 4) for (let b = -16; b <= 16; b += 4) { const w = Math.exp(-(a * a + b * b) / 120); m += w * m4(view, px + a, py + b); n += w; } return ss(.3, .7, m / n); };
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const nrm = g.attributes.normal;
const inSide = (X, Y) => Y <= lin(TOP, X) - 1.5 && Y >= lin(BOT, X) + 2;
for (let k = 0; k < pos.length / 3; k++) {
  const X = pos[k * 3], Y = pos[k * 3 + 1], Z = pos[k * 3 + 2], nx = nrm.getX(k), nz = nrm.getZ(k);
  let v = 0;
  if (Math.abs(nz) > .35 && inSide(X, Y)) v = Math.max(v, blur('side', 160 + (XF - X) / SK, 405 + (YTOP - Y) / SK) * Math.min(1, (Math.abs(nz) - .35) / .3));
  if (nx > .25) v = Math.max(v, blur('front', fMid + Z / FK, fTop + (lin(TOP, X) - Y) / (lin(TOP, X) - lin(BOT, X) + 1e-3) * (fBot - fTop) * 0 + 188 + (YTOP - Y) / FK) * Math.min(1, (nx - .25) / .3));
  if (nx < -.3) v = Math.max(v, blur('rear', fMid - Z / FK, 194 + (YTOP - Y) / FK) * Math.min(1, (-nx - .3) / .3));
  const d = VENTS ? 4 * v : 0;
  pos[k * 3] -= nx * d; pos[k * 3 + 1] -= nrm.getY(k) * d; pos[k * 3 + 2] -= nz * d;
}
g.attributes.position.needsUpdate = true; g.computeVertexNormals();
const outline = TOP.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]).concat(BOT.slice().reverse().map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]));
const vents = []; const DS = S.side.dark;
for (let j = 0; j < DS.length; j++) for (let i = 0; i < DS[j].length; i++) { if (DS[j][i] !== '1') continue; const X = sideX(i * 4), Y = sideY(j * 4); if (X < XT || X > XN || !inSide(X, Y)) continue; vents.push([+X.toFixed(1), +Y.toFixed(1)]); }
fs.writeFileSync('helmet_geo.json', JSON.stringify({ pos: Array.from(pos, v => +v.toFixed(2)), index: idx, nor: Array.from(g.attributes.normal.array, v => +v.toFixed(3)), outline, vents }));
console.log('verts', pos.length / 3, 'WMAX', WMAX.toFixed(0), 'X', XT.toFixed(0), XN.toFixed(0));
