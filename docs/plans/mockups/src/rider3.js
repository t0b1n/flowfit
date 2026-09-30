// Clay mannequin, lathe-based (the earlier representation), refined to a toned male build.
import * as THREE from 'three';
import { V, V2, lerp, bump, d2r, limb, tube, sphere, limbGeometry, between, helmetGeometry, helmetPoint, VENTS } from './kit.js';

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// lathe with a per-height lateral/depth scale (for V-taper torso)
function taperLimb(a, b, prof, sx, sz, mat) {
  const L = a.distanceTo(b), g = limbGeometry(L, prof, 40, 56), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, p.getY(i) / L)); p.setX(i, p.getX(i) * sx(t)); p.setZ(i, p.getZ(i) * sz(t)); }
  g.computeVertexNormals(); const m = between(new THREE.Mesh(g, mat), a, b); return m;
}
const ell = (p, r, mat, rotZ = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat); m.scale.set(...r); m.position.copy(p); m.rotation.z = rotZ; return m; };

export function buildRider(G, MAT) {
  const { J, C, R } = G, g = new THREE.Group();
  const CL = MAT.clay, FO = MAT.focus || CL;
  const hs = R.shoulderW / 2 + 34, hh = R.hipW / 2, st = R.stance / 2, hw = C.hoodW / 2;
  const hip = V2(J.hip), sh = V2(J.shoulder), ax = sh.clone().sub(hip).normalize(), nrm = V(-ax.y, ax.x); // nrm = "up/back" side of torso
  const trunkA = Math.atan2(ax.y, ax.x);
  // Torso: pelvis → narrow waist → broad ribcage/lats → chest; V-taper in width, flat back
  const torsoProf = t => 100 - 14 * bump(t, .36, .14) + 16 * bump(t, .78, .16);
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
  for (const s of [-1, 1]) g.add(ell(V(J.hip.x - 52, J.hip.y - 20, s * 54), [62, 56, 56], CL, trunkA * .3));
  // legs: quads (vastus + VMO teardrop), calf mass behind the shin
  const legs = [[1, J.knee, J.ankle, J.cleatL, FO], [-1, J.kneeR, J.ankleR, J.cleatR, CL]];
  for (const [s, kn, an, cl, M] of legs) {
    const h = V2(J.hip, s * hh), k = V2(kn, s * st), a = V2(an, s * st), c = V2(cl, s * st);
    g.add(limb(h, k, t => lerp(84, 51, t) + 12 * bump(t, .3, .2), M, [1.02, .9]));
    const kd = k.clone().sub(h).normalize(), kn2 = V(-kd.y, kd.x);
    g.add(ell(h.clone().lerp(k, .82).addScaledVector(kn2, 8).setZ(s * (st - 26)), [30, 50, 26], M, Math.atan2(kd.y, kd.x) + Math.PI / 2)); // VMO
    g.add(sphere(k, 52, M, [1, 1, .9]));
    g.add(limb(k, a, t => lerp(45, 27, t) + 8 * bump(t, .3, .14), M, [1, .92]));
    const sd = a.clone().sub(k).normalize(), back = V(sd.y, -sd.x); // calf behind (rearward)
    g.add(ell(k.clone().lerp(a, .3).addScaledVector(back, -18), [34, 88, 34], M, Math.atan2(sd.y, sd.x) + Math.PI / 2));
    g.add(sphere(a, 29, M));
    const toeDir = c.clone().sub(a).setZ(0).normalize(), heel = a.clone().add(V(-36, -18)), toe = c.clone().addScaledVector(toeDir, 70).add(V(20, -4));
    g.add(limb(heel, toe, t => lerp(38, 24, t) + 6 * bump(t, .3, .2), MAT.shoe, [1, .82]));
    g.add(limb(heel.clone().add(V(4, -26)), toe.clone().add(V(-6, -20)), () => 9, MAT.sole, [1, 2.6]));
  }
  // arms: biceps/triceps mass, forearm flare
  for (const s of [-1, 1]) {
    const shp = V2(J.shoulder, s * hs), el = V2(J.elbow, s * (hs + 6)), wr = V2(J.wrist, s * hw), hd = V2(J.hands, s * hw);
    g.add(limb(shp, el, t => lerp(46, 35, t) + 9 * bump(t, .45, .2), CL));
    g.add(sphere(el, 35, CL));
    g.add(limb(el, wr, t => lerp(41, 23, t) + 7 * bump(t, .18, .14), CL, [1, .86]));
    const hEnd = hd.clone().add(hd.clone().sub(wr).normalize().multiplyScalar(28));
    g.add(limb(wr, hEnd, t => lerp(24, 21, t), MAT.glove, [.78, 1.3]));
  }
  // neck (thick), head, jaw, glasses, helmet
  const headC = V2(J.head);
  g.add(tube(sh.clone().add(V(-12, -22)), headC.clone().add(V(-26, -44)), 58, 52, CL));
  const na = Math.atan2(J.head.y - J.neckBase.y, J.head.x - J.neckBase.x), gaze = na - d2r(80);
  const H = new THREE.Group(); H.position.copy(headC); H.rotation.z = gaze; g.add(H);
  H.add(ell(V(0, 0, 0), [96, 108, 76], CL), ell(V(28, -60, 0), [58, 46, 56], CL), ell(V(90, -4, 0), [16, 22, 11], CL));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 64, 1, true, Math.PI * .2, Math.PI * .6), MAT.lens); band.scale.set(106, 1, 88); band.position.set(4, 12, 0); H.add(band);
  H.add(new THREE.Mesh(helmetGeometry(1), MAT.helmet));
  for (const [s0, s1, pc, pw] of VENTS) H.add(new THREE.Mesh(helmetGeometry(1, s0, s1, pc - pw, pc + pw, 1.2, 30, 6), MAT.vent));
  const lip = []; for (let i = 0; i <= 80; i++) lip.push(helmetPoint(i / 80, -1)); for (let i = 80; i >= 0; i--) lip.push(helmetPoint(i / 80, 1));
  H.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lip, true), 200, 4.5, 8, true), MAT.vent));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
