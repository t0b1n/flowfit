export type ContactPoint = {
  x: number;
  y: number;
};

export type Components = {
  crank_length: number;
  cleat_setback: number;
  saddle_rail_length: number;
  saddle_clamp_offset: number;
  stem_length: number;
  /** manufacturer rating: degrees from the normal to the steerer (−6 is a typical road stem), not from horizontal */
  stem_angle_deg: number;
  /** spacer stack height, measured along the steerer */
  spacer_stack: number;
  /** height of the stem's steerer clamp along the steerer; 0 spacers puts its bottom on the head tube top (standard 40 mm) */
  stem_height: number;
  bar_reach: number;
  bar_drop: number;
  hood_reach_offset: number;
  hood_drop_offset: number;
  bar_width: number;
  hood_width: number | null;
  stance_width: number | null;
  saddle_stack: number;
  seatpost_offset: number;
  saddle_rail_offset: number;
  pedal_stack_height: number;
  // ── Cockpit (all optional: saved fits predate them; see cockpit.ts for defaults) ──
  /** vertical rise of the bar tops above the clamp centre (mm) */
  bar_rise?: number;
  /** vertical depth from the tops to the drops centreline (mm), default 125 */
  bar_drop_depth?: number;
  /** drop centre-to-centre width (mm); null = same as the hoods */
  bar_drop_width?: number | null;
  /** backsweep of the tops toward the rider (deg) */
  bar_backsweep_deg?: number;
  /** bar roll in the clamp (deg) = angle of the clamp→hood reach line; null = 0 (hoods straight ahead of the clamp) */
  bar_roll_deg?: number | null;
  /** hood position along the bend (mm, + = lower / further round) */
  hood_slide_mm?: number;
  /** inward hood rotation (deg); UCI limit 10° */
  hood_roll_deg?: number;
  /** draw option: separate stem + bar, or a one-piece bar-stem */
  cockpit_build?: "two_piece" | "integrated";
  /** hood model id (hoodModels.ts) */
  hood_model?: string;
};

export type SetupResult = {
  constraints: { status: string };
  pose_metrics: {
    trunk_angle_deg: number;
    hip_angle_deg: number;
    shoulder_flexion_deg: number;
    elbow_flexion_deg: number;
    knee_extension_deg: number;
  };
  components: Components;
  contact_points: {
    saddle: ContactPoint;
    hoods: ContactPoint;
    cleat: ContactPoint;
  };
} | null;

export type Side = "a" | "b";
export type FitMode = "contact" | "saddle_height";
export type MannequinMode = "off" | "endurance" | "race" | "fast";
export type AppMode = "builder" | "transfer";

export type BikeSelection = {
  modelId: string;
  size: string;
};

export type BikeSketch = {
  bb: ContactPoint;
  rearAxle: ContactPoint;
  frontAxle: ContactPoint;
  seatCluster: ContactPoint;
  seatTubeTop: ContactPoint;
  headTubeBottom: ContactPoint;
  headTubeTop: ContactPoint;
  saddle: ContactPoint;
  saddleClamp: ContactPoint;
  seatpostTop: ContactPoint;
  seatpostBend: ContactPoint;
  cleat: ContactPoint;
  crankEnd: ContactPoint;
  steererTop: ContactPoint;
  /** centre of the stem's steerer clamp: steererTop + stem_height / 2 along the steerer */
  stemPivot: ContactPoint;
  barClamp: ContactPoint;
  hoods: ContactPoint;
};

export type MannequinSketch = {
  hip: ContactPoint;
  knee: ContactPoint;
  ankle: ContactPoint;
  shoulder: ContactPoint;
  elbow: ContactPoint;
  wrist: ContactPoint;
  hands: ContactPoint;
  head: ContactPoint;
  neckBase: ContactPoint;
  spineJoint: ContactPoint;
  /** How far the foot stops short of the pedal at this crank position (0 = on the pedal). */
  pedalGapMm?: number;
  /** How far the hands stop short of the hoods with the arms straight (0 = on the hoods). */
  handGapMm?: number;
  /** How far the wrist lock moved the shoulder to hold the wrist limit (0 = lock off or not needed). */
  wristLockShiftMm?: number;
};

export type RiderFit = {
  height: number;
  inseam: number;
  weight: number;
  targetKneeFlexDeg: number;
};

export type HoodPreset = {
  id: string;
  label: string;
  hoodReachOffset: number;
  note: string;
};

export type FitWarning = {
  contact: "saddle" | "hoods" | "cleat";
  /** Plain-language explanation shown instead of the generic "N mm off". */
  message?: string;
  deltaX: number;
  deltaY: number;
  distance: number;
  severity: "ok" | "warning" | "bad";
};

export type IdealContacts = {
  saddle: ContactPoint;
  hoods: ContactPoint;
  cleat: ContactPoint;
};

export type ComponentDeltas = {
  saddle_clamp_offset: number;
  spacer_stack: number;
  stem_length: number;
  stem_angle_deg: number;
};

export type ReferenceMode = "frame" | "direct";

export type SeatpostType = "straight" | "setback" | "integrated-only";

export type SeatpostRecommendation = {
  bbToRailDistance: number;
  requiredSetback: number;
  type: SeatpostType;
  note: string;
};
