/**
 * Cockpit2D — the 2D side and front drawings of the stem, bar and hoods, and the
 * wrist-angle marker. Shapes come only from cockpit.ts (and the traced hood
 * outlines), so the 2D views and the 3D meshes agree by construction.
 */
import React from "react";
import { BAR_RADIUS, type Cockpit } from "../cockpit";
import { wristAngleDeg } from "../geometry";
import type { Pt } from "../hoodModels";
import type { ContactPoint, MannequinSketch } from "../types";

const D2R = Math.PI / 180;
const f = (n: number) => n.toFixed(1);

/** Smooth open/closed path through points (Catmull-Rom → cubic Bézier), bike coords → SVG (y down). */
export function splinePath(pts: ContactPoint[], closed = false, tension = 1): string {
  if (pts.length < 2) return "";
  const n = pts.length;
  const P = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0].x)} ${f(-pts[0].y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k = tension / 6;
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += ` C${f(c1.x)} ${f(-c1.y)} ${f(c2.x)} ${f(-c2.y)} ${f(p2.x)} ${f(-p2.y)}`;
  }
  return d + (closed ? " Z" : "");
}

const polyPath = (pts: ContactPoint[], closed = true) =>
  "M" + pts.map((p) => `${f(p.x)} ${f(-p.y)}`).join("L") + (closed ? "Z" : "");

/** Hood-local mm → bike coords (station + pitch rotation). */
const hoodXf = (ck: Cockpit) => {
  const a = ck.pitchDeg * D2R;
  const c = Math.cos(a), s = Math.sin(a);
  return ([x, y]: Pt): ContactPoint => ({ x: ck.station.x + x * c - y * s, y: ck.station.y + x * s + y * c });
};

/** Side view: bar centreline, aero tops / clamp section, and the traced hood with its lever and pad. */
export const CockpitSide: React.FC<{ cockpit: Cockpit; ghost?: boolean }> = ({ cockpit: ck, ghost }) => {
  const T = hoodXf(ck);
  const prof = ck.hood.profile;
  const [clamp, tops] = ck.sagittal;
  // The riser section (clamp → tops) is straight; the smooth curve starts at the tops so it can't hook back below the clamp.
  // On a one-piece bar-stem the riser is part of the stem body (drawn with the stem), so the bar starts at the tops.
  const curve = splinePath(ck.sagittal.slice(1));
  const bar = ck.build === "integrated" ? curve : `M${f(clamp.x)} ${f(-clamp.y)} L${f(tops.x)} ${f(-tops.y)} ` + curve.replace(/^M/, "L");
  if (ghost) {
    return (
      <g className="s2d-cockpit-ghost">
        <path d={bar} />
        <path d={polyPath(prof.body.map(T))} />
        <path d={polyPath(prof.lever.map(T))} />
      </g>
    );
  }
  const pad = <path className="s2d-pad" data-fill data-part="lever" d={polyPath(prof.pad.map(T))} />;
  return (
    <g>
      <path className="s2d-bar" data-part="bar" d={bar} />
      {ck.build === "integrated" ? (
        <ellipse className="s2d-carbon" data-part="bar" cx={tops.x + 4} cy={-tops.y} rx={22} ry={9.5} />
      ) : (
        <circle className="s2d-carbon" data-part="bar" data-fill cx={clamp.x} cy={-clamp.y} r={15.9} />
      )}
      {!ck.hood.padOnLever && pad}
      <path className="s2d-lever-body" data-fill data-part="lever" d={polyPath(prof.lever.map(T))} />
      {ck.hood.padOnLever && pad}
      <path className="s2d-hood-body" data-fill data-part="hood" d={polyPath(prof.body.map(T))} />
      {prof.details.map((ln, i) => (
        <path key={i} className="s2d-hood-detail" d={polyPath(ln.map(T), false)} />
      ))}
      {prof.bolts.map(([x, y, r], i) => {
        const c = T([x, y]);
        return <circle key={i} className="s2d-hood-bolt" cx={c.x} cy={-c.y} r={r} />;
      })}
    </g>
  );
};

/**
 * Front view (looking back at the bike): clamp section or fused bar-stem, riser S-bend,
 * tops, flared drops, and the hoods leaning in by the hood rotation.
 */
export const CockpitFront: React.FC<{ cockpit: Cockpit; ghost?: boolean; showUci?: boolean }> = ({ cockpit: ck, ghost, showUci }) => {
  const [clamp, tops, , , , , dropBottom] = ck.sagittal;
  const cy = clamp.y;
  const ty = tops.y;
  const hx = ck.hoodWidth / 2;
  const dx = ck.dropWidth / 2;
  const by = dropBottom.y;
  const side = (s: 1 | -1): ContactPoint[] => [
    { x: 0, y: cy },
    { x: s * 22, y: cy },
    { x: s * 44, y: (cy + ty) / 2 },
    { x: s * 66, y: ty },
    { x: s * (hx - 24), y: ty },
    { x: s * hx, y: ty - 24 },
    { x: s * (hx + (dx - hx) * 0.55), y: ty - (ty - by) * 0.62 },
    { x: s * dx, y: by },
  ];
  const hoodShape = (s: 1 | -1): ContactPoint[] => {
    const w = ck.hood.thickness / 2;
    const h = ck.hood.peak;
    const base: Pt[] = [[-w, -8], [-w + 1, h * 0.55], [-w * 0.55, h * 0.93], [0, h], [w * 0.55, h * 0.93], [w - 1, h * 0.55], [w, -8]];
    const a = s * ck.hoodRollDeg * D2R; // + side leans its top toward −x (the centreline)
    return base.map(([x, y]) => ({ x: s * hx + x * Math.cos(a) - y * Math.sin(a), y: ty + x * Math.sin(a) + y * Math.cos(a) }));
  };
  const lever = (s: 1 | -1): ContactPoint[] => {
    const a = s * ck.hoodRollDeg * D2R;
    return ([[0, -4], [s * 3, -55], [s * 6, -110]] as Pt[]).map(([x, y]) => ({ x: s * hx + x * Math.cos(a) - y * Math.sin(a), y: ty + x * Math.sin(a) + y * Math.cos(a) }));
  };
  const bars = splinePath(side(1)) + " " + splinePath(side(-1));
  if (ghost) {
    return (
      <g className="s2d-cockpit-ghost">
        <path d={bars} />
        <path d={splinePath(hoodShape(1), true)} />
        <path d={splinePath(hoodShape(-1), true)} />
      </g>
    );
  }
  // fused one-piece centre: the stem body flares into the riser bend
  const fused = (() => {
    const r = ty - cy;
    const half: Pt[] = [[0, -22], [20, -22], [23, 2], [46, r - 7], [86, r - 12], [94, r], [86, r + 12], [46, r + 13], [18, Math.max(r, 8) + 16]];
    const all = half.concat(half.slice(1).reverse().map(([x, y]) => [-x, y] as Pt));
    return all.map(([x, y]) => ({ x, y: cy + y }));
  })();
  const u = ck.uci;
  return (
    <g>
      {([1, -1] as const).map((s) => (
        <path key={`l${s}`} className="s2d-lever-front" data-part="lever" d={splinePath(lever(s))} />
      ))}
      <path className="s2d-bar" data-part="bar" d={bars} />
      {ck.build === "integrated" ? (
        <path className="s2d-carbon" data-fill data-part="stem" d={splinePath(fused, true)} />
      ) : (
        <g data-part="stem">
          <rect className="s2d-carbon s2d-faceplate" x={-26} y={-(cy + 17)} width={52} height={34} rx={4} />
          {[[-17, 9], [17, 9], [-17, -9], [17, -9]].map(([bx, byy], i) => (
            <circle key={i} className="s2d-hood-bolt" cx={bx} cy={-(cy + byy)} r={3} />
          ))}
        </g>
      )}
      {([1, -1] as const).map((s) => (
        <path key={`h${s}`} className="s2d-hood-body" data-fill data-part="hood" d={splinePath(hoodShape(s), true)} />
      ))}
      {showUci && (
        <g className="s2d-uci">
          <line x1={-u.innerHoods / 2} x2={u.innerHoods / 2} y1={-(ty + ck.hood.peak + 26)} y2={-(ty + ck.hood.peak + 26)} />
          <text x={0} y={-(ty + ck.hood.peak + 36)} textAnchor="middle" className={u.ok.innerHoods ? "" : "s2d-uci--out"}>
            {Math.round(u.innerHoods)} BETWEEN HOODS
          </text>
          <line x1={-u.outsideWidth / 2} x2={u.outsideWidth / 2} y1={-(by - 34)} y2={-(by - 34)} />
          <text x={0} y={-(by - 62)} textAnchor="middle" className={u.ok.outsideWidth ? "" : "s2d-uci--out"}>
            {Math.round(u.outsideWidth)} OUTSIDE
          </text>
        </g>
      )}
      {/* bar centreline reference for the clamp diameter */}
      <circle className="s2d-hood-bolt" cx={0} cy={-cy} r={BAR_RADIUS * 0.25} />
    </g>
  );
};

/** Wrist angle marker on the near arm: forearm continuation, arc, and the angle in degrees. */
export const WristMarker: React.FC<{ mannequin: MannequinSketch; hoodRollDeg?: number }> = ({ mannequin: m, hoodRollDeg = 0 }) => {
  const w = m.wrist;
  const fa = Math.atan2(w.y - m.elbow.y, w.x - m.elbow.x);
  const ha = Math.atan2(m.hands.y - w.y, m.hands.x - w.x);
  const deg = wristAngleDeg(m);
  const r = 46;
  const P = (a: number, rr = r) => ({ x: w.x + Math.cos(a) * rr, y: w.y + Math.sin(a) * rr });
  const a0 = P(fa), a1 = P(ha);
  const sweep = deg > 0 ? 0 : 1; // SVG y is flipped
  const ext = P(fa, 80);
  // label up and behind the wrist, clear of the hood
  const label = { x: w.x - 70, y: w.y + 95 };
  return (
    <g className="s2d-wrist">
      <line className="s2d-wrist__ray" x1={w.x} y1={-w.y} x2={ext.x} y2={-ext.y} />
      <path className="s2d-wrist__arc" d={`M${f(a0.x)} ${f(-a0.y)} A${r} ${r} 0 0 ${sweep} ${f(a1.x)} ${f(-a1.y)}`} />
      <circle className="s2d-wrist__joint" cx={w.x} cy={-w.y} r={6} />
      <text className="geometry-label s2d-wrist__label" x={label.x} y={-label.y} textAnchor="middle">
        WRIST {Math.abs(Math.round(deg))}° {deg >= 0 ? "EXT" : "FLEX"}
      </text>
      {hoodRollDeg > 0 && (
        <text className="geometry-label s2d-wrist__sub" x={label.x} y={-label.y + 28} textAnchor="middle">
          PRONATION −{Math.round(hoodRollDeg)}°
        </text>
      )}
    </g>
  );
};
