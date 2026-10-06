import { Link } from "react-router-dom";
import { StatusDot } from "../design/StatusDot";
import React from "react";
import { Segmented } from "../design/Segmented";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HOOD_PRESETS } from "../components/hoodPresets";
import { PresetPills } from "../components/PresetPills";
import { SliderCard } from "../components/SliderCard";
import { DEFAULT_TYRE_SIZE, DEFAULT_WRIST_LOCK_DEG, MANNEQUIN_PRESETS, MannequinPresetKey, BodyMeasurements } from "../geometry";
import type { BikeSelection, Components, FitMode, RiderFit } from "../types";
import { Tier, PRESET_LABELS, PEDAL_PRESETS, SHOE_PRESETS } from "./shared";
import type { buildRider } from "../geometry";
import type { FrameModel, SizeData, FrameGeometry } from "../frameCatalog";
export interface ControlsColumnProps {
  mobilePanel: "controls" | "results" | null;
  fullscreen: boolean;
  fitMode: "contact" | "saddle_height";
  handleFitModeChange: (mode: FitMode) => void;
  idealSaddleY: number;
  kneeFlex: number;
  riderFit: RiderFit;
  setRiderFit: (value: React.SetStateAction<RiderFit>) => void;
  targetSaddleHeightMm: number;
  setTargetSaddleHeightMm: (value: React.SetStateAction<number>) => void;
  /** Largest foot-to-pedal gap over the stroke (mm); > 0 means the saddle is above leg reach. */
  pedalGapMm: number;
  /** Highest saddle (mm above BB) at which the foot still reaches the pedal. */
  maxSaddleHeightMm: number;
  rider: ReturnType<typeof buildRider>;
  updateBodyMeasurement: (key: keyof BodyMeasurements, value: number) => void;
  setBodyMeasurements: (value: React.SetStateAction<Partial<BodyMeasurements>>) => void;
  trunkAngleOverride: number | null;
  backBendOverride: number | null;
  preset: "endurance" | "race" | "fast";
  setPreset: (value: React.SetStateAction<"endurance" | "race" | "fast">) => void;
  setTrunkAngleOverride: (value: React.SetStateAction<number | null>) => void;
  setBackBendOverride: (value: React.SetStateAction<number | null>) => void;
  targetTrunkAngleDeg: number;
  backBendDeg: number;
  wristLockEnabled: boolean;
  setWristLockEnabled: (value: boolean) => void;
  wristLockMaxDeg: number;
  setWristLockMaxDeg: (value: number) => void;
  currentBrand: string;
  FRAME_CATALOG: FrameModel[];
  setSelection: (value: React.SetStateAction<BikeSelection>) => void;
  brands: string[];
  selection: { modelId: string; size: string; };
  getModelById: (modelId: string) => FrameModel;
  modelsForBrand: FrameModel[];
  model: { id: string; brand: string; model: string; launch_year: number; category: string; popularity: string; sources: string[]; sizes: SizeData[]; };
  sizeData: { size: string; geometry: FrameGeometry; wheelbase?: number; front_center?: number; trail?: number; top_tube_effective?: number; standover?: number; bb_height?: number; seat_tube_ct?: number; head_tube?: number; stockCockpit?: { stem_length?: number; bar_width?: number; crank_length?: number; spacer_stack?: number; }; };
  components: Components;
  updateComponent: (key: keyof Components, value: number) => void;
  resetComponent: (key: keyof Components) => void;
  hoodPresetId: string;
  setHoodPresetId: (value: React.SetStateAction<string>) => void;
  tyreSize: number;
  setTyreSize: (value: React.SetStateAction<number>) => void;
  pedalPresetId: string;
  handlePedalPreset: (id: string) => void;
  shoePresetId: string;
  handleShoePreset: (id: string) => void;
  setPedalPresetId: (value: React.SetStateAction<string>) => void;
  setShoePresetId: (value: React.SetStateAction<string>) => void;
}

export const ControlsColumn: React.FC<ControlsColumnProps> = ({ mobilePanel, fullscreen, fitMode, handleFitModeChange, idealSaddleY, kneeFlex, riderFit, setRiderFit, targetSaddleHeightMm, setTargetSaddleHeightMm, pedalGapMm, maxSaddleHeightMm, rider, updateBodyMeasurement, setBodyMeasurements, trunkAngleOverride, backBendOverride, preset, setPreset, setTrunkAngleOverride, setBackBendOverride, targetTrunkAngleDeg, backBendDeg, wristLockEnabled, setWristLockEnabled, wristLockMaxDeg, setWristLockMaxDeg, currentBrand, FRAME_CATALOG, setSelection, brands, selection, getModelById, modelsForBrand, model, sizeData, components, updateComponent, resetComponent, hoodPresetId, setHoodPresetId, tyreSize, setTyreSize, pedalPresetId, handlePedalPreset, shoePresetId, handleShoePreset, setPedalPresetId, setShoePresetId }) => {
  return (
    (
    <>
      {/* ── Left panel ── */}
      <aside
        className={`controls-panel controls-panel--dense builder-left${mobilePanel === "controls" ? " mobile-open" : ""}`}
        style={{ display: fullscreen ? "none" : undefined }}
      >
        <Tier n={1} tone="rider" title="Rider" desc="Who is being fitted">
          <CollapsibleSection eyebrow="Rider" title="Fit targets">
            <Segmented
              ariaLabel="Fit target mode"
              className="ff-seg--block"
              value={fitMode}
              onChange={handleFitModeChange}
              options={[
                { id: "contact", label: "Knee flex" },
                { id: "saddle_height", label: "Saddle height" },
              ]}
            />
            <p className="subpanel-note subpanel-note--tight">
              {fitMode === "contact"
                ? `Saddle height follows knee flex → ${idealSaddleY.toFixed(0)} mm`
                : `Knee flex follows saddle height → ${kneeFlex.toFixed(1)}°`}
            </p>
            {pedalGapMm > 0.5 && (
              <div className="warn-note warn-note--out" role="alert">
                <b className="warn-note__eyebrow">
                  <StatusDot status="out" /> SADDLE TOO HIGH
                </b>
                <div>
                  Leg fully straight — the foot lifts {pedalGapMm.toFixed(0)} mm off the pedal at the bottom of the stroke.
                </div>
                <div className="warn-note__delta">Highest reachable saddle ≈ {Math.floor(maxSaddleHeightMm)} mm</div>
              </div>
            )}
            <div className="slider-grid slider-grid--compact">
              <SliderCard
                label="Height"
                value={`${riderFit.height} mm`}
                min={1500} max={2050} step={5}
                sliderValue={riderFit.height}
                variant="target"
                onChange={(v) => setRiderFit((r) => ({ ...r, height: v }))}
              />
              <SliderCard
                label="Inseam"
                value={`${riderFit.inseam} mm`}
                min={700} max={1000} step={5}
                sliderValue={riderFit.inseam}
                variant="target"
                onChange={(v) => setRiderFit((r) => ({ ...r, inseam: v }))}
              />
              {fitMode === "contact" ? (
                <SliderCard
                  label="Target knee flex"
                  value={`${riderFit.targetKneeFlexDeg}°`}
                  min={0} max={45} step={1}
                  sliderValue={riderFit.targetKneeFlexDeg}
                  variant="target"
                  onChange={(v) => setRiderFit((r) => ({ ...r, targetKneeFlexDeg: v }))}
                />
              ) : (
                <SliderCard
                  label="Target saddle height"
                  value={`${targetSaddleHeightMm} mm`}
                  min={550} max={850} step={1}
                  sliderValue={targetSaddleHeightMm}
                  variant="target"
                  onChange={setTargetSaddleHeightMm}
                />
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection eyebrow="Advanced" title="Body dimensions" defaultOpen={false}>
            <p className="subpanel-note">
              Defaults scale with height. Override with tape-measured values for precision.
            </p>
            <div className="slider-grid slider-grid--compact">
              {(
                [
                  ["Shoulder width", Math.round(rider.shoulder_width), 300, 520, 5, "shoulderWidth"],
                  ["Torso length", Math.round(rider.torso_length), 430, 780, 5, "torsoLength"],
                  ["Upper arm", Math.round(rider.upper_arm_length), 220, 420, 5, "upperArmLength"],
                  ["Forearm", Math.round(rider.forearm_length), 190, 360, 5, "forearmLength"],
                ] as const
              ).map(([label, value, min, max, step, key]) => (
                <SliderCard
                  key={key}
                  label={label}
                  value={`${value} mm`}
                  min={min} max={max} step={step}
                  sliderValue={value}
                  variant="target"
                  onChange={(v) => updateBodyMeasurement(key as keyof BodyMeasurements, v)}
                />
              ))}
              <SliderCard
                label="Saddle–hip joint offset"
                value={`${rider.hip_joint_offset} mm`}
                min={0} max={130} step={5}
                sliderValue={rider.hip_joint_offset}
                variant="target"
                onChange={(v) => updateBodyMeasurement("hipJointOffset", v)}
              />
              <SliderCard
                label="Shoe size (EU)"
                value={`EU ${Math.round(rider.foot_length / 6.67)}`}
                min={36} max={48} step={1}
                sliderValue={Math.round(rider.foot_length / 6.67)}
                variant="target"
                onChange={(v) => updateBodyMeasurement("footLength", v * 6.67)}
              />
            </div>
            <button className="ghost-button" onClick={() => setBodyMeasurements({})}>
              Reset to height defaults
            </button>
          </CollapsibleSection>
        </Tier>

        <Tier n={2} tone="rider" title="Posture" desc="How they want to sit">
          <CollapsibleSection eyebrow="Posture" title="Riding intent">
            <PresetPills
              options={(Object.keys(MANNEQUIN_PRESETS) as MannequinPresetKey[]).map((p) => ({
                id: p,
                label: PRESET_LABELS[p],
              }))}
              activeId={trunkAngleOverride === null && backBendOverride === null ? preset : null}
              onSelect={(id) => {
                setPreset(id as MannequinPresetKey);
                setTrunkAngleOverride(null);
                setBackBendOverride(null);
              }}
            />
            <div className="slider-grid slider-grid--compact" style={{ marginTop: 8 }}>
              <SliderCard
                label="Trunk angle"
                value={`${targetTrunkAngleDeg.toFixed(0)}°`}
                min={0} max={70} step={1}
                sliderValue={targetTrunkAngleDeg}
                variant="target"
                onChange={setTrunkAngleOverride}
                onReset={() => setTrunkAngleOverride(null)}
              />
              <SliderCard
                label="Back bend"
                value={`${backBendDeg}°`}
                min={-10} max={45} step={1}
                sliderValue={backBendDeg}
                variant="target"
                onChange={setBackBendOverride}
                onReset={() => setBackBendOverride(null)}
              />
              <label className="field field--inline" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={wristLockEnabled}
                  onChange={(e) => setWristLockEnabled(e.target.checked)}
                />
                <span>Wrist lock: shift the shoulder instead of bending the wrist past the limit</span>
              </label>
              {wristLockEnabled && (
                <SliderCard
                  label="Max wrist bend"
                  value={`${wristLockMaxDeg}°`}
                  min={0} max={45} step={1}
                  sliderValue={wristLockMaxDeg}
                  variant="target"
                  onChange={setWristLockMaxDeg}
                  onReset={() => setWristLockMaxDeg(DEFAULT_WRIST_LOCK_DEG)}
                />
              )}
            </div>
          </CollapsibleSection>
        </Tier>

        <Tier n={3} tone="frame" title="Bike" desc="Hardware that achieves it">
          <CollapsibleSection eyebrow="Frame" title="Select frame">
            <label className="field">
              <span>Brand</span>
              <select
                value={currentBrand}
                onChange={(e) => {
                  const firstModel = FRAME_CATALOG.find((m) => m.brand === e.target.value)!;
                  setSelection({ modelId: firstModel.id, size: firstModel.sizes[0].size });
                }}
              >
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Model</span>
              <select
                value={selection.modelId}
                onChange={(e) => {
                  const m = getModelById(e.target.value);
                  setSelection({ modelId: m.id, size: m.sizes[0].size });
                }}
              >
                {modelsForBrand.map((m) => (
                  <option key={m.id} value={m.id}>{m.model}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Size</span>
              <select
                value={selection.size}
                onChange={(e) => setSelection((s) => ({ ...s, size: e.target.value }))}
              >
                {model.sizes.map((entry) => (
                  <option key={entry.size} value={entry.size}>{entry.size}</option>
                ))}
              </select>
            </label>
            <div className="bike-card__meta">
              <span>Stack {sizeData.geometry.stack} mm</span>
              <span>Reach {sizeData.geometry.reach} mm</span>
              <span>Seat {sizeData.geometry.seat_angle_deg}°</span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection eyebrow="Cockpit" title="Component setup">
            <div className="slider-grid slider-grid--compact">
              {(
                [
                  ["Stem length", components.stem_length, 50, 180, 1, "stem_length", "mm"],
                  ["Stem angle", components.stem_angle_deg, -20, 20, 1, "stem_angle_deg", "°"],
                  ["Spacers", components.spacer_stack, 0, 60, 1, "spacer_stack", "mm"],
                  ["Stem height", components.stem_height, 20, 60, 1, "stem_height", "mm"],
                  ["Bar reach", components.bar_reach, 65, 105, 1, "bar_reach", "mm"],
                  ["Bar width", components.bar_width, 200, 460, 10, "bar_width", "mm"],
                ] as const
              ).map(([label, value, min, max, step, key, unit]) => (
                <SliderCard
                  key={key}
                  label={label}
                  value={`${Number(value).toFixed(0)} ${unit}`}
                  min={min} max={max} step={step}
                  sliderValue={value}
                  onChange={(v) => updateComponent(key as keyof Components, v)}
                  onReset={() => resetComponent(key as keyof Components)}
                />
              ))}
              <SliderCard
                label="Hood reach"
                value={`${components.hood_reach_offset.toFixed(1)} mm`}
                min={16} max={32} step={0.5}
                sliderValue={components.hood_reach_offset}
                onChange={(v) => updateComponent("hood_reach_offset", v)}
              >
                <PresetPills
                  small
                  inline
                  options={HOOD_PRESETS}
                  activeId={hoodPresetId}
                  onSelect={(id) => {
                    setHoodPresetId(id);
                    const hp = HOOD_PRESETS.find((p) => p.id === id)!;
                    updateComponent("hood_reach_offset", hp.hoodReachOffset);
                  }}
                />
              </SliderCard>
              <Link to="/cockpit" className="ff-pill ff-pill--ghost cockpit-open-link">
                Open cockpit focus: bars, stem, hood angle &amp; rotation →
              </Link>
            </div>
          </CollapsibleSection>

          <CollapsibleSection eyebrow="Saddle" title="Saddle & seatpost">
            <div className="slider-grid slider-grid--compact">
              {(
                [
                  ["Saddle stack", components.saddle_stack, 30, 120, 1, "saddle_stack", "mm"],
                  ["Seatpost offset", components.seatpost_offset, -30, 30, 2, "seatpost_offset", "mm"],
                  ["Rail offset", components.saddle_rail_offset, -25, 25, 5, "saddle_rail_offset", "mm"],
                  ["Crank length", components.crank_length, 160, 177.5, 2.5, "crank_length", "mm"],
                ] as const
              ).map(([label, value, min, max, step, key, unit]) => (
                <SliderCard
                  key={key}
                  label={label}
                  value={`${Number(value).toFixed(step === 2.5 ? 1 : 0)} ${unit}`}
                  min={min} max={max} step={step}
                  sliderValue={value}
                  onChange={(v) => updateComponent(key as keyof Components, v)}
                  onReset={() => resetComponent(key as keyof Components)}
                />
              ))}
              <SliderCard
                label="Tyre size"
                value={`${tyreSize} mm`}
                min={25} max={38} step={1}
                sliderValue={tyreSize}
                onChange={setTyreSize}
                onReset={() => setTyreSize(DEFAULT_TYRE_SIZE)}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection eyebrow="Advanced" title="Shoes & pedals" defaultOpen={false}>
            <p className="subpanel-note">
              Affects saddle height — more stack raises the saddle to maintain knee angle.
            </p>
            <div style={{ marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Pedal system</div>
              <PresetPills
                small
                options={PEDAL_PRESETS.map((p) => ({ id: p.id, label: p.label, title: p.note }))}
                activeId={pedalPresetId}
                onSelect={handlePedalPreset}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Shoe type</div>
              <PresetPills
                small
                options={SHOE_PRESETS.map((s) => ({ id: s.id, label: s.label, title: s.note }))}
                activeId={shoePresetId}
                onSelect={handleShoePreset}
              />
            </div>
            <div className="slider-grid slider-grid--compact">
              <SliderCard
                label="Total foot stack"
                value={`${components.pedal_stack_height} mm`}
                min={0} max={35} step={1}
                sliderValue={components.pedal_stack_height}
                onChange={(v) => {
                  updateComponent("pedal_stack_height", v);
                  setPedalPresetId("");
                  setShoePresetId("");
                }}
              />
              <SliderCard
                label="Cleat setback"
                value={`${components.cleat_setback > 0 ? "+" : ""}${components.cleat_setback} mm`}
                min={-15} max={15} step={1}
                sliderValue={components.cleat_setback}
                onChange={(v) => updateComponent("cleat_setback", v)}
                onReset={() => resetComponent("cleat_setback")}
              />
            </div>
          </CollapsibleSection>
        </Tier>
      </aside>
    </>
  )
  );
};
