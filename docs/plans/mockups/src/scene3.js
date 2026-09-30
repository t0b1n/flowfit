import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { build, METRICS, band } from './geom.js';

const Q = new URLSearchParams(location.search);
const THEME = Q.get('theme') || 'light';
const W = +(Q.get('w') || 1600), H = +(Q.get('h') || 1000);
const T = {
  light: { bg: 0xE6E1D8, floor: 0xE2DDD3, ink: 0x161616, accent: 0xFF4F00, frame: [0x2D4A53, .42, .35, .35, .1], alloy: [0x1D2023, .7, .42], rubber: 0x1B1B1B, tan: 0xB89468, spoke: 0x2A2D31, rider: [0xA89E91, .88, .4, 0xffffff], helmet: 0xEFEBE4, exp: 1.05 },
  dark: { bg: 0x111213, floor: 0x0a0a0b, ink: 0xE8E6E1, accent: 0xFF5A1F, frame: [0xDCD8D0, .38, .6, .25, .1], alloy: [0x17181A, .75, .38], rubber: 0x151515, tan: 0x8E7456, spoke: 0x2C2E31, rider: [0x7D8085, .72, .5, 0xCFD6DE], helmet: 0x1C1D1F, exp: 1.15 },
}[THEME];
const G = build(0), G0 = build(-6);
const { P, J, C, F, R } = G;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const V2 = (p, z = 0) => V(p.x, p.y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));
const d2r = d => d * Math.PI / 180;

const phys = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: .8, ...o });
const MAT = {
  frame: phys(T.frame[0], { roughness: T.frame[1], clearcoat: T.frame[2], clearcoatRoughness: T.frame[3], metalness: T.frame[4] }),
  alloy: phys(T.alloy[0], { metalness: T.alloy[1], roughness: T.alloy[2] }),
  rubber: new THREE.MeshStandardMaterial({ color: T.rubber, roughness: .95 }),
  tan: new THREE.MeshStandardMaterial({ color: T.tan, roughness: .9 }),
  spoke: new THREE.MeshStandardMaterial({ color: T.spoke, metalness: .8, roughness: .4 }),
  rider: phys(T.rider[0], { roughness: T.rider[1], sheen: T.rider[2], sheenColor: T.rider[3] }),
  helmet: phys(T.helmet, { roughness: .35, clearcoat: .8, clearcoatRoughness: .2, side: THREE.DoubleSide }),
};

// ── plan §5.1 limb builder ──
function limbGeometry(L, prof, seg = 32, lat = 44) {
  const pts = [], r0 = prof(0), r1 = prof(1);
  for (let i = 0; i <= 9; i++) { const a = -Math.PI / 2 + i / 9 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r0), Math.sin(a) * r0)); }
  for (let i = 1; i < seg; i++) { const t = i / seg; pts.push(new THREE.Vector2(prof(t), t * L)); }
  for (let i = 0; i <= 9; i++) { const a = i / 9 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r1), L + Math.sin(a) * r1)); }
  const g = new THREE.LatheGeometry(pts, lat); g.computeVertexNormals(); return g;
}
function between(obj, a, b) { obj.position.copy(a); obj.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); return obj; }
function limb(a, b, prof, mat, sxz) {
  const g = limbGeometry(a.distanceTo(b), prof); if (sxz) g.scale(sxz[0], 1, sxz[1]);
  const m = between(new THREE.Mesh(g, mat), a, b); m.castShadow = m.receiveShadow = true; return m;
}
const tube = (a, b, r0, r1, mat) => limb(a, b, t => lerp(r0, r1, t), mat);
const sphere = (p, r, mat, s = [1, 1, 1]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat); m.scale.set(...s); m.position.copy(p); m.castShadow = m.receiveShadow = true; return m; };

const scene = new THREE.Scene();
scene.background = new THREE.Color(T.bg);
const bike = new THREE.Group(), rider = new THREE.Group(); scene.add(bike, rider);

// ── Bike (plan §6) ──
const htDown = V(G.htDown.x, G.htDown.y), stUp = V(G.stUp.x, G.stUp.y);
const bb = V(0, 0), cluster = V2(P.cluster), htTop = V2(P.htTop), htBot = V2(P.htBot), rear = V2(P.rear), front = V2(P.front);
const Fm = MAT.frame, A = MAT.alloy;
bike.add(tube(bb, cluster, 17, 15, Fm));
bike.add(tube(cluster, htTop.clone().addScaledVector(htDown, 18), 15, 17, Fm));
bike.add(tube(bb, htBot.clone().addScaledVector(htDown, -20), 24, 20, Fm));
bike.add(tube(htBot.clone().addScaledVector(htDown, 14), htTop.clone().addScaledVector(htDown, -6), 23, 19, Fm));
const stayTop = cluster.clone().addScaledVector(stUp, -35);
for (const s of [-1, 1]) {
  bike.add(tube(V(0, 0, s * 38), rear.clone().setZ(s * 64), 13, 8, Fm));
  bike.add(tube(stayTop.clone().setZ(s * 16), rear.clone().setZ(s * 64), 9, 6, Fm));
  const crown = htBot.clone().setZ(s * 28);
  const curve = new THREE.QuadraticBezierCurve3(crown, htBot.clone().addScaledVector(htDown, 200).add(V(8, 0, s * 52)), front.clone().setZ(s * 52));
  const fk = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 11, 16), Fm); fk.castShadow = true; bike.add(fk);
}
bike.add(tube(htBot.clone().setZ(34), htBot.clone().setZ(-34), 20, 20, Fm));
bike.add(sphere(bb, 30, Fm), sphere(cluster, 18, Fm), sphere(htTop.clone().addScaledVector(htDown, 8), 21, Fm), sphere(htBot.clone().addScaledVector(htDown, -8), 25, Fm));
bike.add(tube(cluster, V2(P.saddle).addScaledVector(stUp, -30), 13, 13, A));
bike.add(tube(htTop, V2(P.steerTop), 16, 16, A));
bike.add(tube(V2(P.steerTop), V2(P.clamp), 17, 15, A));
const hood = V2(P.hood);
for (const s of [-1, 1]) {
  const hz = s * C.hoodW / 2, cl = V2(P.clamp);
  const pts = [cl.clone().setZ(0), cl.clone().setZ(s * 110), cl.clone().add(V(45, 0)).setZ(hz), hood.clone().add(V(-8, -34)).setZ(hz), hood.clone().add(V(14, -115)).setZ(hz), cl.clone().add(V(-6, -128)).setZ(hz)];
  const b = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 12, 14), A); b.castShadow = true; bike.add(b);
  bike.add(limb(hood.clone().add(V(-22, -22)).setZ(hz), hood.clone().add(V(40, 18)).setZ(hz), t => 19 + 7 * bump(t, .78, .18), MAT.rubber));
}
{ // saddle
  const g = new THREE.SphereGeometry(1, 48, 24); g.scale(128, 20, 64);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); const k = x > 0 ? lerp(1, .26, (x / 128) ** 1.3) : 1; pos.setZ(i, pos.getZ(i) * k); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, MAT.rubber); m.position.copy(V2(P.saddle)).add(V(-12, 8)); m.castShadow = true; bike.add(m);
}
function wheel(c) {
  const g = new THREE.Group(); g.position.copy(c); const WR = F.wr;
  g.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 14, 14, 20, 128), MAT.rubber));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 26, 7, 12, 128), MAT.tan));
  const rim = new THREE.Mesh(new THREE.LatheGeometry([[WR - 28, -11], [WR - 80, -7], [WR - 85, 0], [WR - 80, 7], [WR - 28, 11]].map(([r, y]) => new THREE.Vector2(r, y)), 128), A);
  rim.rotation.x = Math.PI / 2; g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 110, 24), A); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, s = i % 2 ? 1 : -1; g.add(tube(V(0, 0, s * 34), V(Math.cos(a) * (WR - 84), Math.sin(a) * (WR - 84), 0), 1.4, 1.4, MAT.spoke)); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}
bike.add(wheel(rear), wheel(front));
{ // chainring, spider, chain, cassette (drive side = −Z)
  const sh = new THREE.Shape(), N = 50;
  for (let i = 0; i <= N * 2; i++) { const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? 102 : 108; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(r, 0); }
  const h = new THREE.Path(); h.absarc(0, 0, 84, 0, Math.PI * 2, true); sh.holes.push(h);
  const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: false, curveSegments: 3 }), A); ring.position.z = -60; ring.castShadow = true; bike.add(ring);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; bike.add(tube(V(0, 0, -58), V(Math.cos(a) * 90, Math.sin(a) * 90, -58), 8, 5, A)); }
  const cas = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 32, 32), A); cas.rotation.x = Math.PI / 2; cas.position.copy(rear).setZ(-58); bike.add(cas);
  bike.add(tube(V(0, 106, -58), rear.clone().add(V(0, 46, -58)), 3.5, 3.5, A), tube(V(0, -106, -58), rear.clone().add(V(0, -46, -58)), 3.5, 3.5, A));
}
const legs = [
  { s: 1, hip: V2(J.hip, 100), knee: V2(J.knee, 77.5), ankle: V2(J.ankle, 77.5), cleat: V2(J.cleatL, 77.5) },  // near/left at BDC
  { s: -1, hip: V2(J.hip, -100), knee: V2(J.kneeR, -77.5), ankle: V2(J.ankleR, -77.5), cleat: V2(J.cleatR, -77.5) },
];
for (const L of legs) {
  const spindle = V(L.cleat.x + C.cleatSetback, L.cleat.y, L.s * 88);
  bike.add(tube(V(0, 0, L.s * 55), spindle, 13, 9, A));
  const pd = new THREE.Mesh(new THREE.BoxGeometry(84, 12, 60), A); pd.position.copy(spindle).setZ(L.s * 100).add(V(0, -4, 0)); pd.castShadow = true; bike.add(pd);
}

// ── Rider (plan §5.2–5.3) ──
const Rm = MAT.rider;
const hipC = V2(J.hip), shC = V2(J.shoulder);
const torsoProf = t => 108 - 20 * bump(t, .45, .16) + 16 * bump(t, .85, .12);
rider.add(limb(hipC.clone().add(V(-6, -10)), shC.clone().add(V(-4, -12)), torsoProf, Rm, [.72, 1.3]));
rider.add(tube(V(J.hip.x - 20, J.hip.y - 8, 100), V(J.hip.x - 20, J.hip.y - 8, -100), 82, 82, Rm));
rider.add(tube(V2(J.shoulder, 200), V2(J.shoulder, -200), 50, 50, Rm));
for (const s of [-1, 1]) rider.add(sphere(V2(J.shoulder, s * 200), 52, Rm));
for (const L of legs) {
  rider.add(limb(L.hip, L.knee, t => (lerp(80, 52, t) + 10 * bump(t, .3, .2)), Rm, [1, .92]));
  rider.add(sphere(L.knee, 54, Rm, [1, 1, .92]));
  rider.add(limb(L.knee, L.ankle, t => lerp(46, 30, t) + 14 * bump(t, .28, .13), Rm, [1, .9]));
  rider.add(sphere(L.ankle, 31, Rm));
  const toe = L.cleat.clone().add(L.cleat.clone().sub(L.ankle).setZ(0).normalize().multiplyScalar(40));
  rider.add(limb(L.ankle.clone().add(V(-30, 8)), toe.add(V(55, -6)), t => lerp(40, 26, t), MAT.helmet, [1, .85]));
}
const up2len = (a, b) => a.distanceTo(b);
for (const s of [-1, 1]) {
  const sh = V2(J.shoulder, s * 200), el = V2(J.elbow, s * 200), wr = V2(J.wrist, s * C.hoodW / 2), hd = V2(J.hands, s * C.hoodW / 2);
  rider.add(limb(sh, el, t => lerp(44, 36, t) + 5 * bump(t, .4, .2), Rm));
  rider.add(sphere(el, 36, Rm));
  rider.add(limb(el, wr, t => lerp(38, 24, t) + 6 * bump(t, .22, .15), Rm, [1, .85]));
  const hEnd = hd.clone().add(hd.clone().sub(wr).normalize().multiplyScalar(30));
  rider.add(limb(wr, hEnd, t => lerp(26, 22, t), MAT.alloy, [.8, 1.25]));
}
// neck + head ellipsoid + helmet
const headC = V2(J.head), neckB = V2(J.neckBase);
rider.add(tube(shC.clone().add(V(-10, -20)), headC.clone().add(V(-30, -40)), 52, 50, Rm));
const neckAng = Math.atan2(J.head.y - J.neckBase.y, J.head.x - J.neckBase.x);
const gaze = neckAng - d2r(80);
const headG = new THREE.Group(); headG.position.copy(headC); headG.rotation.z = gaze; rider.add(headG);
{ const h = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), Rm); h.scale.set(100, 112, 78); h.castShadow = true; headG.add(h); }
{ // helmet recipe
  const g = new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, Math.PI * .62);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    z *= .86; y *= .78; if (x < 0) { x *= 1.28; y -= .18 * x * x; } else x *= 1.06;
    p.setXYZ(i, x * 116 - 10, y * 122 + 16, z * 95);
  }
  g.computeVertexNormals(); const hm = new THREE.Mesh(g, MAT.helmet); hm.castShadow = true; headG.add(hm);

}

// ── Stage ──
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); document.getElementById('c').appendChild(renderer.domElement);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = T.exp;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = THEME === 'light' ? .45 : .35;
const cam = new THREE.PerspectiveCamera(30, W / H, 10, 40000);
const CAM = JSON.parse(Q.get('cam') || '[[1750,1120,4150],[60,470,0]]');
cam.position.set(...CAM[0]); cam.lookAt(...CAM[1]);
const groundY = F.bbDrop - F.wr;
scene.add(new THREE.HemisphereLight(THEME === 'light' ? 0xFFFAF2 : 0xD9E2EC, THEME === 'light' ? 0xB3A898 : 0x0B0B0C, THEME === 'light' ? .9 : .55));
const key = new THREE.DirectionalLight(0xFFF1DE, 3.0); key.position.set(600, 3400, 700); key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -1900, right: 1900, top: 1900, bottom: -1900, near: 100, far: 9000 }); key.shadow.radius = 6; key.shadow.bias = -.0004; scene.add(key);
const rim = new THREE.DirectionalLight(0xDFE8F2, THEME === 'light' ? 1.0 : 2.2); rim.position.set(-2400, 900, 500); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, THEME === 'light' ? .4 : 1.0); fill.position.set(2400, 600, -1800); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: T.floor, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = groundY; floor.receiveShadow = true; scene.add(floor);
scene.fog = new THREE.Fog(T.bg, 6200, 12000);
[bike, rider].forEach(g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }));

// ── Analytics hairlines (analytics-root) ──
const lineMat = (c, op = 1) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false });
const line = (pts, c, op = 1) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c, op)); l.renderOrder = 9; scene.add(l); };
const arc = (c, a0, a1, r, col, z, op = 1) => { const pts = []; for (let i = 0; i <= 48; i++) { const a = lerp(a0, a1, i / 48); pts.push(V(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, z)); } line(pts, col, op); };
const ang = (a, o) => Math.atan2(a.y - o.y, a.x - o.x);
const zA = (R.stance / 2 + 90);
// focused: knee arc + rays in accent
arc(J.knee, ang(J.ankle, J.knee), ang(J.hip, J.knee), 110, T.accent, zA);
line([V2(J.hip, zA), V2(J.knee, zA), V2(J.ankle, zA)], T.accent, 1);
// pinned trunk: ink hairline
arc(J.hip, 0, d2r(G.M.trunk), 220, T.ink, zA, .6); line([V2(J.hip, zA), V(J.hip.x + 300, J.hip.y, zA)], T.ink, .6); line([V2(J.hip, zA), V2(J.shoulder, zA)], T.ink, .6);
// pinned saddle height: vertical dim with end ticks
{ const x = P.saddle.x, z = zA; line([V(x, 0, z), V(x, P.saddle.y, z)], T.ink, .55); for (const y of [0, P.saddle.y]) line([V(x - 18, y, z), V(x + 18, y, z)], T.ink, .55); line([V(0, 0, z), V(x, 0, z)], T.ink, .25); }
// ghost FIT 02 (−6 mm): accent hairlines only for small deltas
line([V2(G0.J.hip, zA), V2(G0.J.knee, zA), V2(G0.J.ankle, zA)], T.accent, .45);
// ghost volume omitted: delta < 6 mm → hairlines only (plan §4.8)
// ground ruler
const zr = -(R.stance / 2 + 260), x0 = Math.floor(P.rear.x / 50) * 50, x1 = Math.ceil(P.front.x / 50) * 50, gy = groundY + 1;
line([V(x0, gy, zr), V(x1, gy, zr)], T.ink, .6);
for (let x = x0; x <= x1; x += 25) { const big = x % 100 === 0; line([V(x, gy, zr), V(x, gy, zr - (big ? 70 : 30))], T.ink, big ? .7 : .3); }
for (const a of [P.rear, P.bb, P.front]) line([V(a.x, gy, zr + 40), V(a.x, gy, zr - 160)], T.accent, .9);

// ── Render ──
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
const ao = new GTAOPass(scene, cam, W, H); ao.blendIntensity = 1.0; ao.updateGtaoMaterial({ radius: 110, distanceExponent: 1.5, thickness: 60, scale: 1 }); composer.addPass(ao);
composer.addPass(new OutputPass()); composer.addPass(new SMAAPass(W, H));
composer.render();

const scr = p => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
window.__proj = {
  knee: scr(V2(J.knee, 77.5)), hip: scr(V2(J.hip, zA)), saddle: scr(V2(P.saddle)), spine: scr(V2(J.spine, 0)),
  rulerL: scr(V(x0 - 60, gy, zr - 230)), rulerB: scr(V(0, gy, zr - 230)), rulerR: scr(V(x1 + 80, gy, zr - 230)),
};
window.__G = G; window.__G0 = G0; window.__METRICS = METRICS; window.__band = band;
await document.fonts.ready;
window.dispatchEvent(new Event('scene-ready'));
