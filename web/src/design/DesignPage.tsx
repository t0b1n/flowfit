import React, { useState } from "react";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { MetricCard } from "../components/MetricCard";
import { PresetPills } from "../components/PresetPills";
import { SliderCard } from "../components/SliderCard";
import { METRICS, computeAll, formatDelta, formatMetric, metricBand, metricStatus, type MetricId } from "../fitMetrics";
import { POSTURE_PRESET } from "../geometry";
import type { MannequinSketch } from "../types";
import { BandGauge } from "./BandGauge";
import { BrandMark } from "./BrandMark";
import { CalloutLayer } from "./CalloutLayer";
import { MetricRail } from "./MetricRail";
import { PartCode } from "./PartCode";
import { Pill } from "./Pill";
import { Readout } from "./Readout";
import { Segmented } from "./Segmented";
import { SpecTable } from "./SpecTable";
import { StatusDot } from "./StatusDot";
import { ThemeToggle } from "./ThemeToggle";
import { TOKENS, type Theme } from "./tokens";

// Synthetic fit: just enough geometry for the registry to produce values for the samples below.
const SAMPLE_M = {
  hip: { x: -200, y: 700 },
  knee: { x: 100, y: 520 },
  ankle: { x: 0, y: 110 },
  shoulder: { x: 150, y: 930 },
  elbow: { x: 340, y: 780 },
  wrist: { x: 400, y: 700 },
  hands: { x: 420, y: 690 },
  head: { x: 200, y: 1010 },
  neckBase: { x: 170, y: 950 },
  spineJoint: { x: -30, y: 810 },
} as MannequinSketch;
const SAMPLE_LUT = {
  samples: 72,
  poses: Array.from({ length: 72 }, () => ({
    spindle: { x: 0, y: -170 },
    cleat: { x: -10, y: -170 },
    ankle: { x: -10, y: -150 },
    knee: { x: 100, y: 520 },
  })),
  kneeExtensionDeg: [],
  kopsOffsetMm: 12,
  kneeFlexionTdcDeg: 108,
  kneeFlexionBdcDeg: 31,
  kneeExtensionMaxDeg: 149,
  maxExtensionIndex: 34,
  pedalGapMm: [],
  maxPedalGapMm: 0,
  crankLength: 170,
  hip: SAMPLE_M.hip,
  ankleSetbackMm: 0,
  ankleRiseMm: 0,
  shoeLengthMm: 270,
} as unknown as Parameters<typeof computeAll>[0]["lut"];
const SAMPLE_PTS = new Map<string, [number, number, number]>([
  ["saddle", [-200, 730, 0]],
  ["hoods_l", [420, 650, 90]],
  ["hoods_r", [420, 650, -90]],
  ["knee_l", [100, 520, 90]],
  ["knee_r", [90, 520, -90]],
  ["hip_l", [-200, 700, 90]],
  ["spine_joint", [-30, 810, 0]],
  ["shoulder_l", [150, 930, 90]],
  ["elbow_l", [340, 780, 90]],
]);
const VALUES = computeAll({ m: SAMPLE_M, lut: SAMPLE_LUT, pts: SAMPLE_PTS });
const WAS: Partial<Record<MetricId, number>> = { knee_ext_bdc: 146, saddle_height: 726, hip: 60 };

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="ds-block">
    <div className="ff-eyebrow">{title}</div>
    <div className="ds-block__body">{children}</div>
  </section>
);

const Samples: React.FC = () => {
  const [seg, setSeg] = useState("side");
  const [slider, setSlider] = useState(1760);
  const [preset, setPreset] = useState<string | null>("race");
  const [focused, setFocused] = useState<MetricId>("knee_ext_bdc");
  const [pinned, setPinned] = useState<MetricId[]>(["saddle_height", "trunk"]);

  const railItems = METRICS.filter((d) => VALUES[d.id] != null).map((d) => {
    const v = VALUES[d.id]!;
    const was = WAS[d.id];
    return {
      id: d.id,
      code: d.code,
      label: d.short,
      value: formatMetric(d.id, v),
      unit: d.unit === "mm" ? "mm" : undefined,
      delta: was != null ? formatDelta(d.id, v - was) : "",
      status: metricStatus(d.id, v, POSTURE_PRESET),
    };
  });
  const band = metricBand("knee_ext_bdc", POSTURE_PRESET)!;
  const kv = VALUES.knee_ext_bdc!;

  return (
    <>
      <Block title="Brand · theme">
        <BrandMark />
        <ThemeToggle />
      </Block>
      <Block title="Pill / Button">
        <Pill>Ghost</Pill>
        <Pill variant="active">Active</Pill>
        <Pill variant="primary">Save fit</Pill>
        <Pill disabled>Disabled</Pill>
      </Block>
      <Block title="Segmented">
        <Segmented
          ariaLabel="View"
          value={seg}
          onChange={setSeg}
          options={[
            { id: "side", label: "Side" },
            { id: "front", label: "Front" },
            { id: "3d", label: "3D" },
          ]}
        />
      </Block>
      <Block title="StatusDot · PartCode">
        <StatusDot status="in" />
        <StatusDot status="near" />
        <StatusDot status="out" />
        <PartCode>J3</PartCode>
        <PartCode hot>J3</PartCode>
      </Block>
      <Block title="Readout">
        <Readout
          size="big"
          eyebrow="J3 · KNEE EXTENSION · MAX"
          value={formatMetric("knee_ext_bdc", kv)}
          unit="°"
          delta={formatDelta("knee_ext_bdc", kv - WAS.knee_ext_bdc!)}
          deltaNote="vs FIT 02 (146°)"
        />
        <Readout size="medium" eyebrow="C1 · SADDLE HEIGHT" value={formatMetric("saddle_height", VALUES.saddle_height!)} unit="mm" delta="▲ 4 mm" />
      </Block>
      <Block title="BandGauge">
        <div style={{ width: 300 }}>
          <BandGauge value={kv} band={band} was={WAS.knee_ext_bdc} />
          <BandGauge value={kv} band={band} mini />
        </div>
      </Block>
      <Block title="Metric Rail (click = focus, ⇧-click = pin)">
        <div style={{ width: "100%" }}>
          <MetricRail
            items={railItems}
            focused={focused}
            pinned={pinned}
            onFocus={(id) => setFocused(id as MetricId)}
            onTogglePin={(id) =>
              setPinned((p) => (p.includes(id as MetricId) ? p.filter((x) => x !== id) : [...p, id as MetricId].slice(-3)))
            }
          />
        </div>
      </Block>
      <Block title="SpecTable">
        <div style={{ width: 320 }}>
          <SpecTable
            sections={[
              {
                title: "Components",
                rows: [
                  { label: "Saddle height", value: "730", unit: "mm", delta: "+4" },
                  { label: "Setback", value: "200", unit: "mm" },
                  { label: "Stem", value: "100 × 6", unit: "mm·°" },
                ],
              },
              { title: "Frame", rows: [{ label: "Stack / Reach", value: "560 / 385", unit: "mm" }] },
            ]}
            summary={{ label: "Saddle → hood drop", value: "80 mm" }}
          />
        </div>
      </Block>
      <Block title="CalloutLayer">
        <div className="ds-stage">
          <CalloutLayer
            width={420}
            height={220}
            anchors={[
              { id: "knee_ext_bdc", x: 90, y: 150, hot: true },
              { id: "trunk", x: 60, y: 60 },
              { id: "saddle_height", x: 90, y: 70 },
            ]}
            prefer={{ knee_ext_bdc: [60, 30], trunk: [60, -30], saddle_height: [60, -20] }}
            values={VALUES}
          />
        </div>
      </Block>
      <Block title="SliderCard (with band ticks)">
        <div style={{ width: 260 }}>
          <SliderCard label="Height" value={`${slider} mm`} min={1500} max={2000} step={5} sliderValue={slider} onChange={setSlider} ticks={[1700, 1800]} />
        </div>
      </Block>
      <Block title="PresetPills">
        <PresetPills
          options={[
            { id: "endurance", label: "Endurance" },
            { id: "race", label: "Race" },
            { id: "fast", label: "Fast" },
          ]}
          activeId={preset}
          onSelect={setPreset}
        />
      </Block>
      <Block title="CollapsibleSection">
        <div style={{ width: 280 }}>
          <CollapsibleSection eyebrow="Posture" title="Riding intent" defaultOpen>
            <div className="subpanel-note">Section body copy.</div>
          </CollapsibleSection>
        </div>
      </Block>
      <Block title="MetricCard (colour = status dot)">
        <div style={{ width: 220 }}>
          <MetricCard label="Saddle" value="On target (0 mm)" color="var(--band-in)" />
          <MetricCard label="Hoods" value="90 mm off" color="var(--band-out)" delta="ΔX −13 mm · ΔY −89 mm" />
        </div>
      </Block>
    </>
  );
};

const Swatches: React.FC<{ theme: Theme }> = ({ theme }) => (
  <div className="ds-swatches">
    {(Object.keys(TOKENS[theme]) as (keyof (typeof TOKENS)["light"])[]).map((k) => (
      <div key={k} className="ds-swatch">
        <i style={{ background: TOKENS[theme][k] }} />
        <span>{k}</span>
        <em>{TOKENS[theme][k]}</em>
      </div>
    ))}
  </div>
);

const TypeScale: React.FC = () => (
  <div className="ds-type">
    <div className="ff-eyebrow">Label / eyebrow · mono 400 · .16em</div>
    <div style={{ font: "500 13px var(--font-sans)" }}>Body · Geist 500 13px</div>
    <div style={{ font: "600 15px var(--font-sans)", letterSpacing: "-.01em" }}>Section title · Geist 600 15px</div>
    <div style={{ font: "500 13px var(--font-mono)" }}>
      Value · Geist Mono 500 <span style={{ color: "var(--muted)" }}>mm</span> 1234567890
    </div>
    <div style={{ font: "500 38px var(--font-sans)", letterSpacing: "-.02em" }}>Medium 38</div>
    <div style={{ font: "800 56px var(--font-dot)" }}>148°</div>
  </div>
);

/** Dev-only visual contract: every primitive in both themes side by side. */
const DesignPage: React.FC = () => (
  <div className="ds-page">
    {(["light", "dark"] as Theme[]).map((t) => (
      <div key={t} data-theme={t} className="ds-theme">
        <h2 className="ds-theme__title">{t.toUpperCase()}</h2>
        <Block title="Tokens">
          <Swatches theme={t} />
        </Block>
        <Block title="Type">
          <TypeScale />
        </Block>
        <Samples />
      </div>
    ))}
  </div>
);

export default DesignPage;
