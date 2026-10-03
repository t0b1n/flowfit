import { PEDAL_BODY } from "../design/foot";
import React from "react";
import { CHAINRING, HUB, RIM, SEATSTAY_DROP, STEM, TUBE_PROFILE } from "../design/bikeProfiles";
import { lerp } from "../design/riderBody";
import type { BikeSketch } from "../types";
import type { Cockpit } from "../cockpit";
import { CockpitSide } from "./Cockpit2D";
import { SaddleShape } from "../components/SaddleShape";
import { add, ellipse, gear, hullOf, norm, pts, seg, slab, sub, tube, v, type V } from "./draw2d";
import { FORK, forkOutline } from "../design/fork";

const P = (x: number, y: number) => `${x.toFixed(1)} ${(-y).toFixed(1)}`;
const poly = (cls: string, points: string, part?: string) => <polygon className={cls} points={points} data-part={part} />;

/** Wheel: 28 mm tyre, 44 mm carbon rim band, 2.2 mm spokes, hub. Near-side rotor + caliper are drawn separately. */
export const Wheel: React.FC<{ axle: V; radius: number }> = ({ axle: c, radius: R }) => {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return (
      <line
        key={i}
        className="s2d-spoke"
        x1={c.x}
        y1={-c.y}
        x2={c.x + Math.cos(a) * (R - 72)}
        y2={-c.y - Math.sin(a) * (R - 72)}
      />
    );
  });
  return (
    <g data-part="wheel">
      <circle className="s2d-tyre" cx={c.x} cy={-c.y} r={R - RIM.tyre2D / 2} />
      <circle className="s2d-rim" cx={c.x} cy={-c.y} r={R - RIM.tyre2D - RIM.band2D / 2} />
      {spokes}
      <circle className="s2d-hub" cx={c.x} cy={-c.y} r={20} />
    </g>
  );
};

/**
 * Drive-side parts (the rider's right, the side facing the viewer when the bike points right): chainrings,
 * cassette, chain, rear derailleur. Drawn in front of the frame, behind the near crank and leg.
 */
export const DriveSide: React.FC<{ bike: BikeSketch }> = ({ bike }) => {
  const bb = bike.bb;
  const rear = bike.rearAxle;
  const up = v(rear.x + 8, rear.y - 58);
  const lo = v(rear.x + 28, rear.y - 118);
  const { big, small, cassette } = CHAINRING;
  const cogs = Array.from({ length: cassette.rings }, (_, i) => lerp(cassette.outerRadius, cassette.innerRadius, i / (cassette.rings - 1)));
  const chain = [
    [bb.x, bb.y - big.root],
    [lo.x - 12, lo.y - 17],
    [lo.x + 17, lo.y],
    [up.x + 17, up.y],
    [up.x - 12, up.y + 17],
    [rear.x, rear.y - 40],
  ] as const;
  return (
    <g data-part="drivetrain">
      <polygon className="s2d-ring" points={gear(bb, big.teeth, big.outer, big.root)} />
      <polygon className="s2d-ring" points={gear(bb, small.teeth, small.outer, small.root)} />
      {cogs.map((r, i) => (
        <circle key={i} className="s2d-cog" cx={rear.x} cy={-rear.y} r={r} />
      ))}
      <line className="s2d-chain" x1={bb.x} y1={-(bb.y + big.root)} x2={rear.x} y2={-(rear.y + 40)} />
      <polyline className="s2d-chain" points={chain.map(([x, y]) => `${x},${-y}`).join(" ")} />
      {poly("s2d-carbon", tube(v(rear.x - 6, rear.y - 8), v(rear.x - 22, rear.y - 36), 13, 12))}
      {poly("s2d-carbon", tube(v(rear.x - 22, rear.y - 36), up, 12, 12))}
      {poly("s2d-carbon", tube(up, lo, 10, 10))}
      <circle className="s2d-pulley" cx={up.x} cy={-up.y} r={17} />
      <circle className="s2d-pulley" cx={lo.x} cy={-lo.y} r={17} />
    </g>
  );
};

/** Far (left, non-drive) crank and pedal, hidden behind the frame. */
export const FarCrank: React.FC<{ bike: BikeSketch; farSpindle: V | null }> = ({ bike, farSpindle }) =>
  farSpindle ? (
    <g data-part="crank">
      {poly("s2d-carbon", tube(bike.bb, farSpindle, 14, 10))}
      <rect data-part="pedal" className="s2d-carbon" x={farSpindle.x - PEDAL_BODY[0] / 2} y={-farSpindle.y - PEDAL_BODY[1] / 2} width={PEDAL_BODY[0]} height={PEDAL_BODY[1]} />
    </g>
  ) : null;

/** Frame: filled tapered tubes, ENVE-style fork, BB fillet, seatpost, bottle, stem and bars. */
export const FrameDrawing: React.FC<{ bike: BikeSketch; cockpit?: Cockpit }> = ({ bike, cockpit }) => {
  const { bb, rearAxle, frontAxle, seatCluster: cl, seatTubeTop, headTubeTop: ht, headTubeBottom: hb } = bike;
  const stUp = norm(sub(cl, bb));
  const htDown = norm(sub(hb, ht));
  const T = TUBE_PROFILE;
  // Spacers and the stem's steerer clamp stack along the head-tube axis (synthesizeBike puts steererTop and
  // stemPivot on it). Both are flat-ended so their drawn length is exactly spacer_stack and stem_height.
  const clampTop = add(bike.stemPivot, sub(bike.stemPivot, bike.steererTop));
  const stayTop = add(cl, stUp, -SEATSTAY_DROP);
  const perp = v(stUp.y, -stUp.x);
  const b0 = add(add(bb, sub(cl, bb), 0.22), perp, 60);
  const b1 = add(add(bb, sub(cl, bb), 0.66), perp, 60);
  return (
    <g>
      {poly("s2d-frame", tube(bb, rearAxle, ...T.chainstay), "chainstay")}
      {poly("s2d-frame", tube(stayTop, rearAxle, ...T.seatstay), "seatstay")}
      {poly("s2d-frame", tube(bb, cl, ...T.seat_tube), "seat_tube")}
      {poly("s2d-frame", tube(cl, seatTubeTop, T.seat_tube[1], T.seat_tube[1]), "seat_tube")}
      {poly("s2d-frame", tube(cl, add(ht, htDown, 22), ...T.top_tube), "top_tube")}
      {poly("s2d-frame", tube(bb, add(hb, htDown, -24), ...T.down_tube), "down_tube")}
      {/* head tube: round at the fork crown, flat on top where the spacers / stem sit */}
      {poly("s2d-frame", hullOf(slab(add(hb, htDown, 16), ht, ...T.head_tube), ellipse(add(hb, htDown, 16), T.head_tube[0], T.head_tube[0], 0, 18)), "head_tube")}
      {/* fork (design/fork.ts): one piece, its rounded crown wrapping the head-tube bottom, tapered straight blade, round dropout tip */}
      {/* front hub, drive side (the rotor is on the far side): spoke flange in front of the far rotor, under the fork */}
      <circle className="s2d-hub" data-part="wheel" cx={frontAxle.x} cy={-frontAxle.y} r={HUB.flangeR} />
      {poly("s2d-frame", pts(forkOutline(hb, frontAxle)), "fork")}
      <circle className="s2d-hub" data-part="fork" cx={frontAxle.x} cy={-frontAxle.y} r={FORK.axleCapR} />
      <circle className="s2d-frame" cx={bb.x} cy={-bb.y} r={30} data-part="bb_shell" />
      <circle className="s2d-frame" cx={cl.x} cy={-cl.y} r={18} data-part="bb_shell" />
      {poly("s2d-bottle", tube(b0, b1, 37, 34), "bottle")}
      <line data-part="bottle" className="s2d-cage" x1={b0.x} y1={-b0.y} x2={b1.x} y2={-b1.y} />
      {poly("s2d-carbon", tube(seatTubeTop, bike.seatpostBend, T.seatpost[0], T.seatpost[1]), "seatpost")}
      {poly("s2d-carbon", tube(bike.seatpostBend, bike.seatpostTop, T.seatpost[0], T.seatpost[1]), "seatpost")}
      {/* spacer stack: the steerer between the head tube and the stem (none at 0 spacers) */}
      {bike.steererTop.y - ht.y > 0.5 && poly("s2d-carbon", slab(ht, bike.steererTop, STEM.spacerR), "spacers")}
      {/* the stem: flat steerer clamp (stem_height tall, along the steerer), tapered arm, round bar clamp */}
      <g data-part="stem">
        {poly("s2d-carbon", slab(bike.steererTop, clampTop, STEM.clampR), "stem")}
        {cockpit?.build === "integrated" ? (
          /* one-piece bar-stem: the arm runs straight into the riser and on to the aero tops */
          <>
            {poly("s2d-carbon", slab(bike.stemPivot, bike.barClamp, 15, 12), "stem")}
            {cockpit.rise > 0.5 && poly("s2d-carbon", slab(bike.barClamp, v(bike.barClamp.x + 6, bike.barClamp.y + cockpit.rise), 12, 11), "stem")}
            <circle className="s2d-carbon" data-part="stem" data-fill cx={bike.barClamp.x} cy={-bike.barClamp.y} r={12} />
          </>
        ) : (
          <>
            {poly("s2d-carbon", slab(bike.stemPivot, bike.barClamp, 14, 12), "stem")}
            <circle className="s2d-carbon" data-part="stem" data-fill cx={bike.barClamp.x} cy={-bike.barClamp.y} r={STEM.barClampR} />
          </>
        )}
      </g>
      <g data-part="saddle"><SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className="s2d-saddle" /></g>
    </g>
  );
};

/** Disc rotors, calipers and the front brake hose: the rider's left (far) side, behind the frame. */
export const DiscBrakes: React.FC<{ bike: BikeSketch }> = ({ bike }) => {
  const { rearAxle: rear, frontAxle: front, bb, headTubeBottom: hb, headTubeTop: ht } = bike;
  const htDown = norm(sub(hb, ht));
  const rotor = (c: V, r: number) => (
    <g key={`${c.x}`}>
      <circle className="s2d-rotor" cx={c.x} cy={-c.y} r={r - 8} />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <line key={i} className="s2d-rotor-spoke" x1={c.x} y1={-c.y} x2={c.x + Math.cos(a) * (r - 8)} y2={-c.y - Math.sin(a) * (r - 8)} />;
      })}
    </g>
  );
  return (
    <g data-part="brakes">
      {rotor(rear, 70)}
      {rotor(front, 80)}
      <rect className="s2d-caliper" x={front.x - 88} y={-front.y - 70} width={60} height={26} transform={`rotate(52 ${front.x - 58} ${-front.y - 57})`} />
      <rect className="s2d-caliper" x={rear.x + 30} y={-rear.y - 54} width={60} height={26} transform={`rotate(-30 ${rear.x + 60} ${-rear.y - 41})`} />
      <path
        className="s2d-hose"
        d={`M${P(front.x - 40, front.y + 78)} Q ${P(hb.x + 30, hb.y - 150)} ${P(hb.x + htDown.x * 60 + 26, hb.y + htDown.y * 60)}`}
      />
    </g>
  );
};

/** Near (drive-side) crank and pedal, outboard of the chainrings. */
export const NearCrank: React.FC<{ bike: BikeSketch; cleatCrankEnd: V }> = ({ bike, cleatCrankEnd }) => (
  <g data-part="crank">
    {poly("s2d-carbon", tube(bike.bb, cleatCrankEnd, 15, 10))}
    <circle className="s2d-carbon" cx={bike.bb.x} cy={-bike.bb.y} r={22} />
    <rect data-part="pedal" className="s2d-carbon" x={cleatCrankEnd.x - PEDAL_BODY[0] / 2} y={-cleatCrankEnd.y - PEDAL_BODY[1] / 2} width={PEDAL_BODY[0]} height={PEDAL_BODY[1]} />
  </g>
);

/** Drop bar, STI hood and lever (from the cockpit model). The near-side glove is drawn after this. */
export const CockpitDrawing: React.FC<{ cockpit: Cockpit }> = ({ cockpit }) => <CockpitSide cockpit={cockpit} />;
