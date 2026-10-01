// Shared mock geometry (mm, origin BB, X fwd, Y up, Z = rider's left). Mirrors app conventions.
const d2r = d => d * Math.PI / 180, r2d = r => r * 180 / Math.PI;
const v = (x, y) => ({ x, y });
const add = (a, b) => v(a.x + b.x, a.y + b.y), sub = (a, b) => v(a.x - b.x, a.y - b.y), mul = (a, s) => v(a.x * s, a.y * s);
const len = a => Math.hypot(a.x, a.y), norm = a => mul(a, 1 / len(a));
export const angleAt = (a, o, c) => { const u = sub(a, o), w = sub(c, o); return r2d(Math.acos((u.x * w.x + u.y * w.y) / (len(u) * len(w)))); };
// circle-circle intersections (same as app's circleIntersections)
function cc(a, b, ra, rb) {
  const d = len(sub(b, a)), x = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - x * x));
  const u = norm(sub(b, a)), n = v(-u.y, u.x), m = add(a, mul(u, x));
  return [add(m, mul(n, h)), add(m, mul(n, -h))];
}
export function build(saddleDelta = 0, sex = 'm', trunkDeg = 36) {
  const male = sex === 'm';
  const H = male ? 1800 : 1680;
  // Optimal road-racer bases: male 1800 mm / 70 kg, female 1680 mm / 58 kg
  const R = male
    ? { thigh: 465, shank: 455, torso: 545, upper: 305, fore: 300, hipOff: 95, foot: 270, shoulderW: 380, hipW: 190, stance: 155, weight: 70 }
    : { thigh: 440, shank: 425, torso: 480, upper: 292, fore: 275, hipOff: 90, foot: 245, shoulderW: 345, hipW: 200, stance: 150, weight: 58 };
  const F = male ? { stack: 560, reach: 385, ha: 73, sa: 73.5, bbDrop: 70, cs: 410, wr: 340 } : { stack: 530, reach: 376, ha: 72, sa: 74, bbDrop: 72, cs: 408, wr: 340 };
  const C = male ? { crank: 172.5, stem: 100, stemAng: -6, spacers: 20, barReach: 78, hoodW: 400, cleatSetback: 12 } : { crank: 165, stem: 80, stemAng: -6, spacers: 15, barReach: 70, hoodW: 370, cleatSetback: 10 };
  const P = {};
  P.bb = v(0, 0);
  P.rear = v(-Math.sqrt(F.cs ** 2 - F.bbDrop ** 2), F.bbDrop);
  P.htTop = v(F.reach, F.stack);
  const htDown = v(Math.cos(d2r(F.ha)), -Math.sin(d2r(F.ha)));
  P.htBot = add(P.htTop, mul(htDown, 150));
  P.front = v(P.htBot.x + (P.htBot.y - F.bbDrop) / Math.tan(d2r(F.ha)) + 47, F.bbDrop);
  const stUp = v(-Math.cos(d2r(F.sa)), Math.sin(d2r(F.sa)));
  P.cluster = mul(stUp, male ? 470 : 440); // sloping top tube, low seat cluster
  P.steerTop = add(P.htTop, mul(htDown, -(C.spacers + 15)));
  const stemDir = v(Math.cos(d2r(C.stemAng + (90 - F.ha) * 0 )), Math.sin(d2r(C.stemAng)));
  P.clamp = add(P.steerTop, mul(stemDir, C.stem));
  P.hood = add(P.clamp, v(C.barReach, 22));
  // BDC (left/near leg) cleat, TDC (right) cleat
  const cleatL = v(-C.cleatSetback, -C.crank), cleatR = v(-C.cleatSetback, C.crank);
  // Saddle height chosen so knee extension at BDC ≈ 146°, then + saddleDelta along seat tube
  const ankleSetback = R.foot * 0.19;
  const kneeExtFor = (s) => { const sad = mul(stUp, s); const hip = add(sad, v(0, R.hipOff)); const ank = add(cleatL, v(-55, 85)); const k = cc(hip, ank, R.thigh, R.shank).sort((a, b) => b.x - a.x)[0]; return angleAt(hip, k, ank); };
  let s = 560; while (kneeExtFor(s) < 146 && s < 900) s += 0.5;
  s += saddleDelta;
  P.saddle = mul(stUp, s);
  const hip = add(P.saddle, v(0, R.hipOff));
  const ankL0 = add(cleatL, v(-55, 85)), ankR0 = add(cleatR, v(-55, 85));
  const knee = cc(hip, ankL0, R.thigh, R.shank).sort((a, b) => b.x - a.x)[0];
  const kneeR = cc(hip, ankR0, R.thigh, R.shank).sort((a, b) => b.x - a.x)[0];
  // Trunk: closed-chain like the app but with a slight elbow bend: shoulder from trunk angle
  const trunk = d2r(trunkDeg);
  const shoulder = add(hip, mul(v(Math.cos(trunk), Math.sin(trunk)), R.torso));
  // hands at hoods; project arm lengths laterally like the app
  const lat = (C.hoodW / 2 - R.shoulderW / 2);
  const up2 = Math.sqrt(R.upper ** 2 - (lat * R.upper / (R.upper + R.fore)) ** 2), fo2 = Math.sqrt(R.fore ** 2 - (lat * R.fore / (R.upper + R.fore)) ** 2);
  let hands = P.hood; const toH = sub(hands, shoulder);
  if (len(toH) > up2 + fo2) hands = add(shoulder, mul(norm(toH), up2 + fo2 - 0.1));
  const [eA, eB] = cc(shoulder, hands, up2, fo2);
  // APP RULE: elbow on the same side of shoulder→hands line as the BB
  const side = p => (hands.x - shoulder.x) * (p.y - shoulder.y) - (hands.y - shoulder.y) * (p.x - shoulder.x);
  const elbow = Math.sign(side(eA)) === Math.sign(side(P.bb)) ? eA : eB;
  const palm = 0.055 * H;
  const wrist = add(elbow, mul(norm(sub(hands, elbow)), R.fore - palm));
  const spine = add(hip, mul(sub(shoulder, hip), 0.4));
  const neckAng = d2r(55) - 0.6 * trunk, headDir = trunk + neckAng;
  const head = add(shoulder, mul(v(Math.cos(headDir), Math.sin(headDir)), 160));
  const neckBase = add(shoulder, mul(sub(head, shoulder), 0.15));
  const ankle = ankL0, ankleR = ankR0;
  // KOPS: knee x at 3 o'clock minus spindle x
  const c3 = v(C.crank - C.cleatSetback, 0), k3 = cc(hip, add(c3, v(-55, 85)), R.thigh, R.shank).sort((a, b) => b.x - a.x)[0];
  const M = {
    trunk: r2d(trunk), hip: angleAt(shoulder, hip, knee), knee_ext_bdc: angleAt(hip, knee, ankL0),
    knee_flex_tdc: 180 - angleAt(hip, kneeR, ankR0), shoulder: angleAt(hip, shoulder, elbow),
    elbow_flex: 180 - angleAt(shoulder, elbow, hands), saddle_height: P.saddle.y, setback: -P.saddle.x,
    drop: P.saddle.y - P.hood.y, reach: P.hood.x - P.saddle.x, kops: k3.x - c3.x,
  };
  return { sex, H, R, F, C, P, htDown, stUp, J: { hip, knee, kneeR, ankle, ankleR, cleatL, cleatR, shoulder, elbow, wrist, hands, head, neckBase, spine }, M, saddleLen: s };
}
export const METRICS = [
  ['trunk', 'J1', 'TRUNK', '°', [35, 45]], ['hip', 'J2', 'HIP', '°', [95, 110]], ['knee_ext_bdc', 'J3', 'KNEE EXT', '°', [140, 150]],
  ['knee_flex_tdc', 'J4', 'KNEE TDC', '°', [105, 115]], ['shoulder', 'J5', 'SHOULDER', '°', [70, 90]], ['elbow_flex', 'J6', 'ELBOW', '°', [10, 25]],
  ['saddle_height', 'C1', 'SADDLE', 'mm'], ['setback', 'C2', 'SETBACK', 'mm'], ['drop', 'C3', 'DROP', 'mm'], ['reach', 'C4', 'REACH', 'mm'], ['kops', 'C5', 'KOPS', 'mm'],
];
export const band = (val, b) => !b ? null : (val >= b[0] && val <= b[1]) ? 'in' : (val >= b[0] - 4 && val <= b[1] + 4) ? 'near' : 'out';
