import React from "react";
import { Link } from "react-router-dom";

import { SpecTable } from "./design/SpecTable";
import { PEDAL_BODY, SOLE_ABOVE_SPINDLE } from "./design/foot";
import { DEFAULT_BODY, DEFAULT_COMPONENTS, DEFAULT_RIDER_FIT, DEFAULT_TYRE_SIZE } from "./geometry";
import { SADDLE_CONTACT_U, SWORKS_POWER, contactHeight, noseTipOffset, type Pt } from "./saddleModels";

const T = SWORKS_POWER;
const FROM_NOSE = SADDLE_CONTACT_U * T.length; // contact station, mm behind the nose tip
const STACK = contactHeight(T, SADDLE_CONTACT_U);
const [NOSE_DX, NOSE_DY] = noseTipOffset(T, SADDLE_CONTACT_U);
const HIP_OFFSET = DEFAULT_BODY.hipJointOffset!;
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

const outline = (pts: Pt[], at: (p: Pt) => Pt) =>
  pts.map((p, i) => { const [x, y] = at(p); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ") + "Z";

/** Saddle side view with the three numbers the user has to supply for a non-default saddle. */
const SaddleDiagram: React.FC = () => {
  const S = 2.4, ox = 330, oy = 150; // mm → px, local x=0 / rail centreline y=0 on screen
  const at = ([x, y]: Pt): Pt => [ox + x * S, oy - y * S];
  const [cx] = at([-(FROM_NOSE - T.length / 2), 0]);
  const cy = oy - STACK * S;
  const noseX = at([T.length / 2, 0])[0];
  return (
    <svg className="guide-fig" viewBox="0 0 660 240" role="img" aria-label="Saddle side view: nose tip, contact point, rails and stack">
      <path d={outline(T.rail, at)} className="guide-fill-rail" />
      <path d={outline(T.shell, at)} className="guide-fill-body" />
      <line x1={cx} y1={cy} x2={cx} y2={oy + 36} className="guide-dim" strokeDasharray="3 3" />
      <circle cx={cx} cy={cy} r={5} className="guide-pt" />
      <text x={cx} y={cy - 12} textAnchor="middle" className="guide-lbl">① contact point</text>
      <line x1={noseX} y1={oy + 36} x2={cx} y2={oy + 36} className="guide-dim" />
      <text x={(noseX + cx) / 2} y={oy + 52} textAnchor="middle" className="guide-lbl">② {r1(FROM_NOSE)} mm back from nose tip</text>
      <line x1={noseX} y1={oy + 28} x2={noseX} y2={oy + 44} className="guide-dim" />
      <line x1={cx + 70} y1={oy} x2={cx + 70} y2={cy} className="guide-dim" />
      <text x={cx + 78} y={(oy + cy) / 2 + 4} className="guide-lbl">③ stack {r1(STACK)} mm</text>
      <line x1={cx - 60} y1={oy} x2={cx + 90} y2={oy} className="guide-dim" strokeDasharray="2 3" />
      <text x={at([-118, 0])[0]} y={oy + 14} className="guide-lbl guide-muted">rail centreline</text>
    </svg>
  );
};

/** BB-centred schematic of the two setback references and the leg's hip joint. */
const SetbackDiagram: React.FC = () => {
  const ox = 520, oy = 150;
  const contactX = ox - 300, nose = ox - 130;
  return (
    <svg className="guide-fig" viewBox="0 0 660 190" role="img" aria-label="Setback to contact point and to nose tip">
      <circle cx={ox} cy={oy} r={7} className="guide-pt" />
      <text x={ox + 12} y={oy + 16} className="guide-lbl">BB</text>
      <line x1={ox} y1={26} x2={ox} y2={oy} className="guide-dim" strokeDasharray="3 3" />
      <rect x={contactX - 100} y={40} width={230} height={14} rx={7} className="guide-fill-body" />
      <circle cx={contactX} cy={40} r={5} className="guide-pt" />
      <circle cx={nose} cy={44} r={5} className="guide-pt guide-pt--alt" />
      <line x1={contactX} y1={26} x2={ox} y2={26} className="guide-dim" />
      <text x={contactX + 6} y={20} className="guide-lbl">setback to contact point (fit target)</text>
      <line x1={nose} y1={110} x2={ox} y2={110} className="guide-dim" />
      <text x={(nose + ox) / 2} y={126} textAnchor="middle" className="guide-lbl">setback to nose tip (what you measure)</text>
      <text x={contactX} y={74} textAnchor="middle" className="guide-lbl guide-muted">contact</text>
      <text x={nose} y={74} textAnchor="middle" className="guide-lbl guide-muted">nose tip</text>
    </svg>
  );
};

/** Hip joint above the sit bones, and the inseam it is measured against. */
const LegDiagram: React.FC = () => (
  <svg className="guide-fig guide-fig--mid" viewBox="0 0 440 220" role="img" aria-label="Inseam and hip joint offset">
    <rect x={90} y={150} width={120} height={12} rx={6} className="guide-fill-body" />
    <circle cx={150} cy={150} r={5} className="guide-pt" />
    <text x={160} y={146} className="guide-lbl">sit bones (contact)</text>
    <circle cx={150} cy={60} r={7} className="guide-pt guide-pt--alt" />
    <text x={162} y={64} className="guide-lbl">hip joint (femoral head)</text>
    <line x1={150} y1={66} x2={150} y2={146} className="guide-dim" />
    <text x={134} y={108} textAnchor="end" className="guide-lbl">{HIP_OFFSET} mm</text>
    <line x1={250} y1={150} x2={250} y2={206} className="guide-dim" />
    <line x1={20} y1={206} x2={280} y2={206} className="guide-dim guide-muted" />
    <text x={244} y={184} textAnchor="end" className="guide-lbl">inseam</text>
    <text x={20} y={198} className="guide-lbl guide-muted">floor</text>
  </svg>
);

const c = DEFAULT_COMPONENTS;

export const GuidePage: React.FC = () => (
  <article className="guide-page">
    <header>
      <div className="ff-eyebrow">Read first</div>
      <h1>Getting an accurate fit</h1>
      <p className="guide-lead">
        FlowFit works from contact points, so the result is only as good as the contact points you give it. These are the
        four places where our defaults decide the answer, and what to do when yours differ.
      </p>
    </header>

    <section>
      <h2>1 · Your saddle: measure it to the contact point</h2>
      <p>
        The default saddle is a Specialized S-Works Power 143, traced from photos. We place <b>the rider's sit bones at
        one fixed point on it</b> — {r1(FROM_NOSE)} mm back from the nose tip (68% of its {T.length} mm length). If your saddle is
        a different shape, setback and saddle height will be off by the difference.
      </p>
      <SaddleDiagram />
      <ol className="guide-steps">
        <li><b>Find your contact point</b> — where your sit bones sit on the saddle (the pressure-map peak, or the widest point you ride on).</li>
        <li><b>Measure it from the nose tip</b>, along the saddle. Default: {r1(FROM_NOSE)} mm.</li>
        <li><b>Measure saddle stack</b> — rail centreline up to the top surface at that point. Default: {r1(STACK)} mm.</li>
      </ol>
      <p className="guide-note">
        Saddle stack is a slider (1 mm steps). The contact-point position along the saddle is fixed for now, so with a
        different saddle shift it with <b>Rail offset</b>: 0 = clamp directly under the contact point; positive moves the saddle forward
        on its rails.
      </p>
    </section>

    <section>
      <h2>2 · Setback: which number are you reading?</h2>
      <p>
        Fitters measure setback from the BB to the saddle <b>nose tip</b>, because it is easy to reach with a plumb line.
        FlowFit's fit works to the <b>contact point</b>. Both are shown: <b>Setback</b> and <b>Nose SB</b>.
        On the default saddle the nose tip reads {r1(NOSE_DX)} mm further forward than the contact point (and {r1(-NOSE_DY)} mm lower).
      </p>
      <SetbackDiagram />
      <p className="guide-note">
        Compare your real bike to <b>Nose SB</b>. If your saddle isn't a Power, the two will not differ by the same amount.
      </p>
    </section>

    <section>
      <h2>3 · Your body: measure what you can</h2>
      <p>
        <b>Height</b> and <b>inseam</b> drive saddle height and leg length. Open <b>Advanced → Body dimensions</b> and
        enter tape-measured shoulder width, torso, upper arm, forearm, shoe size and hip offset. Torso length is the
        only one not preset: it scales with height (600 mm at 1800 mm height), so check it. The preset
        arm, shoulder and foot values are averages, not your numbers, and reach to the hoods depends on them.
      </p>
      <LegDiagram />
      <p className="guide-note">
        Inseam is measured to the sit bones' height (book-between-the-legs method), floor to book. The hip joint sits
        {" "}<b>{HIP_OFFSET} mm</b> above the saddle contact by default (adjustable as "Saddle–hip joint offset"); it changes
        the leg length the saddle height is solved for.
      </p>
    </section>

    <section>
      <h2>4 · Shoes, pedals and hoods</h2>
      <ul className="guide-list">
        <li><b>Foot:</b> the shoe is a traced S-Works Torch sized to the shoe size you set (290 mm default). The solver puts the ball of the foot over the cleat, {c.cleat_setback} mm setback by default.</li>
        <li><b>Pedal stack:</b> {c.pedal_stack_height} mm from spindle to the sole; {SOLE_ABOVE_SPINDLE} mm sole plus cleat above the spindle axis, {PEDAL_BODY[1]} mm pedal body thickness.</li>
        <li><b>Hands:</b> the contact point is on the hood, {c.hood_reach_offset} mm from the bar centre (Shimano Dura-Ace preset), {c.hood_drop_offset} mm drop. Change the hood preset if you ride SRAM.</li>
        <li><b>Stem:</b> angle is the maker's rating (−6° on a 73° head tube sits 11° above level). Spacers and clamp stack along the steerer, not vertically.</li>
      </ul>
    </section>

    <section>
      <h2>Defaults we have hard-coded</h2>
      <SpecTable
        sections={[
          { title: "Saddle (S-Works Power 143)", rows: [
            { label: "Length × width", value: `${T.length} × ${T.width}`, unit: "mm" },
            { label: "Contact point from nose", value: r1(FROM_NOSE), unit: "mm" },
            { label: "Saddle stack at contact", value: r1(STACK), unit: "mm" },
            { label: "Rail offset", value: c.saddle_rail_offset, unit: "mm" },
            { label: "Seatpost offset", value: c.seatpost_offset, unit: "mm" },
          ] },
          { title: "Rider", rows: [
            { label: "Height (default)", value: DEFAULT_RIDER_FIT.height, unit: "mm" },
            { label: "Inseam (default)", value: DEFAULT_RIDER_FIT.inseam, unit: "mm" },
            { label: "Hip joint above contact", value: HIP_OFFSET, unit: "mm" },
            { label: "Shoulder width", value: DEFAULT_BODY.shoulderWidth, unit: "mm" },
            { label: "Upper arm / forearm", value: `${DEFAULT_BODY.upperArmLength} / ${DEFAULT_BODY.forearmLength}`, unit: "mm" },
            { label: "Torso (at 1800 mm height)", value: 600, unit: "mm" },
            { label: "Shoe length", value: DEFAULT_BODY.footLength, unit: "mm" },
            { label: "Target knee flexion", value: DEFAULT_RIDER_FIT.targetKneeFlexDeg, unit: "°" },
            { label: "Reference height for scaling", value: 1800, unit: "mm" },
          ] },
          { title: "Drivetrain & wheels", rows: [
            { label: "Crank length", value: c.crank_length, unit: "mm" },
            { label: "Cleat setback", value: c.cleat_setback, unit: "mm" },
            { label: "Pedal stack", value: c.pedal_stack_height, unit: "mm" },
            { label: "Tyre size", value: DEFAULT_TYRE_SIZE, unit: "mm" },
            { label: "Shoe", value: "S-Works Torch" },
          ] },
          { title: "Cockpit", rows: [
            { label: "Stem length / angle", value: `${c.stem_length} / ${c.stem_angle_deg}`, unit: "mm / °" },
            { label: "Spacers / clamp height", value: `${c.spacer_stack} / ${c.stem_height}`, unit: "mm" },
            { label: "Bar reach / width", value: `${c.bar_reach} / ${c.bar_width}`, unit: "mm" },
            { label: "Hood reach offset", value: c.hood_reach_offset, unit: "mm" },
          ] },
        ]}
      />
    </section>

    <p className="guide-foot"><Link to="/">Back to the Fit Builder</Link></p>
  </article>
);
