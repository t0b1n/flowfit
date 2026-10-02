import { PEDAL_BODY } from "../design/foot";
import React from "react";
import { CHAINRING, RIM, SEATSTAY_DROP, TUBE_PROFILE } from "../design/bikeProfiles";
import { lerp, bump } from "../design/riderBody";
import type { BikeSketch } from "../types";
import { SaddleShape } from "../components/SaddleShape";
import { add, gear, norm, seg, sub, tube, v, type V } from "./draw2d";

const P = (x: number, y: number) => `${x.toFixed(1)} ${(-y).toFixed(1)}`;
const poly = (cls: string, points: string, key?: React.Key) => <polygon key={key} className={cls} points={points} />;

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
    <g>
      <circle className="s2d-tyre" cx={c.x} cy={-c.y} r={R - RIM.tyre2D / 2} />
      <circle className="s2d-rim" cx={c.x} cy={-c.y} r={R - RIM.tyre2D - RIM.band2D / 2} />
      {spokes}
      <circle className="s2d-hub" cx={c.x} cy={-c.y} r={20} />
    </g>
  );
};

/** Far-side drivetrain parts: chainrings, cassette, chain, rear derailleur, far crank. */
export const DrivetrainFar: React.FC<{ bike: BikeSketch; farSpindle: V | null }> = ({ bike, farSpindle }) => {
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
    <g>
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
      {farSpindle && (
        <>
          {poly("s2d-carbon", tube(bb, farSpindle, 14, 10))}
          <rect className="s2d-carbon" x={farSpindle.x - PEDAL_BODY[0] / 2} y={-farSpindle.y - PEDAL_BODY[1] / 2} width={PEDAL_BODY[0]} height={PEDAL_BODY[1]} />
        </>
      )}
    </g>
  );
};

/** Frame: filled tapered tubes, curved fork, BB fillet, seatpost, bottle, stem and bars. */
export const FrameDrawing: React.FC<{ bike: BikeSketch }> = ({ bike }) => {
  const { bb, rearAxle, frontAxle, seatCluster: cl, seatTubeTop, headTubeTop: ht, headTubeBottom: hb } = bike;
  const stUp = norm(sub(cl, bb));
  const htDown = norm(sub(hb, ht));
  const T = TUBE_PROFILE;
  const stayTop = add(cl, stUp, -SEATSTAY_DROP);
  const perp = v(stUp.y, -stUp.x);
  const b0 = add(add(bb, sub(cl, bb), 0.22), perp, 60);
  const b1 = add(add(bb, sub(cl, bb), 0.66), perp, 60);
  return (
    <g>
      {poly("s2d-frame", tube(bb, rearAxle, ...T.chainstay))}
      {poly("s2d-frame", tube(stayTop, rearAxle, ...T.seatstay))}
      {poly("s2d-frame", tube(bb, cl, ...T.seat_tube))}
      {poly("s2d-frame", tube(cl, seatTubeTop, T.seat_tube[1], T.seat_tube[1]))}
      {poly("s2d-frame", tube(cl, add(ht, htDown, 22), ...T.top_tube))}
      {poly("s2d-frame", tube(bb, add(hb, htDown, -24), ...T.down_tube))}
      {poly("s2d-frame", tube(add(hb, htDown, 16), add(ht, htDown, -4), ...T.head_tube))}
      <path
        className="s2d-fork"
        d={`M${P(hb.x + htDown.x * 10, hb.y + htDown.y * 10)} Q ${P(hb.x + htDown.x * 190 + 4, hb.y + htDown.y * 190)} ${P(frontAxle.x, frontAxle.y)}`}
        strokeWidth={T.fork_blade[0] * 2}
      />
      <circle className="s2d-frame" cx={bb.x} cy={-bb.y} r={30} />
      <circle className="s2d-frame" cx={cl.x} cy={-cl.y} r={18} />
      {poly("s2d-bottle", tube(b0, b1, 37, 34))}
      <line className="s2d-cage" x1={b0.x} y1={-b0.y} x2={b1.x} y2={-b1.y} />
      {poly("s2d-carbon", tube(seatTubeTop, bike.seatpostBend, T.seatpost[0], T.seatpost[1]))}
      {poly("s2d-carbon", tube(bike.seatpostBend, bike.seatpostTop, T.seatpost[0], T.seatpost[1]))}
      {poly("s2d-carbon", tube(ht, bike.steererTop, 17, 17))}
      {poly("s2d-carbon", tube(bike.steererTop, bike.stemPivot, 21, 21))}
      {poly("s2d-carbon", tube(bike.stemPivot, bike.barClamp, 19, 16))}
      <SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className="s2d-saddle" />
    </g>
  );
};

/** Near-side hardware: rotors, calipers, near crank and pedal. */
export const NearHardware: React.FC<{ bike: BikeSketch; cleatCrankEnd: V }> = ({ bike, cleatCrankEnd }) => {
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
    <g>
      {rotor(rear, 70)}
      {rotor(front, 80)}
      <rect className="s2d-caliper" x={front.x - 88} y={-front.y - 70} width={60} height={26} transform={`rotate(52 ${front.x - 58} ${-front.y - 57})`} />
      <rect className="s2d-caliper" x={rear.x + 30} y={-rear.y - 54} width={60} height={26} transform={`rotate(-30 ${rear.x + 60} ${-rear.y - 41})`} />
      <path
        className="s2d-hose"
        d={`M${P(front.x - 40, front.y + 78)} Q ${P(hb.x + 30, hb.y - 150)} ${P(hb.x + htDown.x * 60 + 26, hb.y + htDown.y * 60)}`}
      />
      {poly("s2d-carbon", tube(bb, cleatCrankEnd, 15, 10))}
      <circle className="s2d-carbon" cx={bb.x} cy={-bb.y} r={22} />
      <rect className="s2d-carbon" x={cleatCrankEnd.x - PEDAL_BODY[0] / 2} y={-cleatCrankEnd.y - PEDAL_BODY[1] / 2} width={PEDAL_BODY[0]} height={PEDAL_BODY[1]} />
    </g>
  );
};

/** Drop bar, STI hood and lever. The near-side glove is drawn after this. */
export const CockpitDrawing: React.FC<{ bike: BikeSketch }> = ({ bike }) => {
  const hood = bike.hoods;
  const clp = bike.barClamp;
  return (
    <g>
      <path
        className="s2d-bar"
        d={`M${P(clp.x, clp.y)} C ${P(clp.x + 60, clp.y)} ${P(hood.x + 6, hood.y - 20)} ${P(hood.x + 8, hood.y - 60)} S ${P(clp.x + 44, clp.y - 126)} ${P(clp.x - 4, clp.y - 126)}`}
      />
      {poly("s2d-hood", seg(v(hood.x - 26, hood.y - 26), v(hood.x + 46, hood.y + 14), (t) => 16 + 10 * bump(t, 0.7, 0.2) + 4 * bump(t, 0.95, 0.08)))}
      <path
        className="s2d-lever"
        d={`M${P(hood.x + 44, hood.y + 4)} C ${P(hood.x + 58, hood.y - 40)} ${P(hood.x + 46, hood.y - 100)} ${P(hood.x + 20, hood.y - 130)}`}
      />
    </g>
  );
};
