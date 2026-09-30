import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { build, METRICS, band } from './geom.js';
import { V, V2, lerp, d2r, bump, limb as limbG } from './kit.js';
import { buildRider } from './rider3.js';
import { buildBike } from './bike3.js';
import { withFresnel } from './fresnel.js';

const Q = new URLSearchParams(location.search);
const THEME = Q.get('theme') || 'light', SEX = Q.get('sex') || 'm';
const W = +(Q.get('w') || 1600), H = +(Q.get('h') || 1000);
const ANALYTICS = Q.get('analytics') !== '0';
// Contact brand tokens. Bike colourway: "Moss" satin frame, carbon black everything else.
const T = {
  light: { bg: 0xE6E1D8, floor: 0xE2DDD3, ink: 0x161616, accent: 0xFF4F00, frame: 0x4A5240, clay: 0x8C8276, rim: 0xFFFBF3, rimK: +(Q.get('rim') ?? .38), skin: 0xA69888, jersey: 0x2E3033, bib: 0x161718, sock: 0xEDEAE4, shoe: 0xEDEAE4, helmet: 0xEDEAE4, exp: .95 },
  dark: { bg: 0x111213, floor: 0x0a0a0b, ink: 0xE8E6E1, accent: 0xFF5A1F, frame: 0x8E9A7C, clay: 0x7D8085, rim: 0xD6DDE6, rimK: +(Q.get('rim') ?? .5), skin: 0x8A8D91, jersey: 0x3A3D42, bib: 0x131415, sock: 0xD9D5CD, shoe: 0xD9D5CD, helmet: 0xD9D5CD, exp: 1.12 },
}[THEME];
const phys = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: .8, ...o });
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
const MAT = {
  frame: phys(T.frame, { roughness: .45, clearcoat: .3, clearcoatRoughness: .4, metalness: .05 }),
  carbon: phys(0x141516, { roughness: .32, clearcoat: .7, clearcoatRoughness: .2 }),
  alloy: phys(0x2A2C2F, { metalness: .8, roughness: .35 }),
  tyre: std(0x1A1A1A, { roughness: .92 }), tape: std(0x1C1C1D, { roughness: .9 }), hood: std(0x202022, { roughness: .75 }),
  saddle: std(0x1A1A1B, { roughness: .6 }), spoke: std(0x303236, { metalness: .7, roughness: .4 }),
  rotor: phys(0x9A9FA6, { metalness: .9, roughness: .28 }), caliper: phys(0x2A2C2F, { metalness: .6, roughness: .4 }), chain: phys(0x55595F, { metalness: .9, roughness: .35 }),
  bottle: std(THEME === 'light' ? 0xD6CFC2 : 0x4B4D50, { roughness: .6 }),
  skin: phys(T.skin, { roughness: .78, sheen: .35, sheenColor: 0xffffff }),
  jersey: phys(T.jersey, { roughness: .7, sheen: .5, sheenColor: 0x9aa0a6 }), bib: phys(T.bib, { roughness: .55, sheen: .4, sheenColor: 0x777777 }),
  sock: std(T.sock, { roughness: .9 }), shoe: phys(0x1A1B1C, { roughness: .35, clearcoat: .6 }), sole: phys(0x141516, { roughness: .4 }),
  glove: withFresnel(phys(T.clay, { roughness: .82 }), { color: T.rim, strength: T.rimK, power: 2.6 }), lens: phys(0x0E0F10, { roughness: .08, metalness: .5, clearcoat: 1 }),
  clay: withFresnel(phys(T.clay, { roughness: .8 }), { color: T.rim, strength: T.rimK, power: 4 }),
  focus: Q.get('focus') === '0' ? null : withFresnel(phys(T.clay, { roughness: .8 }), { color: T.accent, strength: .6, power: 3.6 }),
  helmetV: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .5, clearcoat: .4, clearcoatRoughness: .5, side: THREE.DoubleSide }),
  T: T,
  hair: phys(0x3B3430, { roughness: .9, sheen: .6, sheenColor: 0x8a7a6a }),
  body: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .74, sheen: .35, sheenColor: 0xbbbbbb }),
  cols: { skin: T.skin, jersey: T.jersey, bib: T.bib, sock: T.sock },
  helmet: phys(T.helmet, { roughness: .28, clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide }), vent: phys(0x141516, { roughness: .6, side: THREE.DoubleSide }),
};
const G = build(0, SEX), G0 = build(-6, SEX), { P, J, F, R } = G;
const scene = new THREE.Scene(); scene.background = new THREE.Color(T.bg);
scene.add(buildBike(G, MAT), buildRider(G, MAT));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); document.getElementById('c').appendChild(renderer.domElement);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = T.exp;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = THEME === 'light' ? .3 : .3;
const cam = new THREE.PerspectiveCamera(+(Q.get('fov') || 30), W / H, 10, 40000);
const CAM = JSON.parse(Q.get('cam') || '[[1750,1120,4150],[60,470,0]]');
cam.position.set(...CAM[0]); cam.lookAt(...CAM[1]);
const groundY = F.bbDrop - F.wr;
scene.add(new THREE.HemisphereLight(THEME === 'light' ? 0xFFFAF2 : 0xD9E2EC, THEME === 'light' ? 0xB3A898 : 0x0B0B0C, THEME === 'light' ? .55 : .45));
const key = new THREE.DirectionalLight(0xFFF1DE, 2.6); key.position.set(900, 3200, 1600); key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -1900, right: 1900, top: 1900, bottom: -1900, near: 100, far: 9000 }); key.shadow.bias = -.0004; scene.add(key);
const rim = new THREE.DirectionalLight(0xDFE8F2, THEME === 'light' ? 1.1 : 2.2); rim.position.set(-2400, 900, 500); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, THEME === 'light' ? .25 : .8); fill.position.set(2400, 600, 1800); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), std(T.floor, { roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = groundY; floor.receiveShadow = true; scene.add(floor);
scene.fog = new THREE.Fog(T.bg, 6200, 12000);

const lineMat = (c, op = 1) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false });
const line = (pts, c, op = 1) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c, op)); l.renderOrder = 9; scene.add(l); };
const arc = (c, a0, a1, r, col, z, op = 1) => { const pts = []; for (let i = 0; i <= 48; i++) { const a = lerp(a0, a1, i / 48); pts.push(V(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, z)); } line(pts, col, op); };
const ang = (a, o) => Math.atan2(a.y - o.y, a.x - o.x);
const zA = R.stance / 2 + 90;
const zr = -(R.stance / 2 + 260), x0 = Math.floor(P.rear.x / 50) * 50, x1 = Math.ceil(P.front.x / 50) * 50, gy = groundY + 1;
if (ANALYTICS) {
  arc(J.knee, ang(J.ankle, J.knee), ang(J.hip, J.knee), 110, T.accent, zA);
  line([V2(J.hip, zA), V2(J.knee, zA), V2(J.ankle, zA)], T.accent, 1);
  arc(J.hip, 0, d2r(G.M.trunk), 220, T.ink, zA, .6); line([V2(J.hip, zA), V(J.hip.x + 300, J.hip.y, zA)], T.ink, .6); line([V2(J.hip, zA), V2(J.shoulder, zA)], T.ink, .6);
  { const x = P.saddle.x; line([V(x, 0, zA), V(x, P.saddle.y, zA)], T.ink, .55); for (const y of [0, P.saddle.y]) line([V(x - 18, y, zA), V(x + 18, y, zA)], T.ink, .55); line([V(0, 0, zA), V(x, 0, zA)], T.ink, .25); }
  line([V2(G0.J.hip, zA), V2(G0.J.knee, zA), V2(G0.J.ankle, zA)], T.accent, .45);
  if (Q.get('ghost') === 'race') { const gm = withFresnel(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false }), { color: T.accent, strength: .75, power: 3, alphaOnly: true });
    const GR = build(0, SEX, 28); const gmat = new Proxy({}, { get: () => gm }); const gr = buildRider(GR, gmat); gr.traverse(o => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 5; } }); scene.add(gr); }
  else if (Q.get('ghost') !== '0') { const gm = withFresnel(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false }), { color: T.accent, strength: .9, power: 2.2, alphaOnly: true });
    scene.add(limbG(V2(G0.J.hip, R.hipW / 2), V2(G0.J.knee, R.stance / 2), t => lerp(84, 51, t) + 12 * bump(t, .3, .2), gm, [1.02, .9]), limbG(V2(G0.J.knee, R.stance / 2), V2(G0.J.ankle, R.stance / 2), t => lerp(45, 27, t) + 8 * bump(t, .3, .14), gm, [1, .92])); }
  line([V(x0, gy, zr), V(x1, gy, zr)], T.ink, .6);
  for (let x = x0; x <= x1; x += 25) { const big = x % 100 === 0; line([V(x, gy, zr), V(x, gy, zr - (big ? 70 : 30))], T.ink, big ? .7 : .3); }
  for (const a of [P.rear, P.bb, P.front]) line([V(a.x, gy, zr + 40), V(a.x, gy, zr - 160)], T.accent, .9);
}
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
const ao = new GTAOPass(scene, cam, W, H); ao.blendIntensity = 1.0; ao.updateGtaoMaterial({ radius: 90, distanceExponent: 1.5, thickness: 50, scale: 1 }); composer.addPass(ao);
composer.addPass(new OutputPass()); composer.addPass(new SMAAPass(W, H));
composer.render();
const scr = p => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
window.__proj = { knee: scr(V2(J.knee, R.stance / 2)), hip: scr(V2(J.hip, zA)), saddle: scr(V2(P.saddle)), spine: scr(V2(J.spine, 0)),
  rulerL: scr(V(x0 - 60, gy, zr - 230)), rulerB: scr(V(0, gy, zr - 230)), rulerR: scr(V(x1 + 80, gy, zr - 230)) };
window.__G = G; window.__G0 = G0; window.__METRICS = METRICS; window.__band = band;
await document.fonts.ready;
window.dispatchEvent(new Event('scene-ready'));
