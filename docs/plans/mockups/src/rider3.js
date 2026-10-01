// Clay mannequin, lathe-based (the earlier representation), refined to a toned male build.
import * as THREE from 'three';
import { buildHelmet } from './helmet.js';
import { V, V2, lerp, bump, d2r, limb, tube, sphere, limbGeometry, between, helmetGeometry, helmetPoint, VENTS } from './kit.js';

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// lathe with a per-height lateral/depth scale (for V-taper torso)
function taperLimb(a, b, prof, sx, sz, mat) {
  const L = a.distanceTo(b), g = limbGeometry(L, prof, 40, 56), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, p.getY(i) / L)); p.setX(i, p.getX(i) * sx(t)); p.setZ(i, p.getZ(i) * sz(t)); }
  g.computeVertexNormals(); const m = between(new THREE.Mesh(g, mat), a, b); return m;
}
// Lathe limb with directional muscle bulges built into the surface.
// bulges: [{ dir: world Vector3 (unit, ⟂ bone), t, w, amp, spread }] — radius += amp·gauss(t)·max(0,cos θ)^spread
const FAT = 1.1;
function muscleLimb(a, b, prof0, bulges, mat, sxz = [1, 1]) {
  const prof = t => prof0(t) * FAT; const L = a.distanceTo(b), g = limbGeometry(L, prof, 48, 64), p = g.attributes.position;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), qi = q.clone().invert();
  const loc = bulges.map(u => { const d = u.dir.clone().applyQuaternion(qi); d.y = 0; d.normalize(); return { ...u, d }; });
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z); if (rr < 1e-3) continue;
    const t = Math.min(1, Math.max(0, y / L)); let add = 0;
    for (const u of loc) { const c = (x * u.d.x + z * u.d.z) / rr; if (c > 0) add += FAT * u.amp * Math.exp(-((t - u.t) ** 2) / (2 * u.w * u.w)) * Math.pow(c, u.spread ?? 2); }
    const k = (rr + add) / rr; p.setX(i, x * k * sxz[0]); p.setZ(i, z * k * sxz[1]);
  }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.position.copy(a); m.quaternion.copy(q); return m;
}
const ell = (p, r, mat, rotZ = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat); m.scale.set(...r); m.position.copy(p); m.rotation.z = rotZ; return m; };

export function _dummy(){}
export function headDeform(x, y, z) {
      
      // base skull 100 x 116 x 78 centred slightly low; face plane flattened, jaw tapers toward chin
      let X = x * 96, Y = y * 118 - 6, Z = z * 76;
      const low = ss(0, -1, y);                                   // 0 at equator → 1 at chin
      Z *= 1 - .18 * low;                                         // jaw narrows
      X = X > 0 ? X * (1 - .06 * low) + 4 * low : X * (1 - .4 * low); Y += 10 * low * low; // squarer jaw   // jaw forward, back of neck in
      if (X > 0) { const face = Math.max(0, x) ** 6; X -= 6 * face; }   // flatter face
      const nose = Math.exp(-((y + .1) ** 2) / .02) * Math.exp(-(z * z) / .008) * Math.max(0, x) ** 4; X += 24 * nose * (1 - ss(-.05, -.3, y) * 0);
      const chin = Math.exp(-((y + .86) ** 2) / .01) * Math.exp(-(z * z) / .05) * Math.max(0, x) ** 2; X += 8 * chin;
      const brow = Math.exp(-((y - .16) ** 2) / .004) * Math.max(0, x) ** 6 * (1 - z * z); X += 5 * brow;
      return [X, Y, Z];
}
export const HELMET = (() => {
  const off = 16, A = 98 + off, B = 94 + 8, Cz = 77 + off + 4, cx = -8, cy = 18, RA = 1.1;
  const rimY = x => { const u = (x - cx) / A; return u > 0 ? lerp(-6, 20, u) : lerp(-6, -44, (-u) ** 1.3); };
  const q = 2.3;
  const sect = (x, v, k = 1) => { // v ∈ [-1,1] across the section (0 = crown)
    const u = (x - cx) / (x < cx ? A * RA : A), kk = Math.pow(Math.max(0, 1 - Math.abs(u) ** (x < cx ? 3 : 2.2)), 1 / (x < cx ? 3 : 2.2));
    const vv = Math.max(-1, Math.min(1, (rimY(x) - cy) / (B * Math.max(kk, 1e-3)))), am = Math.acos(Math.sign(vv) * Math.abs(vv) ** (q / 2));
    const a = v * am, ca = Math.cos(a), sa = Math.sin(a);
    return V(x, cy + B * kk * Math.sign(ca) * Math.abs(ca) ** (2 / q) * k, Cz * kk * Math.sign(sa) * Math.abs(sa) ** (2 / q) * k);
  };
  const band = (d, w) => ss(w, w * .55, Math.abs(d));
  const ventMask = () => 0; // option 2: clean shell, no vents
  return { A, cx, cy, RA, sect, ventMask, x0: cx - A * RA + 1, x1: cx + A - 1 };
})();
export function buildRider(G, MAT) {
  const T3 = MAT.T || { helmet: 0xEDEAE4 };
  const { J, C, R } = G, g = new THREE.Group();
  const CL = MAT.clay, FO = MAT.focus || CL;
  const hs = R.shoulderW / 2 + 34, hh = R.hipW / 2, st = R.stance / 2, hw = C.hoodW / 2;
  const hip = V2(J.hip), sh = V2(J.shoulder), ax = sh.clone().sub(hip).normalize(), nrm = V(-ax.y, ax.x); // nrm = "up/back" side of torso
  const trunkA = Math.atan2(ax.y, ax.x);
  // Torso: pelvis → narrow waist → broad ribcage/lats → chest; V-taper in width, flat back
  const torsoProf = t => 1.08 * (98 - 18 * bump(t, .36, .13) + 18 * bump(t, .78, .16));
  g.add(taperLimb(hip.clone().addScaledVector(ax, -10), sh.clone().addScaledVector(ax, -18), torsoProf,
    t => lerp(.9, 1.02, ss(.3, .85, t)), t => lerp(1.08, 1.6, ss(.28, .86, t)), CL));
  for (const s of [-1, 1]) g.add(ell(hip.clone().lerp(sh, .66).addScaledVector(nrm, 10).setZ(s * 128), [92, 44, 34], CL, trunkA)); // lats
  // (no pec masses: they read wrongly on a leaning figure — chest width carries it)
  // trapezius slope + deltoids (capped, slightly along the upper arm)
  for (const s of [-1, 1]) {
    g.add(limb(V2(J.neckBase).add(V(-20, -6)), V2(J.shoulder, s * (hs - 16)), t => lerp(50, 42, t), CL));
    const up = V2(J.elbow, s * (hs + 6)).sub(V2(J.shoulder, s * hs)).normalize();
    const dl = ell(V2(J.shoulder, s * hs).addScaledVector(up, 26), [60, 70, 56], CL); dl.quaternion.setFromUnitVectors(V(0, 1, 0), up); g.add(dl);
  }
  // pelvis + glutes
  g.add(tube(V(J.hip.x - 16, J.hip.y - 4, hh), V(J.hip.x - 16, J.hip.y - 4, -hh), 78, 78, CL));
  for (const s of [-1, 1]) g.add(ell(V(J.hip.x - 52, J.hip.y - 20, s * 54), [64, 58, 58], CL, trunkA * .3));
  // legs: quads (vastus + VMO teardrop), calf mass behind the shin
  const legs = [[1, J.knee, J.ankle, J.cleatL, FO], [-1, J.kneeR, J.ankleR, J.cleatR, CL]];
  for (const [s, kn, an, cl, M] of legs) {
    const h = V2(J.hip, s * hh), k = V2(kn, s * st), a = V2(an, s * st), c = V2(cl, s * st);
    const kd = k.clone().sub(h).normalize(), antT = V(-kd.y, kd.x).normalize(); if (antT.y < 0) antT.negate();
    const med = V(0, 0, -s), lat = V(0, 0, s);
    g.add(muscleLimb(h, k, t => lerp(80, 50, t) + 6 * bump(t, .3, .2), [
      { dir: antT, t: .45, w: .22, amp: 16, spread: 2 },                               // rectus / vastus mass
      { dir: antT.clone().add(med).normalize(), t: .84, w: .08, amp: 14, spread: 3 },  // VMO teardrop
      { dir: lat, t: .45, w: .2, amp: 12, spread: 2 },                                 // vastus lateralis sweep
      { dir: antT.clone().negate(), t: .35, w: .2, amp: 8, spread: 2 },                // hamstrings
    ], M, [1, .92]));
    g.add(sphere(k, 54, M, [1, 1, .9]));
    const sd = a.clone().sub(k).normalize(); let post = V(sd.y, -sd.x).normalize(); if (post.x > 0) post.negate();
    g.add(muscleLimb(k, a, t => lerp(42, 22, t) - 3 * bump(t, .85, .1), [
      { dir: post.clone().add(med.clone().multiplyScalar(.75)).normalize(), t: .3, w: .12, amp: 36, spread: 4 },  // gastrocnemius medial head (lower, fuller)
      { dir: post.clone().add(lat.clone().multiplyScalar(.75)).normalize(), t: .24, w: .1, amp: 28, spread: 4 },  // lateral head (higher) → diamond split
      { dir: post, t: .5, w: .12, amp: 12, spread: 3 },                                                           // soleus
      { dir: med, t: .52, w: .12, amp: 8, spread: 3 },                                                            // soleus medial flare
      { dir: lat, t: .3, w: .16, amp: 5, spread: 2 },                                                            // tibialis/peroneals
    ], M, [1, .92]));
    g.add(sphere(a, 29, M));
    const toeDir = c.clone().sub(a).setZ(0).normalize(), heel = a.clone().add(V(-36, -18)), toe = c.clone().addScaledVector(toeDir, 70).add(V(20, -4));
    g.add(limb(heel, toe, t => lerp(38, 24, t) + 6 * bump(t, .3, .2), MAT.shoe, [1, .82]));
    g.add(limb(heel.clone().add(V(4, -26)), toe.clone().add(V(-6, -20)), () => 9, MAT.sole, [1, 2.6]));
  }
  // arms: biceps/triceps mass, forearm flare
  for (const s of [-1, 1]) {
    const shp = V2(J.shoulder, s * hs), el = V2(J.elbow, s * (hs + 6)), wr = V2(J.wrist, s * hw), hd = V2(J.hands, s * hw);
    const ud = el.clone().sub(shp).normalize(); let ant = V(-ud.y, ud.x).normalize(); if (ant.x < 0) ant.negate();
    g.add(muscleLimb(shp, el, t => lerp(42, 33, t), [
      { dir: ant, t: .52, w: .18, amp: 12, spread: 2 },               // biceps
      { dir: ant.clone().negate(), t: .38, w: .2, amp: 13, spread: 2 }, // triceps
      { dir: V(0, 0, s), t: .2, w: .14, amp: 8, spread: 2 },            // deltoid insertion
    ], CL));
    g.add(sphere(el, 36, CL));
    const fd = wr.clone().sub(el).normalize(); let up2 = V(-fd.y, fd.x).normalize(); if (up2.y < 0) up2.negate();
    g.add(muscleLimb(el, wr, t => lerp(36, 21, t), [{ dir: up2, t: .18, w: .14, amp: 10, spread: 2 }, { dir: V(0, 0, s), t: .22, w: .15, amp: 6, spread: 2 }], CL, [1, .86]));
    const hEnd = hd.clone().add(hd.clone().sub(wr).normalize().multiplyScalar(28));
    g.add(limb(wr, hEnd, t => lerp(24, 21, t), MAT.glove, [.78, 1.3]));
  }
  // neck (thick), head, jaw, glasses, helmet
  const headC = V2(J.head);
  g.add(tube(sh.clone().add(V(-12, -22)), headC.clone().add(V(-26, -44)), 54, 49, CL));
  const na = Math.atan2(J.head.y - J.neckBase.y, J.head.x - J.neckBase.x), gaze = na - d2r(78);
  const H = new THREE.Group(); H.position.copy(headC); H.rotation.z = gaze; g.add(H);
  // head (head-local: +x gaze, +y up, +z left): one deformed ellipsoid — cranium, tapered jaw, subtle nose ridge
  const CR = { c: V(-8, 18, 0), r: V(98, 94, 77) };
  { const hg = new THREE.SphereGeometry(1, 64, 48), p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) { const [X, Y, Z] = headDeform(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, X, Y, Z); }
    hg.computeVertexNormals(); H.add(new THREE.Mesh(hg, CL)); }
  for (const s of [-1, 1]) H.add(ell(V(-14, -6, s * 74), [13, 24, 7], CL));
  // helmet — modelled on the S-Works Evade 4: compact, rounded, close to the head, short squared tail,
  // mouth-port brow intake, 7 front vents curving rearward, diagonal side vent, wide rear exhaust.
  const { A, cx, cy, RA, sect, ventMask } = HELMET;
  H.add(buildHelmet(MAT.helmet));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
