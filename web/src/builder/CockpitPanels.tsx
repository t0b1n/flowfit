/**
 * Cockpit focus mode panels: the controls column (bar, stem, hoods) and the
 * readouts column (hood position vs start, wrist angle, spacer equivalent, UCI).
 */
import React from "react";
import { BAR_PRESETS, activeBarPreset } from "../barPresets";
import { effectiveBarRoll, hoodPitchDeg, type Cockpit } from "../cockpit";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HOOD_PRESETS } from "../components/hoodPresets";
import { PresetPills } from "../components/PresetPills";
import { SliderCard } from "../components/SliderCard";
import { Segmented } from "../design/Segmented";
import { wristAngleDeg } from "../geometry";
import type { Components, ContactPoint, MannequinSketch } from "../types";
import { SummaryRow, type SummaryTone } from "./shared";

const sign = (n: number, d = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;

export interface CockpitControlsProps {
  components: Components;
  patch: (p: Partial<Components>) => void;
  hoodPresetId: string;
  setHoodPresetId: (id: string) => void;
  mobilePanel: "controls" | "results" | null;
  fullscreen: boolean;
  onExit: () => void;
}

export const CockpitControls: React.FC<CockpitControlsProps> = ({ components: c, patch, hoodPresetId, setHoodPresetId, mobilePanel, fullscreen, onExit }) => {
  const roll = effectiveBarRoll(c);
  const slider = (
    label: React.ReactNode,
    key: keyof Components,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    reset: number | null,
    child?: React.ReactNode,
  ) => (
    <SliderCard
      key={String(key)}
      label={label}
      value={`${Number(value).toFixed(step < 1 ? 1 : 0)} ${unit}`}
      min={min}
      max={max}
      step={step}
      sliderValue={value}
      onChange={(v) => patch({ [key]: v } as Partial<Components>)}
      onReset={() => patch({ [key]: reset } as Partial<Components>)}
    >
      {child}
    </SliderCard>
  );
  return (
    <aside
      className={`controls-panel controls-panel--dense builder-left cockpit-panel${mobilePanel === "controls" ? " mobile-open" : ""}`}
      style={{ display: fullscreen ? "none" : undefined }}
      aria-label="Cockpit controls"
    >
      <div className="cockpit-panel__head">
        <div>
          <div className="ff-eyebrow">Focus</div>
          <h3>Cockpit</h3>
        </div>
        <button type="button" className="ff-pill ff-pill--ghost" onClick={onExit}>
          Back to full fit
        </button>
      </div>

      <CollapsibleSection eyebrow="Preset → fine-tune" title="Bar">
        <PresetPills
          small
          options={BAR_PRESETS}
          activeId={activeBarPreset(c)}
          onSelect={(id) => patch(BAR_PRESETS.find((p) => p.id === id)!.values)}
        />
        <div className="slider-grid slider-grid--compact">
          {slider("Rise", "bar_rise", c.bar_rise ?? 0, 0, 70, 1, "mm", 0)}
          {slider("Width at hoods (c–c)", "hood_width", c.hood_width ?? c.bar_width, 280, 460, 5, "mm", null)}
          {slider("Width at drops (c–c)", "bar_drop_width", c.bar_drop_width ?? c.hood_width ?? c.bar_width, 280, 540, 5, "mm", null)}
          {slider("Reach", "bar_reach", c.bar_reach, 60, 105, 1, "mm", 80)}
          {slider("Drop", "bar_drop_depth", c.bar_drop_depth ?? 125, 90, 145, 1, "mm", 125)}
          {slider("Backsweep", "bar_backsweep_deg", c.bar_backsweep_deg ?? 0, 0, 12, 0.5, "°", 0)}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Stem" title="Stem">
        <Segmented
          ariaLabel="Cockpit construction"
          value={c.cockpit_build ?? "two_piece"}
          onChange={(v) => patch({ cockpit_build: v as Components["cockpit_build"] })}
          options={[
            { id: "two_piece", label: "Two-piece" },
            { id: "integrated", label: "Integrated one-piece" },
          ]}
        />
        <div className="slider-grid slider-grid--compact">
          {slider("Length", "stem_length", c.stem_length, 60, 140, 5, "mm", 120)}
          {slider("Angle", "stem_angle_deg", c.stem_angle_deg, -17, 17, 1, "°", -6)}
          {slider("Spacers", "spacer_stack", c.spacer_stack, 0, 50, 5, "mm", 10)}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Hoods" title="Hoods">
        <PresetPills
          small
          options={HOOD_PRESETS}
          activeId={hoodPresetId}
          onSelect={(id) => {
            setHoodPresetId(id);
            patch({ hood_model: id, hood_reach_offset: HOOD_PRESETS.find((p) => p.id === id)!.hoodReachOffset });
          }}
        />
        <div className="slider-grid slider-grid--compact">
          <SliderCard
            label={<>Bar roll{c.bar_roll_deg == null && <span className="cockpit-auto"> · auto</span>}</>}
            value={`${roll.toFixed(0)} °`}
            min={-5}
            max={20}
            step={1}
            sliderValue={roll}
            onChange={(v) => patch({ bar_roll_deg: v })}
            onReset={() => patch({ bar_roll_deg: null })}
          />
          {slider("Hood position on bar", "hood_slide_mm", c.hood_slide_mm ?? 0, -10, 20, 1, "mm", 0)}
          {slider("Hood rotation (inward)", "hood_roll_deg", c.hood_roll_deg ?? 0, 0, 16, 0.5, "°", 0)}
          {slider("Hood reach", "hood_reach_offset", c.hood_reach_offset, 16, 40, 0.5, "mm", HOOD_PRESETS.find((p) => p.id === hoodPresetId)?.hoodReachOffset ?? 30.3)}
        </div>
        <div className="cockpit-note">
          Hood angle (result): <b>{sign(hoodPitchDeg(c))}°</b>. Bar roll tips the whole bar; sliding the hoods down the bend
          moves them lower and tips them nose-down.
        </div>
      </CollapsibleSection>
    </aside>
  );
};

export interface CockpitReadoutsProps {
  cockpit: Cockpit;
  start: { cockpit: Cockpit; mannequin: MannequinSketch };
  mannequin: MannequinSketch;
  idealHoods: ContactPoint;
  mobilePanel: "controls" | "results" | null;
  fullscreen: boolean;
  showGhost: boolean;
  setShowGhost: (v: boolean) => void;
  showUci: boolean;
  setShowUci: (v: boolean) => void;
  onResetStart: () => void;
}

const uciTone = (ok: boolean, near: boolean): SummaryTone => (ok ? "ok" : near ? "warn" : "bad");

export const CockpitReadouts: React.FC<CockpitReadoutsProps> = ({ cockpit: ck, start, mannequin, idealHoods, mobilePanel, fullscreen, showGhost, setShowGhost, showUci, setShowUci, onResetStart }) => {
  const dH = ck.contact.y - start.cockpit.contact.y;
  const dR = ck.contact.x - start.cockpit.contact.x;
  const toIdeal = Math.hypot(ck.contact.x - idealHoods.x, ck.contact.y - idealHoods.y);
  const wrist = wristAngleDeg(mannequin);
  const dW = wrist - wristAngleDeg(start.mannequin);
  const u = ck.uci;
  return (
    <aside
      className={`controls-panel controls-panel--dense builder-right cockpit-panel${mobilePanel === "results" ? " mobile-open" : ""}`}
      style={{ display: fullscreen ? "none" : undefined }}
      aria-label="Cockpit readouts"
    >
      <div className="fit-summary">
        <div className="fit-summary__header">
          <div>
            <div className="ff-eyebrow">Cockpit</div>
            <h3>Hands on the hoods</h3>
          </div>
          <button type="button" className="ff-pill ff-pill--ghost" onClick={onResetStart} title="Make the current cockpit the comparison start">
            Set as start
          </button>
        </div>
        <SummaryRow label="Hood height vs start" caption={ck.rise ? `${ck.rise.toFixed(0)} mm from bar rise` : undefined} value={`${sign(dH)} mm`} tone={Math.abs(dH) < 0.5 ? "muted" : "ok"} />
        <SummaryRow label="Hood reach vs start" value={`${sign(dR)} mm`} tone={Math.abs(dR) < 0.5 ? "muted" : "ok"} />
        <SummaryRow
          label="Hoods to ideal contact"
          value={`${toIdeal.toFixed(0)} mm`}
          tone={toIdeal <= 10 ? "ok" : toIdeal <= 25 ? "warn" : "bad"}
        />
        <SummaryRow
          label="Wrist angle on hoods"
          caption={Math.abs(dW) >= 0.5 ? `${sign(dW)}° vs start` : undefined}
          value={`${Math.abs(wrist).toFixed(0)}° ${wrist >= 0 ? "ext" : "flex"}`}
          tone="muted"
        />
        <SummaryRow label="Hood angle" caption={`bar roll ${ck.rollDeg.toFixed(0)}°`} value={`${sign(ck.pitchDeg)}°`} tone="muted" />
        {ck.rise > 0 && (
          <SummaryRow
            label="Same height with spacers"
            caption="and the stem would sit that much higher"
            value={`+${ck.rise.toFixed(0)} mm`}
            tone="muted"
          />
        )}
      </div>

      <CollapsibleSection eyebrow="2026" title="UCI cockpit rules">
        <SummaryRow label="Outside width ≥ 400" value={`${u.outsideWidth.toFixed(0)} mm`} tone={uciTone(u.ok.outsideWidth, u.outsideWidth >= 395)} />
        <SummaryRow label="Between hoods ≥ 280" value={`${u.innerHoods.toFixed(0)} mm`} tone={uciTone(u.ok.innerHoods, u.innerHoods >= 275)} />
        <SummaryRow label="Drop box ≤ 65 per side" value={`${u.dropBox.toFixed(0)} mm`} tone={uciTone(u.ok.dropBox, u.dropBox <= 70)} />
        <SummaryRow label="Lever tilt ≤ 10°" value={`${u.leverTiltDeg.toFixed(1)} °`} tone={uciTone(u.ok.leverTilt, false)} />
        <p className="cockpit-note">Shown as status only. Most riders don't race under UCI rules.</p>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Overlays" title="Compare">
        <Segmented
          ariaLabel="Ghost of the starting cockpit"
          value={showGhost ? "on" : "off"}
          onChange={(v) => setShowGhost(v === "on")}
          options={[
            { id: "on", label: "Ghost of start" },
            { id: "off", label: "No ghost" },
          ]}
        />
        <Segmented
          ariaLabel="UCI dimensions in the front view"
          value={showUci ? "on" : "off"}
          onChange={(v) => setShowUci(v === "on")}
          options={[
            { id: "on", label: "UCI dims" },
            { id: "off", label: "Hide dims" },
          ]}
        />
        <dl className="cockpit-spec">
          <dt>Build</dt>
          <dd>{ck.build === "integrated" ? "Integrated one-piece" : "Two-piece"}</dd>
          <dt>Hoods</dt>
          <dd>{ck.hood.label}</dd>
          <dt>Widths</dt>
          <dd>
            {ck.hoodWidth.toFixed(0)} / {ck.dropWidth.toFixed(0)} mm
          </dd>
          <dt>Rise · drop</dt>
          <dd>
            {ck.rise.toFixed(0)} · {ck.dropDepth.toFixed(0)} mm
          </dd>
        </dl>
      </CollapsibleSection>
    </aside>
  );
};
