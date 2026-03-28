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
  stem_angle_deg: number;
  spacer_stack: number;
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
  barClamp: ContactPoint;
  hoods: ContactPoint;
};

export type MannequinSketch = {
  hip: ContactPoint;
  knee: ContactPoint;
  ankle: ContactPoint;
  shoulder: ContactPoint;
  elbow: ContactPoint;
  hands: ContactPoint;
  head: ContactPoint;
};

export type RiderFit = {
  height: number;
  inseam: number;
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
