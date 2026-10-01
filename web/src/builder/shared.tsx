import React from "react";
import { type FrameMeasurementId, type FrameMeasurementVisibility } from "../BikeAnnotations";
import { DEFAULT_COMPONENTS, MannequinPresetKey } from "../geometry";
import type { Components } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PEDAL_PRESETS = [
  { id: "spd-sl", label: "SPD-SL", stack: 6, note: "Shimano 3-bolt" },
  { id: "keo-blade", label: "Look Keo Blade", stack: 7, note: "Look Keo Blade 2" },
  { id: "speedplay", label: "Speedplay", stack: 11, note: "Zero / Nano" },
  { id: "time", label: "Time", stack: 7, note: "XPRO / ATAC" },
] as const;

export const SHOE_PRESETS = [
  { id: "carbon", label: "Carbon", stack: 5, note: "Carbon road sole" },
  { id: "composite", label: "Composite", stack: 9, note: "Composite road sole" },
  { id: "mtb", label: "MTB", stack: 14, note: "MTB / touring shoe" },
] as const;

export const DEFAULT_COMPONENTS_BUILDER: Components = { ...DEFAULT_COMPONENTS };

export const PRESET_LABELS: Record<MannequinPresetKey, string> = {
  endurance: "Endurance",
  race: "Race",
  fast: "Fast",
};

export type RiderVisibilityPart = "legs" | "torso" | "arms" | "head" | "feet" | "contactMarkers";
export type RiderVisibility = Record<RiderVisibilityPart, boolean>;

export const FRAME_MEASUREMENT_LABELS: Record<FrameMeasurementId, string> = {
  stack: "Stack",
  reach: "Reach",
  effectiveTopTube: "ETT",
  headTubeLength: "HT length",
  headTubeAngle: "HT angle",
  seatTubeAngle: "ST angle",
  seatTubeLength: "ST length",
  bbDrop: "BB drop",
  chainstay: "Chainstay",
  wheelbase: "Wheelbase",
  forkLength: "Fork length",
  forkOffset: "Fork offset",
};

export const RIDER_VISIBILITY_LABELS: Record<RiderVisibilityPart, string> = {
  legs: "Legs",
  torso: "Torso",
  arms: "Arms",
  head: "Head",
  feet: "Feet",
  contactMarkers: "Contacts",
};

export const DEFAULT_RIDER_VISIBILITY: RiderVisibility = {
  legs: true,
  torso: true,
  arms: true,
  head: true,
  feet: true,
  contactMarkers: true,
};

export const DEFAULT_FRAME_MEASUREMENT_VISIBILITY: FrameMeasurementVisibility = {
  stack: true,
  reach: true,
  effectiveTopTube: true,
  headTubeLength: true,
  headTubeAngle: true,
  seatTubeAngle: true,
  seatTubeLength: true,
  bbDrop: true,
  chainstay: true,
  wheelbase: true,
  forkLength: true,
  forkOffset: true,
};

export type ViewKind = "side" | "front" | "3d";
export type SummaryTone = "ok" | "warn" | "bad" | "muted";

// ── Tier header: `[01] RIDER`, numbers the conceptual flow (rider → posture → hardware) ──

export const Tier: React.FC<{
  n: number;
  tone: "frame" | "rider";
  title: string;
  desc: string;
  children: React.ReactNode;
}> = ({ n, tone, title, desc, children }) => (
  <div className={`tier tier--${tone}`}>
    <div className="tier-header" title={desc}>
      <b className="tier-chip">{String(n).padStart(2, "0")}</b>
      <span className="tier-header__title">{title}</span>
    </div>
    {children}
  </div>
);

export const SummaryRow: React.FC<{
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone: SummaryTone;
}> = ({ label, value, caption, tone }) => (
  <div className="fit-summary__row">
    <span className={`status-dot status-dot--${tone}`} />
    <div className="fit-summary__text">
      <span className="fit-summary__label">{label}</span>
      {caption && <span className="fit-summary__caption">{caption}</span>}
    </div>
    <strong className="fit-summary__value">
      {typeof value === "string" && /^-?[\d.,]+\s*\S/.test(value) ? (
        <>
          {value.replace(/^(-?[\d.,]+)\s*(\S.*)$/, "$1")}
          <small>{value.replace(/^(-?[\d.,]+)\s*(\S.*)$/, "$2")}</small>
        </>
      ) : (
        value
      )}
    </strong>
  </div>
);