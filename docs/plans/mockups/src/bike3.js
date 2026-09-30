import * as THREE from 'three';
import { V, V2, lerp, bump, limb, tube, sphere } from './kit.js';

function gear(teeth, rOut, rRoot, rHole, depth, mat) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2, r = i % 2 ? rRoot : rOut; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(r, 0); }
  if (rHole) { const h = new THREE.Path(); h.absarc(0, 0, rHole, 0, Math.PI * 2, true); sh.holes.push(h); }
  return new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 2 }), mat);
}
function rotor(r, mat, spider) {
  const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, r - 16, 0, Math.PI * 2, true); sh.holes.push(h);
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false, curveSegments: 48 }), mat));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(tube(V(0, 0, 1), V(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12), 1), 5, 3.5, spider)); }
  return g;
}
export function buildBike(G, MAT) {
  const { P, F, C, R, J } = G, g = new THREE.Group();
  const htDown = V(G.htDown.x, G.htDown.y), stUp = V(G.stUp.x, G.stUp.y);
  const bb = V(0, 0), cl = V2(P.cluster), ht = V2(P.htTop), hb = V2(P.htBot), rear = V2(P.rear), front = V2(P.front);
  const Fm = MAT.frame, A = MAT.alloy, K = MAT.carbon;
  // frame: aero-ish round tubes, sloping top tube, dropped stays
  g.add(tube(bb, cl, 18, 16, Fm));
  g.add(tube(cl, ht.clone().addScaledVector(htDown, 22), 15, 18, Fm));
  g.add(limb(bb, hb.clone().addScaledVector(htDown, -24), t => lerp(27, 21, t), Fm, [1, .82]));
  g.add(tube(hb.clone().addScaledVector(htDown, 16), ht.clone().addScaledVector(htDown, -4), 24, 19, Fm));
  const stayTop = cl.clone().addScaledVector(stUp, -70);
  for (const s of [-1, 1]) {
    g.add(limb(V(0, 0, s * 40), rear.clone().setZ(s * 66), t => lerp(14, 8, t), Fm, [1.25, 1]));
    g.add(tube(stayTop.clone().setZ(s * 14), rear.clone().setZ(s * 66), 9, 6.5, Fm));
    const crown = hb.clone().addScaledVector(htDown, 10).setZ(s * 30);
    const mid = hb.clone().addScaledVector(htDown, 190).add(V(4, 0, s * 52));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(crown, mid, front.clone().setZ(s * 54)), 36, 12, 16), Fm));
  }
  g.add(tube(hb.clone().setZ(36), hb.clone().setZ(-36), 22, 22, Fm));
  g.add(sphere(bb, 34, Fm), sphere(cl, 19, Fm), sphere(ht.clone().addScaledVector(htDown, 6), 20, Fm), sphere(hb.clone().addScaledVector(htDown, -8), 25, Fm));
  // aero seatpost + integrated clamp, headset top cap, spacers, stem
  g.add(limb(cl, V2(P.saddle).addScaledVector(stUp, -32), () => 14, K, [1.5, .75]));
  for (let i = 0; i < 3; i++) g.add(tube(ht.clone().addScaledVector(htDown, -i * 7), ht.clone().addScaledVector(htDown, -i * 7 - 6), 18, 18, i === 0 ? Fm : K));
  g.add(tube(ht, V2(P.steerTop), 16, 16, K));
  g.add(limb(V2(P.steerTop).addScaledVector(htDown, 14), V2(P.clamp), t => lerp(19, 16, t), K, [1, .8]));
  // drop bar (black tape) + STI hoods and levers
  const hood = V2(P.hood), clp = V2(P.clamp);
  for (const s of [-1, 1]) {
    const hz = s * C.hoodW / 2;
    const pts = [clp.clone().setZ(0), clp.clone().setZ(s * 100), clp.clone().add(V(42, 2)).setZ(hz), hood.clone().add(V(-6, -30)).setZ(hz), hood.clone().add(V(16, -108)).setZ(hz), clp.clone().add(V(-4, -126)).setZ(hz)];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 12.5, 14), MAT.tape));
    g.add(limb(hood.clone().add(V(-26, -26)).setZ(hz), hood.clone().add(V(46, 14)).setZ(hz), t => 16 + 10 * bump(t, .7, .2) + 4 * bump(t, .95, .08), MAT.hood, [1, .78]));
    const lev = [hood.clone().add(V(44, 4)).setZ(hz), hood.clone().add(V(54, -50)).setZ(hz), hood.clone().add(V(40, -110)).setZ(hz), hood.clone().add(V(20, -130)).setZ(hz)];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lev), 40, 6, 10), MAT.alloy));
  }
  { // saddle with rails
    const gs = new THREE.SphereGeometry(1, 56, 24); gs.scale(132, 22, 70);
    const pos = gs.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); const kk = x > 0 ? lerp(1, .24, (x / 132) ** 1.25) : lerp(1, .9, (-x / 132) ** 3); pos.setZ(i, pos.getZ(i) * kk); if (y < 0) pos.setY(i, y * .35); }
    gs.computeVertexNormals(); const m = new THREE.Mesh(gs, MAT.saddle); m.position.copy(V2(P.saddle)).add(V(-14, 10)); g.add(m);
    for (const s of [-1, 1]) g.add(tube(V2(P.saddle).add(V(-100, -2, s * 22)), V2(P.saddle).add(V(80, 2, s * 16)), 3.5, 3.5, A));
  }
  // wheels: carbon deep rims, black tyres, hubs, thru-axles, rotors on the left (+Z)
  const wheel = (c, rotR) => {
    const w = new THREE.Group(); w.position.copy(c); const WR = F.wr;
    w.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 14, 14, 22, 140), MAT.tyre));
    const rim = new THREE.Mesh(new THREE.LatheGeometry([[WR - 27, -12], [WR - 60, -10], [WR - 72, -4], [WR - 73, 0], [WR - 72, 4], [WR - 60, 10], [WR - 27, 12]].map(([r, y]) => new THREE.Vector2(r, y)), 140), K);
    rim.rotation.x = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 100, 24), A); hub.rotation.x = Math.PI / 2; w.add(hub);
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 150, 16), K); ax.rotation.x = Math.PI / 2; w.add(ax);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, s = i % 2 ? 1 : -1; w.add(tube(V(0, 0, s * 30), V(Math.cos(a) * (WR - 72), Math.sin(a) * (WR - 72), s * 4), 1.3, 1.3, MAT.spoke)); }
    const ro = rotor(rotR, MAT.rotor, A); ro.position.z = 52; w.add(ro);
    return w;
  };
  g.add(wheel(rear, 70), wheel(front, 80));
  // calipers (flat mount): front on left fork blade, rear on left chainstay
  const cal = (p, rot) => { const b = new THREE.Mesh(new THREE.BoxGeometry(62, 26, 34), MAT.caliper); b.position.copy(p); b.rotation.z = rot; g.add(b); };
  cal(front.clone().add(V(-52, 52, 58)), -.9); cal(rear.clone().add(V(58, 40, 58)), .35);
  // hoses: front along fork (left), rear along down tube underside is internal → only short exits
  g.add(tube(front.clone().add(V(-40, 78, 56)), hb.clone().addScaledVector(htDown, 120).setZ(48), 3, 3, MAT.tape));
  // drivetrain (drive side −Z): 52/36, spider, cranks, pedals, FD, RD, cassette, chain
  const big = gear(52, 107, 102, 86, 4, A); big.position.z = -62; g.add(big);
  const small = gear(36, 74, 69, 54, 4, A); small.position.z = -55; g.add(small);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .5; g.add(tube(V(0, 0, -58), V(Math.cos(a) * 88, Math.sin(a) * 88, -60), 9, 6, K)); }
  for (const [s, cl2] of [[1, J.cleatL], [-1, J.cleatR]]) {
    const sp = V(cl2.x + C.cleatSetback, cl2.y, s * 88);
    g.add(limb(V(0, 0, s * 60), sp, t => lerp(15, 10, t), K, [1, .6]));
    const pd = new THREE.Mesh(new THREE.BoxGeometry(80, 12, 62), K); pd.position.copy(sp).setZ(s * (R.stance / 2 + 18)).add(V(0, -4, 0)); g.add(pd);
  }
  const fd = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 12), A); fd.position.copy(cl.clone().multiplyScalar(.27)).setZ(-66); fd.rotation.z = Math.atan2(stUp.y, stUp.x) - Math.PI / 2 + .25; g.add(fd);
  for (let i = 0; i < 11; i++) { const r = lerp(72, 24, i / 10); const cs = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.2, 36), A); cs.rotation.x = Math.PI / 2; cs.position.copy(rear).setZ(-42 - i * 3.9); g.add(cs); }
  const up = rear.clone().add(V(8, -58, -58)), lo = rear.clone().add(V(28, -118, -58));
  const rd = new THREE.Group();
  rd.add(tube(rear.clone().add(V(-6, -8, -64)), rear.clone().add(V(-22, -36, -72)), 13, 12, K));
  rd.add(limb(rear.clone().add(V(-22, -36, -72)), up.clone().add(V(-4, 4, -8)), () => 12, K));
  for (const p of [up, lo]) { const pu = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 7, 24), A); pu.rotation.x = Math.PI / 2; pu.position.copy(p); rd.add(pu); }
  rd.add(limb(up.clone().add(V(-3, 0, -6)), lo.clone().add(V(-3, 0, -6)), () => 18, K, [.55, .3]));
  g.add(rd);
  const ch = (a, b) => g.add(tube(a, b, 3.2, 3.2, MAT.chain));
  ch(V(0, 106, -60), rear.clone().add(V(0, 60, -58)));
  ch(V(0, -106, -60), lo.clone().add(V(-12, -12, 0)));
  ch(lo.clone().add(V(16, 8, 0)), up.clone().add(V(18, 0, 0)));
  ch(up.clone().add(V(-14, 8, 0)), rear.clone().add(V(-18, -56, -58)));
  // bottle + cage on the seat tube
  const perp = V(stUp.y, -stUp.x); const bt0 = cl.clone().multiplyScalar(.22).addScaledVector(perp, 60), bt1 = cl.clone().multiplyScalar(.66).addScaledVector(perp, 60);
  g.add(limb(bt0, bt1, t => 37 - 6 * bump(t, 1, .08), MAT.bottle));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
