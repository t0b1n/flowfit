import { headDeform, HELMET } from './rider3.js';
// 2D side view (SVG, mm, y inverted) built from the SAME primitives as 3D: body SDF raster + bike + head/helmet.
import { profiles, helmetPoint, VENTS, lerp, bump } from './kit.js';
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

const pts = arr => arr.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join(' ');
function seg(a, b, prof, n = 18) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, left = [], right = [];
  for (let i = 0; i <= n; i++) { const t = i / n, r = prof(t), cx = a.x + dx * t, cy = a.y + dy * t; left.push([cx + nx * r, cy + ny * r]); right.push([cx - nx * r, cy - ny * r]); }
  const cap = (c, r, a0) => { const o = []; for (let i = 0; i <= 10; i++) { const a = a0 + i / 10 * Math.PI; o.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]); } return o; };
  const ang = Math.atan2(uy, ux);
  return pts([...left, ...cap(b, prof(1), ang - Math.PI / 2), ...right.reverse(), ...cap(a, prof(0), ang + Math.PI / 2)]);
}
const v = (x, y) => ({ x, y }), add = (a, b, k = 1) => v(a.x + b.x * k, a.y + b.y * k);
const P = (cls, p, extra = '') => `<polygon class="${cls}" points="${p}" ${extra}/>`;
const tube = (a, b, r0, r1, cls) => P(cls, seg(a, b, t => lerp(r0, r1, t), 6));
function gear(c, teeth, ro, ri) { const o = []; for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2, r = i % 2 ? ri : ro; o.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]); } return pts(o); }

export function bikeLayers(G) {
  const { P: Q, F, C, J, htDown, stUp } = G, cl = Q.cluster, ht = Q.htTop, hb = Q.htBot, L = {};
  // wheels (carbon deep rims, black tyres, dark spokes, hub)
  let w = '';
  for (const c of [Q.rear, Q.front]) {
    w += `<circle class="tyre" cx="${c.x}" cy="${-c.y}" r="${F.wr - 14}"/><circle class="rim" cx="${c.x}" cy="${-c.y}" r="${F.wr - 48}"/>`;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; w += `<line class="spoke" x1="${c.x}" y1="${-c.y}" x2="${(c.x + Math.cos(a) * (F.wr - 72)).toFixed(1)}" y2="${(-c.y - Math.sin(a) * (F.wr - 72)).toFixed(1)}"/>`; }
    w += `<circle class="hub" cx="${c.x}" cy="${-c.y}" r="20"/>`;
  }
  L.wheels = w;
  // drivetrain (drive side: behind frame in this left-side view)
  const up = v(Q.rear.x + 8, Q.rear.y - 58), lo = v(Q.rear.x + 28, Q.rear.y - 118);
  let d = `<polygon class="ringB" points="${gear(v(0, 0), 52, 107, 102)}"/><polygon class="ringS" points="${gear(v(0, 0), 36, 74, 69)}"/>`;
  for (let i = 0; i < 11; i++) d += `<circle class="cas" cx="${Q.rear.x}" cy="${-Q.rear.y}" r="${lerp(72, 24, i / 10)}"/>`;
  d += `<line class="chain" x1="0" y1="-106" x2="${Q.rear.x}" y2="${-(Q.rear.y + 60)}"/><polyline class="chain" points="0,106 ${lo.x - 12},${-(lo.y - 12)} ${lo.x + 16},${-(lo.y + 8)} ${up.x + 18},${-up.y} ${up.x - 14},${-(up.y + 8)} ${Q.rear.x - 18},${-(Q.rear.y - 56)}"/>`;
  d += tube(v(Q.rear.x - 6, Q.rear.y - 8), v(Q.rear.x - 22, Q.rear.y - 36), 13, 12, 'blk') + tube(v(Q.rear.x - 22, Q.rear.y - 36), up, 12, 12, 'blk') + tube(up, lo, 10, 10, 'blk');
  d += `<circle class="pul" cx="${up.x}" cy="${-up.y}" r="17"/><circle class="pul" cx="${lo.x}" cy="${-lo.y}" r="17"/>`;
  d += tube(v(0, 0), v(J.cleatR.x + C.cleatSetback, J.cleatR.y), 14, 10, 'blk') + `<rect class="blk" x="${J.cleatR.x + C.cleatSetback - 40}" y="${-J.cleatR.y - 2}" width="80" height="12"/>`;
  L.drive = d;
  // frame (moss), fork, dropped stays, aero post, cockpit, bottle, saddle
  const stayTop = add(cl, stUp, -70);
  let f = tube(v(0, 0), Q.rear, 14, 8, 'frame') + tube(stayTop, Q.rear, 9, 6.5, 'frame');
  f += tube(v(0, 0), cl, 18, 16, 'frame') + tube(cl, add(ht, htDown, 22), 15, 18, 'frame') + tube(v(0, 0), add(hb, htDown, -24), 27, 21, 'frame');
  f += tube(add(hb, htDown, 16), add(ht, htDown, -4), 24, 19, 'frame');
  f += `<path class="fork" d="M${hb.x + htDown.x * 10} ${-(hb.y + htDown.y * 10)} Q ${hb.x + htDown.x * 190 + 4} ${-(hb.y + htDown.y * 190)} ${Q.front.x} ${-Q.front.y}"/>`;
  f += `<circle class="frameF" cx="0" cy="0" r="34"/><circle class="frameF" cx="${cl.x}" cy="${-cl.y}" r="19"/>`;
  const perp = v(stUp.y, -stUp.x), b0 = add(add(v(0, 0), cl, .22), perp, 60), b1 = add(add(v(0, 0), cl, .66), perp, 60);
  f += tube(b0, b1, 37, 34, 'bottle') + `<line class="cage" x1="${b0.x}" y1="${-b0.y}" x2="${b1.x}" y2="${-b1.y}"/>`;
  f += P('carbon', seg(cl, add(Q.saddle, stUp, -32), () => 20, 6));
  f += tube(ht, Q.steerTop, 17, 17, 'carbon') + tube(add(Q.steerTop, htDown, 14), Q.clamp, 19, 16, 'carbon');
  f += `<path class="sad" d="M${Q.saddle.x - 150} ${-Q.saddle.y - 4} Q ${Q.saddle.x - 132} ${-Q.saddle.y - 30} ${Q.saddle.x - 40} ${-Q.saddle.y - 26} L ${Q.saddle.x + 112} ${-Q.saddle.y - 14} Q ${Q.saddle.x + 124} ${-Q.saddle.y - 8} ${Q.saddle.x + 104} ${-Q.saddle.y} L ${Q.saddle.x - 136} ${-Q.saddle.y + 8} Z"/>`;
  L.frame = f;
  // near-side (left) hardware: rotors, calipers, hose, near crank + pedal
  let n = '';
  for (const [c, r] of [[Q.rear, 70], [Q.front, 80]]) { n += `<circle class="rotor" cx="${c.x}" cy="${-c.y}" r="${r - 8}"/>`; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; n += `<line class="rotorS" x1="${c.x}" y1="${-c.y}" x2="${c.x + Math.cos(a) * (r - 14)}" y2="${-c.y - Math.sin(a) * (r - 14)}"/>`; } n += `<circle class="hub" cx="${c.x}" cy="${-c.y}" r="11"/>`; }
  n += `<rect class="cal" x="${Q.front.x - 88}" y="${-Q.front.y - 70}" width="60" height="26" transform="rotate(52 ${Q.front.x - 58} ${-Q.front.y - 57})"/><rect class="cal" x="${Q.rear.x + 30}" y="${-Q.rear.y - 54}" width="60" height="26" transform="rotate(-20 ${Q.rear.x + 60} ${-Q.rear.y - 41})"/>`;
  n += `<path class="hose" d="M${Q.front.x - 40} ${-(Q.front.y + 78)} Q ${hb.x + 30} ${-(hb.y - 150)} ${hb.x + htDown.x * 60 + 26} ${-(hb.y + htDown.y * 60)}"/>`;
  n += tube(v(0, 0), v(J.cleatL.x + C.cleatSetback, J.cleatL.y), 15, 10, 'blk') + `<circle class="blk" cx="0" cy="0" r="22"/><rect class="blk" x="${J.cleatL.x + C.cleatSetback - 40}" y="${-J.cleatL.y - 2}" width="80" height="12"/>`;
  L.near = n;
  // bars + hoods + levers (hands go on top of these)
  const hood = Q.hood, clp = Q.clamp;
  L.bars = `<path class="bar" d="M${clp.x} ${-clp.y} C ${clp.x + 60} ${-clp.y} ${hood.x + 6} ${-hood.y + 20} ${hood.x + 8} ${-hood.y + 60} S ${clp.x + 44} ${-clp.y + 126} ${clp.x - 4} ${-clp.y + 126}"/>`
    + P('hood', seg(v(hood.x - 26, hood.y - 26), v(hood.x + 46, hood.y + 14), t => 16 + 10 * bump(t, .7, .2) + 4 * bump(t, .95, .08)))
    + `<path class="lever" d="M${hood.x + 44} ${-(hood.y + 4)} C ${hood.x + 58} ${-(hood.y - 40)} ${hood.x + 46} ${-(hood.y - 100)} ${hood.x + 20} ${-(hood.y - 130)}"/>`;
  return L;
}
export function headSVG(G) {
  const { J, sex } = G, pr = profiles(sex), [hx, hy] = pr.head, k = hx / 96;
  const na = Math.atan2(J.head.y - J.neckBase.y, J.head.x - J.neckBase.x), gz = na - 80 * Math.PI / 180;
  const R = (x, y) => [J.head.x + x * Math.cos(gz) - y * Math.sin(gz), J.head.y + x * Math.sin(gz) + y * Math.cos(gz)];
  const ell = (cx, cy, rx, ry, n = 40) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push(R(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)); } return pts(o); };
  let s = '';
  if (sex === 'f') s += P('hair', ell(-150 * k, -50 * k, 46, 30)) + P('hair', ell(-178 * k, -78 * k, 26, 44));
  s += P('skin', ell(0, 0, hx, hy)) + P('skin', ell(26 * k, -60 * k, 56 * k, 44 * k)) + P('skin', ell(92 * k, -6 * k, 16 * k, 22 * k));
  s += P('lens', pts([R(58 * k, 26 * k), R(104 * k, 24 * k), R(106 * k, 4 * k), R(96 * k, -2 * k), R(60 * k, 2 * k), R(20 * k, 14 * k)].map(([x, y]) => [x, y])));
  const top = [], bot = []; for (let i = 0; i <= 90; i++) { const t = i / 90; const a = helmetPoint(t, 0, k), b = helmetPoint(t, 1, k); top.push(R(a.x, a.y)); bot.push(R(b.x, b.y)); }
  s += P('helmet', pts([...top, ...bot.reverse()]));
  for (const [s0, s1, pc] of VENTS) if (pc > .3) { const o = []; for (let i = 0; i <= 20; i++) { const q = helmetPoint(lerp(s0, s1, i / 20), pc, k); o.push(R(q.x, q.y)); } s += `<polyline class="vent" points="${pts(o)}"/>`; }
  return s;
}
export function extremitiesSVG(G, side) {
  const { J, C, R, sex } = G, f = sex === 'f';
  const [cl, an] = side === 'near' ? [J.cleatL, J.ankle] : [J.cleatR, J.ankleR];
  const dx = cl.x - an.x, dy = cl.y - an.y, L = Math.hypot(dx, dy);
  const heel = v(an.x - 38, an.y - 18), toe = v(cl.x + dx / L * 70 + 20, cl.y + dy / L * 70 - 4);
  let s = P(side === 'near' ? 'shoe' : 'shoe far', seg(heel, toe, t => lerp(38, 24, t) * (f ? .92 : 1) + 6 * bump(t, .3, .2))) + P('sole', seg(v(heel.x + 4, heel.y - 26), v(toe.x - 6, toe.y - 20), () => 9));
  if (side === 'near') { const wr = J.wrist, hd = J.hands, ux = hd.x - wr.x, uy = hd.y - wr.y, l = Math.hypot(ux, uy); s += P('glove', seg(v(wr.x + ux * .05, wr.y + uy * .05), v(hd.x + ux / l * 28, hd.y + uy / l * 28), t => lerp(25, 21, t))); }
  return s;
}

// ── Clay figure in 2D (same lathe profiles as the 3D mannequin) ──
const bumpf = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));
const ellP = (c, rx, ry, rot = 0, n = 36) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot)]); } return pts(o); };
export function clayDefs(tok) {
  const f = (id, col, r, op) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" filterUnits="objectBoundingBox"><feMorphology in="SourceAlpha" operator="erode" radius="${r}" result="er"/><feComposite in="SourceAlpha" in2="er" operator="out" result="ring"/><feGaussianBlur in="ring" stdDeviation="${r * .45}" result="rb"/><feFlood flood-color="${col}" flood-opacity="${op}"/><feComposite in2="rb" operator="in" result="rim"/><feComposite in="rim" in2="SourceAlpha" operator="in" result="rim2"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="rim2"/></feMerge></filter>`;
  return `<defs>${f('fres', tok.rim, 7, tok.rimOp)}${f('fresA', tok.accent, 4, .6)}</defs>`;
}
export function clayFigure(G, part) {
  const { J } = G; const s = [];
  const Pg = p => `<polygon class="clay" points="${p}"/>`;
  if (part === 'farLeg') { s.push(Pg(seg(J.hip, J.kneeR, t => 1.1 * lerp(84, 51, t) + 12 * bumpf(t, .3, .2))), Pg(seg(J.kneeR, J.ankleR, t => 1.1 * lerp(45, 27, t) + 8 * bumpf(t, .3, .14)))); const sd = Math.atan2(J.ankleR.y - J.kneeR.y, J.ankleR.x - J.kneeR.x); const cc = v(lerp(J.kneeR.x, J.ankleR.x, .28) - 26, lerp(J.kneeR.y, J.ankleR.y, .28)); s.push(Pg(ellP(cc, 96, 48, sd))); }
  if (part === 'farArm') s.push(Pg(seg(J.shoulder, J.elbow, t => 1.1 * lerp(46, 35, t) + 9 * bumpf(t, .45, .2))), Pg(seg(J.elbow, J.wrist, t => 1.1 * lerp(41, 23, t) + 7 * bumpf(t, .18, .14))));
  if (part === 'body') {
    const ax = Math.atan2(J.shoulder.y - J.hip.y, J.shoulder.x - J.hip.x);
    s.push(Pg(seg(v(J.hip.x - Math.cos(ax) * 10, J.hip.y - Math.sin(ax) * 10), v(J.shoulder.x - Math.cos(ax) * 18, J.shoulder.y - Math.sin(ax) * 18), t => 1.08 * (98 - 18 * bumpf(t, .36, .13) + 18 * bumpf(t, .78, .16)) * lerp(.9, 1.02, Math.min(1, Math.max(0, (t - .3) / .55))))));
    s.push(Pg(ellP(v(J.hip.x - 16, J.hip.y - 4), 80, 78)), Pg(ellP(v(J.hip.x - 52, J.hip.y - 20), 68, 62, ax * .3)));
    s.push(Pg(seg(v(J.neckBase.x - 20, J.neckBase.y - 6), J.shoulder, t => 1.1 * lerp(50, 42, t))));
    s.push(Pg(seg(v(J.shoulder.x - 12, J.shoulder.y - 22), v(J.head.x - 26, J.head.y - 44), t => 1.1 * lerp(58, 52, t))));
    const ua = Math.atan2(J.elbow.y - J.shoulder.y, J.elbow.x - J.shoulder.x);
    s.push(Pg(ellP(v(J.shoulder.x + Math.cos(ua) * 26, J.shoulder.y + Math.sin(ua) * 26), 70, 58, ua)));
    s.push(Pg(seg(J.shoulder, J.elbow, t => 1.1 * lerp(46, 35, t) + 9 * bumpf(t, .45, .2))), Pg(seg(J.elbow, J.wrist, t => 1.1 * lerp(41, 23, t) + 7 * bumpf(t, .18, .14))));
  }
  if (part === 'nearLeg') { s.push(Pg(seg(J.hip, J.knee, t => 1.1 * lerp(84, 51, t) + 12 * bumpf(t, .3, .2))), Pg(seg(J.knee, J.ankle, t => 1.1 * lerp(45, 27, t) + 8 * bumpf(t, .3, .14)))); const sd = Math.atan2(J.ankle.y - J.knee.y, J.ankle.x - J.knee.x); const cc = v(lerp(J.knee.x, J.ankle.x, .28) - 26, lerp(J.knee.y, J.ankle.y, .28)); s.push(Pg(ellP(cc, 96, 48, sd))); }
  return s.join('');
}
export function clayHead(G) {
  const { J } = G; const na = Math.atan2(J.head.y - J.neckBase.y, J.head.x - J.neckBase.x), gz = na - 78 * Math.PI / 180;
  const R = (x, y) => [J.head.x + x * Math.cos(gz) - y * Math.sin(gz), J.head.y + x * Math.sin(gz) + y * Math.cos(gz)];
  const prof = []; for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; const [X, Y] = headDeform(Math.cos(a), Math.sin(a), 0); prof.push(R(X, Y)); }
  let s = `<g filter="url(#fres)"><polygon class="clay" points="${pts(prof)}"/></g>`;
  const { sect, ventMask, x0, x1 } = HELMET, top = [], rim = [];
  for (let i = 0; i <= 120; i++) { const x = x0 + (x1 - x0) * i / 120, a = sect(x, 0), b = sect(x, 1); top.push(R(a.x, a.y)); rim.push(R(b.x, b.y)); }
  s += `<polygon class="helmet" points="${pts([...top, ...rim.slice().reverse()])}"/><polyline class="liner" points="${pts(rim)}"/>`;
  // visible side vents: sample the near half (v∈[.35,1]); draw dark where the vent mask is on
  let vd = ''; const NS = 90, NV = 30;
  for (let i = 0; i < NS; i++) for (let j = 0; j < NV; j++) { const s0 = i / NS, v = .3 + .7 * j / NV, m = ventMask(s0 + .5 / NS, v + .35 / NV); if (m < .5) continue;
    const q = (ss, vv) => { const p = sect(x0 + (x1 - x0) * ss, vv); return R(p.x, p.y); };
    vd += `<polygon class="ventf" points="${pts([q(s0, v), q(s0 + 1 / NS, v), q(s0 + 1 / NS, v + .7 / NV), q(s0, v + .7 / NV)])}"/>`; }
  return s;
}
