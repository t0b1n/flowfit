import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BikeGeometryAnnotations, BikeFitAnnotations } from "./BikeAnnotations";
import {
  FRAME_CATALOG,
  FrameGeometry,
  getModelById,
  getSizeData,
} from "./frameCatalog";
import {
  DEFAULT_COMPONENTS,
  DEFAULT_RIDER_FIT,
  DEFAULT_TYRE_SIZE,
  MANNEQUIN_PRESETS,
  MannequinPresetKey,
  BodyMeasurements,
  angleAtPoint,
  barReachNeeded,
  boundsForBikes,
  buildFrontalMannequin,
  buildMannequin,
  buildRider,
  buildSetup,
  expandBoundsForMannequins,
  estimateSeatTubeTopDistance,
  fitWarnings,
  idealContactsFromRider,
  radiansFromDegrees,
  seatpostRecommendation,
  synthesizeBike,
  withTyreSize,
} from "./geometry";
import type { BikeSelection, Components, ContactPoint, RiderFit, SeatpostRecommendation } from "./types";
import { BikeScene3D } from "./BikeScene3D";
import { fetchGeometry3D } from "./api";
import type { Geometry3DResponse } from "./bike3d";

// ── Saddle shape SVG sub-component ────────────────────────────────────────────

const SaddleShape: React.FC<{
  contact: ContactPoint;  // bike coordinates (y up) — saddle surface
  clamp: ContactPoint;    // bike coordinates — rail clamp centre
  className?: string;
}> = ({ contact, clamp, className }) => {
  const cx = contact.x;
  const cy = -contact.y; // SVG y (flipped)
  const clampSvgX = clamp.x;
  const clampSvgY = -clamp.y;
  const w = 120;
  const h = 25;
  const r = 8;
  const d = [
    `M ${cx - w + r},${cy}`,
    `L ${cx + w - r},${cy}`,
    `Q ${cx + w},${cy} ${cx + w},${cy + r}`,
    `L ${cx + w},${cy + h - r}`,
    `Q ${cx + w},${cy + h} ${cx + w - r},${cy + h}`,
    `L ${cx - w + r},${cy + h}`,
    `Q ${cx - w},${cy + h} ${cx - w},${cy + h - r}`,
    `L ${cx - w},${cy + r}`,
    `Q ${cx - w},${cy} ${cx - w + r},${cy}`,
    "Z",
  ].join(" ");
  return (
    <g className={className}>
      <path d={d} className="geometry-saddle-body" />
      <line x1={cx - 40} y1={cy + h} x2={clampSvgX} y2={clampSvgY} className="geometry-saddle-rail" />
      <line x1={cx + 40} y1={cy + h} x2={clampSvgX} y2={clampSvgY} className="geometry-saddle-rail" />
      <circle cx={clampSvgX} cy={clampSvgY} r={4} className="geometry-saddle-clamp" />
    </g>
  );
};

// ── Collapsible section ───────────────────────────────────────────────────────

const CollapsibleSection: React.FC<{
  eyebrow: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ eyebrow, title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="subpanel">
      <button
        className="subpanel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        <span className={`subpanel-chevron${open ? "" : " subpanel-chevron--closed"}`} />
      </button>
      {open && <div className="subpanel-body">{children}</div>}
    </div>
  );
};

// ── Constants ─────────────────────────────────────────────────────────────────

const HOOD_PRESETS = [
  { id: "shimano", label: "Shimano DA", hoodReachOffset: 24 },
  { id: "sram-red", label: "SRAM Red", hoodReachOffset: 28 },
  { id: "sram-force", label: "SRAM Force", hoodReachOffset: 28 },
];

const PEDAL_PRESETS = [
  { id: "spd-sl", label: "SPD-SL", stack: 6, note: "Shimano 3-bolt" },
  { id: "keo-blade", label: "Keo Blade", stack: 7, note: "Look Keo Blade" },
  { id: "speedplay", label: "Speedplay", stack: 11, note: "Zero / Nano" },
  { id: "time", label: "Time", stack: 7, note: "XPRO / ATAC" },
] as const;

const SHOE_PRESETS = [
  { id: "carbon", label: "Carbon", stack: 5, note: "Carbon road sole" },
  { id: "composite", label: "Composite", stack: 9, note: "Composite road sole" },
  { id: "mtb", label: "MTB", stack: 14, note: "MTB / touring shoe" },
] as const;

const DEFAULT_COMPONENTS_BUILDER: Components = { ...DEFAULT_COMPONENTS };

const PRESET_LABELS: Record<MannequinPresetKey, string> = {
  endurance: "Endurance",
  race: "Race",
  fast: "Fast",
};

// ── Component ─────────────────────────────────────────────────────────────────

export const FitBuilderMode: React.FC = () => {
  const firstModel = FRAME_CATALOG[0];

  const [selection, setSelection] = useState<BikeSelection>({
    modelId: firstModel.id,
    size: firstModel.sizes[2]?.size ?? firstModel.sizes[0].size,
  });
  const [components, setComponents] = useState<Components>(DEFAULT_COMPONENTS_BUILDER);
  const [tyreSize, setTyreSize] = useState(DEFAULT_TYRE_SIZE);
  const [riderFit, setRiderFit] = useState<RiderFit>(DEFAULT_RIDER_FIT);
  const [preset, setPreset] = useState<MannequinPresetKey>("endurance");
  const [trunkAngleOverride, setTrunkAngleOverride] = useState<number | null>(null);
  const [hoodPresetId, setHoodPresetId] = useState(HOOD_PRESETS[0].id);
  const [showGeometry, setShowGeometry] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'side' | 'front'>('side');
  const [view3d, setView3d] = useState(false);
  const [geo3d, setGeo3d] = useState<Geometry3DResponse | null>(null);
  const [geo3dLoading, setGeo3dLoading] = useState(false);
  const [geo3dError, setGeo3dError] = useState<string | null>(null);
  // Partial — any unset field falls back to the height-derived default in buildRider.
  // This means height changes still rescale the body unless the user has explicitly
  // overridden a measurement by moving its slider.
  const [bodyMeasurements, setBodyMeasurements] = useState<Partial<BodyMeasurements>>({});
  const [pedalPresetId, setPedalPresetId] = useState<string>(PEDAL_PRESETS[0].id);
  const [shoePresetId, setShoePresetId] = useState<string>(SHOE_PRESETS[0].id);

  const model = getModelById(selection.modelId);
  const sizeData = getSizeData(selection.modelId, selection.size);
  const effectiveFrame = useMemo(
    () => withTyreSize(sizeData.geometry, tyreSize),
    [sizeData.geometry, tyreSize]
  );
  const rider = useMemo(() => buildRider(riderFit, bodyMeasurements), [riderFit, bodyMeasurements]);

  const bike = useMemo(
    () => synthesizeBike(sizeData, effectiveFrame, components),
    [sizeData, effectiveFrame, components]
  );

  const targetTrunkAngleDeg =
    trunkAngleOverride !== null ? trunkAngleOverride : MANNEQUIN_PRESETS[preset].trunkAngleDeg;
  const targetKneeExtension = 180 - riderFit.targetKneeFlexDeg;

  const idealContacts = useMemo(
    () =>
      idealContactsFromRider(
        rider,
        targetKneeExtension,
        targetTrunkAngleDeg,
        components.crank_length,
        effectiveFrame.seat_angle_deg,
        components.bar_width,
        components.pedal_stack_height
      ),
    [rider, targetKneeExtension, targetTrunkAngleDeg, components.crank_length, effectiveFrame.seat_angle_deg, components.bar_width, components.pedal_stack_height]
  );

  // Build mannequin: hip/cleat at actual bike contacts (so seatpost/rail offsets move the body),
  // hands pinned to actual hood position.
  const bikeForMannequin = useMemo(
    () => ({
      ...bike,
      saddle: bike.saddle,
      hoods: bike.hoods,
      cleat: idealContacts.cleat,
    }),
    [bike, idealContacts]
  );
  const mannequin = useMemo(
    () => buildMannequin(bikeForMannequin, rider, preset, targetTrunkAngleDeg, components.bar_width, components.pedal_stack_height),
    [bikeForMannequin, rider, preset, targetTrunkAngleDeg, components.bar_width, components.pedal_stack_height]
  );
  const frontalMannequin = useMemo(
    () => buildFrontalMannequin(mannequin, rider, components.bar_width),
    [mannequin, rider, components.bar_width]
  );

  const warnings = useMemo(() => fitWarnings(idealContacts, bike), [idealContacts, bike]);

  const seatpostRec = useMemo(
    () => seatpostRecommendation(bike.saddle, bike.saddleClamp, components.pedal_stack_height),
    [bike.saddle, bike.saddleClamp, components.pedal_stack_height]
  );

  const barReachNeededValue = useMemo(
    () => barReachNeeded(idealContacts.hoods, bike.barClamp, components.hood_reach_offset),
    [idealContacts.hoods, bike.barClamp, components.hood_reach_offset]
  );

  // Auto-seatpost: when rider body, preset, or saddle_stack changes, back-derive
  // saddle_clamp_offset so the contact point stays at the ideal height.
  useEffect(() => {
    const seatAngle = radiansFromDegrees(effectiveFrame.seat_angle_deg);
    const clampY = idealContacts.saddle.y - components.saddle_stack;
    const offset = clampY / Math.sin(seatAngle);
    setComponents((c) => ({ ...c, saddle_clamp_offset: Math.max(400, Math.min(950, offset)) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderFit.legLength, riderFit.targetKneeFlexDeg, selection.modelId, selection.size, preset, components.saddle_stack, bodyMeasurements?.hipJointOffset, components.pedal_stack_height]);

  // Fetch 3D geometry from API when 3D view is active and inputs change
  useEffect(() => {
    if (!view3d) return;
    let cancelled = false;
    setGeo3dLoading(true);
    const setup = buildSetup({ ...effectiveFrame, wheelbase: sizeData.wheelbase }, components, {
      saddle: idealContacts.saddle,
      hoods: idealContacts.hoods,
      cleat: idealContacts.cleat,
    }, rider);
    setGeo3dError(null);
    fetchGeometry3D(setup)
      .then((data: Geometry3DResponse) => { if (!cancelled) { setGeo3d(data); setGeo3dError(null); } })
      .catch((err: unknown) => { if (!cancelled) setGeo3dError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setGeo3dLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view3d, effectiveFrame, components, rider, idealContacts.saddle.y, idealContacts.saddle.x]);

  const kneeExtension = angleAtPoint(mannequin.hip, mannequin.knee, mannequin.ankle);
  const kneeFlex = 180 - kneeExtension;

  const idealSaddleY = idealContacts.saddle.y;
  const actualSaddleY = bike.saddle.y;
  const seatpostExtension = Math.max(
    0,
    components.saddle_clamp_offset - estimateSeatTubeTopDistance(effectiveFrame)
  );

  const pseudoTargets = {
    saddle: idealContacts.saddle,
    hoods: idealContacts.hoods,
    cleat: idealContacts.cleat,
  };
  const baseBounds = boundsForBikes([bike], pseudoTargets, effectiveFrame.wheel_radius);
  const bounds = expandBoundsForMannequins(baseBounds, [mannequin]);

  // In fullscreen, zoom to the frame+rider area (no wheel-radius padding)
  const activeBounds = useMemo(() => {
    if (!fullscreen) return bounds;
    const pts = [
      bike.bb, bike.seatTubeTop, bike.headTubeBottom, bike.headTubeTop,
      bike.saddle, bike.hoods, bike.cleat, bike.barClamp,
      mannequin.hip, mannequin.knee, mannequin.ankle,
      mannequin.shoulder, mannequin.elbow, mannequin.hands, mannequin.head,
      idealContacts.saddle, idealContacts.hoods,
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs) - 140,
      maxX: Math.max(...xs) + 140,
      minY: Math.min(...ys) - 140,
      maxY: Math.max(...ys) + 100,
    };
  }, [fullscreen, bounds, bike, mannequin, idealContacts]);

  const viewBox = `${activeBounds.minX} ${-activeBounds.maxY} ${activeBounds.maxX - activeBounds.minX} ${activeBounds.maxY - activeBounds.minY}`;
  const groundY = effectiveFrame.wheel_radius - effectiveFrame.bb_drop;

  const sourceModels = FRAME_CATALOG.map((m) => ({ label: `${m.brand} ${m.model}`, value: m.id }));

  const severityColor = (s: "ok" | "warning" | "bad") =>
    s === "ok" ? "var(--teal)" : s === "warning" ? "#d4880a" : "var(--accent)";

  const updateComponent = (key: keyof Components, value: number) =>
    setComponents((c) => ({ ...c, [key]: value }));

  const updateBodyMeasurement = (key: keyof BodyMeasurements, value: number) =>
    setBodyMeasurements((b: Partial<BodyMeasurements>) => ({ ...b, [key]: value }));

  const handlePedalPreset = (id: string) => {
    setPedalPresetId(id);
    const pedal = PEDAL_PRESETS.find((p) => p.id === id)!;
    const shoe = SHOE_PRESETS.find((s) => s.id === shoePresetId)!;
    updateComponent("pedal_stack_height", pedal.stack + shoe.stack);
  };
  const handleShoePreset = (id: string) => {
    setShoePresetId(id);
    const pedal = PEDAL_PRESETS.find((p) => p.id === pedalPresetId)!;
    const shoe = SHOE_PRESETS.find((s) => s.id === id)!;
    updateComponent("pedal_stack_height", pedal.stack + shoe.stack);
  };

  return (
    <div className={`mode-layout mode-layout--builder${fullscreen ? " mode-layout--fullscreen" : ""}`}>

      {/* ── Left panel ── */}
      <aside className="controls-panel controls-panel--dense builder-left" style={{ display: fullscreen ? "none" : undefined }}>

        <CollapsibleSection eyebrow="Frame" title="Select frame">
          <label className="field">
            <span>Model</span>
            <select
              value={selection.modelId}
              onChange={(e) => {
                const m = getModelById(e.target.value);
                setSelection({ modelId: m.id, size: m.sizes[0].size });
              }}
            >
              {sourceModels.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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

        <CollapsibleSection eyebrow="Rider" title="Fit targets">
          <div className="slider-grid slider-grid--compact">
            {(
              [
                ["Height", riderFit.height, 1500, 2050, 5, "height", "mm"],
                ["Leg length", riderFit.legLength, 760, 980, 5, "legLength", "mm"],
                ["Target knee flex", riderFit.targetKneeFlexDeg, 0, 45, 1, "targetKneeFlexDeg", "°"],
              ] as const
            ).map(([label, value, min, max, step, key, unit]) => (
              <label className="slider-card slider-card--target" key={key}>
                <div className="slider-card__header">
                  <span>{label}</span>
                  <strong>{value} {unit}</strong>
                </div>
                <input
                  className="slider-card__input slider-card__input--target"
                  type="range"
                  min={min} max={max} step={step} value={value}
                  onChange={(e) => setRiderFit((r) => ({ ...r, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Rider" title="Body dimensions" defaultOpen={false}>
          <p className="subpanel-note">
            Defaults scale with height. Override with tape-measured values for precision.
          </p>
          <div className="slider-grid slider-grid--compact">
            {(
              [
                ["Shoulder width", Math.round(rider.shoulder_width), 300, 520, 5, "shoulderWidth", "mm"],
                ["Torso length", Math.round(rider.torso_length), 430, 780, 5, "torsoLength", "mm"],
                ["Upper arm", Math.round(rider.upper_arm_length), 220, 420, 5, "upperArmLength", "mm"],
                ["Forearm", Math.round(rider.forearm_length), 190, 360, 5, "forearmLength", "mm"],
              ] as const
            ).map(([label, value, min, max, step, key, unit]) => (
              <label className="slider-card" key={key}>
                <div className="slider-card__header">
                  <span>{label}</span>
                  <strong>{value} {unit}</strong>
                </div>
                <input
                  className="slider-card__input slider-card__input--frame"
                  type="range"
                  min={min} max={max} step={step} value={value}
                  onChange={(e) => updateBodyMeasurement(key as keyof BodyMeasurements, Number(e.target.value))}
                />
              </label>
            ))}
            <label className="slider-card">
              <div className="slider-card__header">
                <span>Saddle–hip joint offset</span>
                <strong>{rider.hip_joint_offset} mm</strong>
              </div>
              <input
                className="slider-card__input slider-card__input--frame"
                type="range"
                min={0} max={130} step={5} value={rider.hip_joint_offset}
                onChange={(e) => updateBodyMeasurement("hipJointOffset", Number(e.target.value))}
              />
            </label>
            <label className="slider-card">
              <div className="slider-card__header">
                <span>Shoe size (EU)</span>
                <strong>EU {Math.round(rider.foot_length / 6.67)}</strong>
              </div>
              <input
                className="slider-card__input slider-card__input--frame"
                type="range"
                min={36} max={48} step={1} value={Math.round(rider.foot_length / 6.67)}
                onChange={(e) => updateBodyMeasurement("footLength", Number(e.target.value) * 6.67)}
              />
            </label>
          </div>
          <button
            className="ghost-button"
            onClick={() => setBodyMeasurements({})}
          >
            Reset to height defaults
          </button>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Posture" title="Riding preset">
          <div className="tab-row">
            {(Object.keys(MANNEQUIN_PRESETS) as MannequinPresetKey[]).map((p) => (
              <button
                key={p}
                className={`tab-pill ${preset === p ? "tab-pill--active" : ""}`}
                onClick={() => { setPreset(p); setTrunkAngleOverride(null); }}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="slider-grid slider-grid--compact" style={{ marginTop: 8 }}>
            <label className="slider-card slider-card--target">
              <div className="slider-card__header">
                <span>Trunk angle</span>
                <strong>{targetTrunkAngleDeg.toFixed(0)}°</strong>
              </div>
              <input
                className="slider-card__input slider-card__input--target"
                type="range"
                min={0} max={70} step={1} value={targetTrunkAngleDeg}
                onChange={(e) => setTrunkAngleOverride(Number(e.target.value))}
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Cockpit" title="Component setup">
          <div className="slider-grid slider-grid--compact">
            {(
              [
                ["Stem length", components.stem_length, 70, 150, 1, "stem_length", "mm"],
                ["Stem angle", components.stem_angle_deg, -17, 17, 1, "stem_angle_deg", "°"],
                ["Spacers", components.spacer_stack, 0, 40, 1, "spacer_stack", "mm"],
                ["Bar reach", components.bar_reach, 65, 105, 1, "bar_reach", "mm"],
                ["Bar width", components.bar_width, 200, 460, 10, "bar_width", "mm"],
              ] as const
            ).map(([label, value, min, max, step, key, unit]) => (
              <label className="slider-card" key={key}>
                <div className="slider-card__header">
                  <span>{label}</span>
                  <strong>{Number(value).toFixed(0)} {unit}</strong>
                </div>
                <input
                  className="slider-card__input slider-card__input--frame"
                  type="range"
                  min={min} max={max} step={step} value={value}
                  onChange={(e) => updateComponent(key as keyof Components, Number(e.target.value))}
                />
              </label>
            ))}
            {/* Hood reach with lever preset inline */}
            <label className="slider-card">
              <div className="slider-card__header">
                <span>Hood reach</span>
                <strong>{components.hood_reach_offset.toFixed(1)} mm</strong>
              </div>
              <div className="preset-row preset-row--inline">
                {HOOD_PRESETS.map((hp) => (
                  <button
                    key={hp.id}
                    className={`preset-pill preset-pill--sm ${hoodPresetId === hp.id ? "preset-pill--active" : ""}`}
                    onClick={() => {
                      setHoodPresetId(hp.id);
                      updateComponent("hood_reach_offset", hp.hoodReachOffset);
                    }}
                  >
                    {hp.label}
                  </button>
                ))}
              </div>
              <input
                className="slider-card__input slider-card__input--frame"
                type="range"
                min={16} max={32} step={0.5} value={components.hood_reach_offset}
                onChange={(e) => updateComponent("hood_reach_offset", Number(e.target.value))}
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Saddle" title="Saddle & seatpost">
          <div className="slider-grid slider-grid--compact">
            {(
              [
                ["Saddle stack", components.saddle_stack, 30, 120, 5, "saddle_stack", "mm"],
                ["Seatpost offset", components.seatpost_offset, -30, 30, 2, "seatpost_offset", "mm"],
                ["Rail offset", components.saddle_rail_offset, -25, 25, 5, "saddle_rail_offset", "mm"],
                ["Tyre size", tyreSize, 25, 38, 1, "__tyre__", "mm"],
                ["Crank length", components.crank_length, 160, 177.5, 2.5, "crank_length", "mm"],
              ] as const
            ).map(([label, value, min, max, step, key, unit]) => (
              <label className="slider-card" key={key}>
                <div className="slider-card__header">
                  <span>{label}</span>
                  <strong>{Number(value).toFixed(step === 2.5 ? 1 : 0)} {unit}</strong>
                </div>
                <input
                  className="slider-card__input slider-card__input--frame"
                  type="range"
                  min={min} max={max} step={step} value={value}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    key === "__tyre__" ? setTyreSize(v) : updateComponent(key as keyof Components, v);
                  }}
                />
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Shoes & Pedals" title="Foot stack" defaultOpen={false}>
          <p className="subpanel-note">
            Affects saddle height — more stack raises the saddle to maintain knee angle.
          </p>
          <div style={{ marginBottom: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Pedal system</div>
            <div className="preset-row">
              {PEDAL_PRESETS.map((pp) => (
                <button
                  key={pp.id}
                  className={`preset-pill preset-pill--sm ${pedalPresetId === pp.id ? "preset-pill--active" : ""}`}
                  title={pp.note}
                  onClick={() => handlePedalPreset(pp.id)}
                >
                  {pp.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Shoe type</div>
            <div className="preset-row">
              {SHOE_PRESETS.map((sp) => (
                <button
                  key={sp.id}
                  className={`preset-pill preset-pill--sm ${shoePresetId === sp.id ? "preset-pill--active" : ""}`}
                  title={sp.note}
                  onClick={() => handleShoePreset(sp.id)}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
          <div className="slider-grid slider-grid--compact">
            <label className="slider-card">
              <div className="slider-card__header">
                <span>Total foot stack</span>
                <strong>{components.pedal_stack_height} mm</strong>
              </div>
              <input
                className="slider-card__input slider-card__input--frame"
                type="range"
                min={0} max={35} step={1} value={components.pedal_stack_height}
                onChange={(e) => {
                  updateComponent("pedal_stack_height", Number(e.target.value));
                  setPedalPresetId("");
                  setShoePresetId("");
                }}
              />
            </label>
            <label className="slider-card">
              <div className="slider-card__header">
                <span>Cleat setback</span>
                <strong>{components.cleat_setback > 0 ? "+" : ""}{components.cleat_setback} mm</strong>
              </div>
              <input
                className="slider-card__input slider-card__input--frame"
                type="range"
                min={-15} max={15} step={1} value={components.cleat_setback}
                onChange={(e) => updateComponent("cleat_setback", Number(e.target.value))}
              />
            </label>
          </div>
        </CollapsibleSection>

      </aside>

      {/* ── Centre: SVG ── */}
      <section className="visual-panel builder-center">
        <div className="panel-header">
          <div>
            <div className="eyebrow eyebrow--light">Fit Builder</div>
            <h2>{model.brand} {model.model} {sizeData.size}</h2>
          </div>
          <div className="legend-row">
            <span><i className="legend-swatch legend-swatch--a" /> Frame</span>
            <span><i className="legend-swatch legend-swatch--target" /> Ideal contacts</span>
            {!view3d && (
              <>
                <button
                  className={`tab-pill ${viewMode === 'side' ? "tab-pill--active" : ""}`}
                  style={{ marginLeft: "auto" }}
                  onClick={() => setViewMode('side')}
                >
                  Side
                </button>
                <button
                  className={`tab-pill ${viewMode === 'front' ? "tab-pill--active" : ""}`}
                  onClick={() => setViewMode('front')}
                >
                  Front
                </button>
              </>
            )}
            <button
              className={`tab-pill ${view3d ? "tab-pill--active" : ""}`}
              style={view3d ? undefined : { marginLeft: "auto" }}
              onClick={() => setView3d((v) => !v)}
            >
              3D
            </button>
            {!view3d && (
              <>
                <button
                  className={`tab-pill ${showFit ? "tab-pill--active" : ""}`}
                  onClick={() => setShowFit((v) => !v)}
                >
                  Fit positions
                </button>
                <button
                  className={`tab-pill ${showGeometry ? "tab-pill--active" : ""}`}
                  onClick={() => setShowGeometry((v) => !v)}
                >
                  Frame geometry
                </button>
              </>
            )}
            <button
              className="tab-pill"
              title={fullscreen ? "Show controls" : "Hide controls"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? "⊠" : "⛶"}
            </button>
          </div>
        </div>

        <div className="visual-stage">
          {view3d ? (
            geo3dError ? (
              <div className="visual-stage__loading visual-stage__loading--error">
                <div>
                  <strong>Could not load 3D geometry</strong>
                  <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{geo3dError}</p>
                  <p style={{ marginTop: 4, fontSize: 12, opacity: 0.5 }}>Is the API running? <code>make api</code></p>
                </div>
              </div>
            ) : geo3dLoading || !geo3d ? (
              <div className="visual-stage__loading">
                {geo3dLoading ? "Loading 3D geometry…" : "Switch to 3D to load"}
              </div>
            ) : (
              <BikeScene3D geo={geo3d} />
            )
          ) : viewMode === 'side' ? (
            <svg viewBox={viewBox} className="geometry-svg">
              <line
                x1={activeBounds.minX} y1={groundY} x2={activeBounds.maxX} y2={groundY}
                className="geometry-ground"
              />

              <g className="geometry-layer geometry-layer--a">
                <circle cx={bike.rearAxle.x} cy={-bike.rearAxle.y} r={effectiveFrame.wheel_radius} className="geometry-tyre" />
                <circle cx={bike.frontAxle.x} cy={-bike.frontAxle.y} r={effectiveFrame.wheel_radius} className="geometry-tyre" />
                <circle cx={bike.rearAxle.x} cy={-bike.rearAxle.y} r={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)} className="geometry-wheel" />
                <circle cx={bike.frontAxle.x} cy={-bike.frontAxle.y} r={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)} className="geometry-wheel" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.crankEnd.x} y2={-bike.crankEnd.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.bb.x} y2={-bike.bb.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.seatTubeTop.x} y2={-bike.seatTubeTop.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.seatTubeTop.x} y2={-bike.seatTubeTop.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.seatTubeTop.x} y1={-bike.seatTubeTop.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.headTubeBottom.x} y2={-bike.headTubeBottom.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.frontAxle.x} y2={-bike.frontAxle.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.seatTubeTop.x} y1={-bike.seatTubeTop.y} x2={bike.seatpostBend.x} y2={-bike.seatpostBend.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.seatpostBend.x} y1={-bike.seatpostBend.y} x2={bike.saddleClamp.x} y2={-bike.saddleClamp.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.steererTop.x} y1={-bike.steererTop.y} x2={bike.barClamp.x} y2={-bike.barClamp.y} className="geometry-frame geometry-frame--cockpit" />
                <line x1={bike.barClamp.x} y1={-bike.barClamp.y} x2={bike.hoods.x} y2={-bike.hoods.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <SaddleShape contact={bike.saddle} clamp={bike.saddleClamp} className="geometry-layer--a" />
                <circle cx={bike.hoods.x} cy={-bike.hoods.y} r={6} className="geometry-node geometry-node--contact" />
                <circle cx={bike.cleat.x} cy={-bike.cleat.y} r={6} className="geometry-node geometry-node--contact" />
              </g>

              {(() => {
                const s = rider.height / 1800;
                // Anatomical ankle joint is ~19% of foot length behind the ball of foot.
                // Used both for shoe collar drawing and as the shank line endpoint.
                const visualAnkleX = bike.cleat.x - rider.foot_length * 0.19 * s;
                return (
                  <g className="geometry-mannequin">
                    {/* ── Foot / shoe ── */}
                    {(() => {
                      const cx    = bike.cleat.x;           // ball-of-foot / cleat / pedal axle
                      const sole  = -bike.cleat.y;          // SVG y at pedal axle
                      const ankSY = -mannequin.ankle.y;     // SVG y at foot stack height above sole
                      const fl    = rider.foot_length;

                      const ankX  = visualAnkleX;           // ankle collar x (behind ball)
                      const heelX = cx - fl * 0.55 * s;    // heel
                      const toeX  = cx + fl * 0.45 * s;    // toe

                      // Shoe outline: heel → sole → toe → upper front → collar (at ankle) → heel counter
                      const d = [
                        `M ${heelX + 8 * s},${sole}`,
                        `L ${toeX - 28 * s},${sole}`,
                        `Q ${toeX},${sole} ${toeX},${sole - 26 * s}`,
                        `L ${toeX - 35 * s},${ankSY + 18 * s}`,
                        `L ${ankX + 14 * s},${ankSY + 6 * s}`,
                        `L ${ankX - 10 * s},${ankSY}`,
                        `L ${heelX + 10 * s},${ankSY + 14 * s}`,
                        'Z',
                      ].join(' ');

                      return (
                        <g>
                          <path
                            d={d}
                            fill="rgba(250,240,226,0.11)"
                            stroke="rgba(250,240,226,0.62)"
                            strokeWidth={Math.round(3.5 * s)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Stack height: dashed line from pedal axle up to ankle joint */}
                          <line
                            x1={cx} y1={sole}
                            x2={ankX} y2={ankSY}
                            stroke="rgba(250,240,226,0.35)"
                            strokeWidth={Math.round(2.5 * s)}
                            strokeDasharray={`${6 * s} ${4 * s}`}
                          />
                          {/* Cleat / pedal axle marker — short accent tick on the sole */}
                          <line
                            x1={cx} y1={sole - 18 * s}
                            x2={cx} y2={sole + 5 * s}
                            stroke="rgba(240,53,0,0.85)"
                            strokeWidth={Math.round(3.5 * s)}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })()}
                    {/* Pelvis: connects saddle contact (ischial tuberosity) to hip joint centre */}
                    <line
                      x1={bike.saddle.x} y1={-bike.saddle.y}
                      x2={mannequin.hip.x} y2={-mannequin.hip.y}
                      className="geometry-mannequin__line"
                      strokeWidth={Math.round(80 * s)}
                      opacity={0.45}
                    />
                    <line x1={mannequin.hip.x} y1={-mannequin.hip.y} x2={mannequin.knee.x} y2={-mannequin.knee.y} className="geometry-mannequin__line" strokeWidth={Math.round(110 * s)} />
                    <line x1={mannequin.knee.x} y1={-mannequin.knee.y} x2={visualAnkleX} y2={-mannequin.ankle.y} className="geometry-mannequin__line" strokeWidth={Math.round(82 * s)} />
                    <line x1={mannequin.hip.x} y1={-mannequin.hip.y} x2={mannequin.shoulder.x} y2={-mannequin.shoulder.y} className="geometry-mannequin__line" strokeWidth={Math.round(175 * s)} />
                    <line x1={mannequin.shoulder.x} y1={-mannequin.shoulder.y} x2={mannequin.elbow.x} y2={-mannequin.elbow.y} className="geometry-mannequin__line" strokeWidth={Math.round(70 * s)} />
                    <line x1={mannequin.elbow.x} y1={-mannequin.elbow.y} x2={mannequin.hands.x} y2={-mannequin.hands.y} className="geometry-mannequin__line" strokeWidth={Math.round(55 * s)} />
                    <line x1={mannequin.shoulder.x} y1={-mannequin.shoulder.y} x2={mannequin.head.x} y2={-mannequin.head.y} className="geometry-mannequin__line" strokeWidth={Math.round(55 * s)} />
                    <circle cx={mannequin.head.x} cy={-mannequin.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                  </g>
                );
              })()}

              {(["saddle", "hoods", "cleat"] as const).map((contact) => {
                const pt = idealContacts[contact];
                return (
                  <g key={contact}>
                    <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" />
                    <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" />
                    <text x={pt.x + 12} y={-pt.y - 12} className="geometry-label geometry-label--target">
                      Ideal {contact}
                    </text>
                  </g>
                );
              })}

              {warnings
                .filter((w) => w.severity !== "ok")
                .map((w) => {
                  const actual =
                    w.contact === "saddle" ? bike.saddle : w.contact === "hoods" ? bike.hoods : bike.cleat;
                  const ideal = idealContacts[w.contact];
                  return (
                    <g key={w.contact}>
                      <line
                        x1={actual.x} y1={-actual.y} x2={ideal.x} y2={-ideal.y}
                        stroke={severityColor(w.severity)}
                        strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7}
                      />
                      <text
                        x={(actual.x + ideal.x) / 2 + 8}
                        y={-((actual.y + ideal.y) / 2)}
                        style={{ fill: severityColor(w.severity), fontSize: 20 }}
                      >
                        {w.distance.toFixed(0)} mm
                      </text>
                    </g>
                  );
                })}

              {showFit && (
                <BikeFitAnnotations bike={bike} barWidth={components.bar_width} />
              )}
              {showGeometry && (
                <BikeGeometryAnnotations bike={bike} frame={effectiveFrame} />
              )}
            </svg>
          ) : (() => {
            const fm = frontalMannequin;
            const halfW = Math.max(rider.shoulder_width, components.bar_width) / 2 + 150;
            const svgTop = -mannequin.head.y - 80;
            const svgH = groundY + mannequin.head.y + 160;
            const frontalViewBox = `${-halfW} ${svgTop} ${halfW * 2} ${svgH}`;
            const s = rider.height / 1800;
            const mline = (x1: number, y1: number, x2: number, y2: number, sw: number) => (
              <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__line" strokeWidth={Math.round(sw * s)} />
            );
            const hipMidY = (fm.hipL.y + fm.hipR.y) / 2;
            const shoulderMidY = (fm.shoulderL.y + fm.shoulderR.y) / 2;
            return (
              <svg viewBox={frontalViewBox} className="geometry-svg">
                <line x1={-halfW} y1={groundY} x2={halfW} y2={groundY} className="geometry-ground" />
                <circle cx={0} cy={0} r={12} fill="rgba(240,53,0,0.35)" />
                <line x1={-components.bar_width / 2} y1={-mannequin.hands.y} x2={components.bar_width / 2} y2={-mannequin.hands.y} className="geometry-mannequin__line" strokeWidth={Math.round(30 * s)} />
                <g className="geometry-mannequin">
                  {/* Legs */}
                  {mline(fm.ankleL.x, fm.ankleL.y, fm.kneeL.x, fm.kneeL.y, 82)}
                  {mline(fm.kneeL.x, fm.kneeL.y, fm.hipL.x, fm.hipL.y, 110)}
                  {mline(fm.ankleR.x, fm.ankleR.y, fm.kneeR.x, fm.kneeR.y, 82)}
                  {mline(fm.kneeR.x, fm.kneeR.y, fm.hipR.x, fm.hipR.y, 110)}
                  {/* Torso trapezoid: wide at shoulders, tapers to hip + ½ thigh width */}
                  {(() => {
                    const thighHalf = Math.round(110 * s) / 2;
                    const pts = [
                      `${fm.shoulderL.x},${-shoulderMidY}`,
                      `${fm.shoulderR.x},${-shoulderMidY}`,
                      `${fm.hipR.x + thighHalf},${-hipMidY}`,
                      `${fm.hipL.x - thighHalf},${-hipMidY}`,
                    ].join(" ");
                    return (
                      <polygon
                        points={pts}
                        fill="rgba(250,240,226,0.14)"
                        stroke="rgba(250,240,226,0.68)"
                        strokeWidth={Math.round(4 * s)}
                        strokeLinejoin="round"
                      />
                    );
                  })()}
                  {/* Arms */}
                  {mline(fm.shoulderL.x, fm.shoulderL.y, fm.elbowL.x, fm.elbowL.y, 70)}
                  {mline(fm.elbowL.x, fm.elbowL.y, fm.handsL.x, fm.handsL.y, 55)}
                  {mline(fm.shoulderR.x, fm.shoulderR.y, fm.elbowR.x, fm.elbowR.y, 70)}
                  {mline(fm.elbowR.x, fm.elbowR.y, fm.handsR.x, fm.handsR.y, 55)}
                  {/* Neck + head */}
                  {mline(0, shoulderMidY, fm.head.x, fm.head.y, 55)}
                  <circle cx={fm.head.x} cy={-fm.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                </g>
              </svg>
            );
          })()}
        </div>
      </section>

      {/* ── Right panel: metrics ── */}
      <aside className="controls-panel controls-panel--dense builder-right" style={{ display: fullscreen ? "none" : undefined }}>

        <CollapsibleSection eyebrow="Fit Analysis" title="Ideal vs actual">
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-card__label">Ideal saddle height</div>
              <div className="metric-card__compare"><strong>{idealSaddleY.toFixed(0)} mm</strong></div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Actual saddle height</div>
              <div className="metric-card__compare"><strong>{actualSaddleY.toFixed(0)} mm</strong></div>
              <div className="metric-card__delta">{(actualSaddleY - idealSaddleY).toFixed(0)} mm vs ideal</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Seatpost extension</div>
              <div className="metric-card__compare"><strong>{seatpostExtension.toFixed(0)} mm</strong></div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Knee flex at BDC</div>
              <div className="metric-card__compare"><strong>{kneeFlex.toFixed(1)}°</strong></div>
              <div className="metric-card__delta">Target {riderFit.targetKneeFlexDeg}°</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Trunk angle</div>
              <div className="metric-card__compare"><strong>{targetTrunkAngleDeg}°</strong></div>
              <div className="metric-card__delta">{PRESET_LABELS[preset]} preset</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Current bar reach</div>
              <div className="metric-card__compare"><strong>{components.bar_reach} mm</strong></div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Bar reach needed</div>
              {barReachNeededValue !== null ? (
                <>
                  <div className="metric-card__compare"><strong>{Math.round(barReachNeededValue)} mm</strong></div>
                  <div className="metric-card__delta">
                    {barReachNeededValue - components.bar_reach >= 0 ? "+" : ""}
                    {Math.round(barReachNeededValue - components.bar_reach)} mm vs current
                  </div>
                </>
              ) : (
                <div className="metric-card__compare" style={{ color: "var(--accent)" }}>
                  <strong>Out of range</strong>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Warnings" title="Contact point match">
          <div className="metric-grid">
            {warnings.map((w) => (
              <div className="metric-card" key={w.contact}>
                <div className="metric-card__label" style={{ textTransform: "capitalize" }}>{w.contact}</div>
                <div className="metric-card__compare" style={{ color: severityColor(w.severity) }}>
                  <strong>
                    {w.severity === "ok"
                      ? `On target (${w.distance.toFixed(0)} mm)`
                      : `${w.distance.toFixed(0)} mm off`}
                  </strong>
                </div>
                {w.severity !== "ok" && (
                  <div className="metric-card__delta">
                    ΔX {w.deltaX.toFixed(0)} mm · ΔY {w.deltaY.toFixed(0)} mm
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Coordinates" title="Contact positions (from BB)" defaultOpen={false}>
          <div className="metric-grid">
            {([
              ["Saddle X", bike.saddle.x],
              ["Saddle Y", bike.saddle.y],
              ["Hoods X",  bike.hoods.x],
              ["Hoods Y",  bike.hoods.y],
              ["Cleat X",  bike.cleat.x],
              ["Cleat Y",  bike.cleat.y],
            ] as [string, number][]).map(([label, value]) => (
              <div className="metric-card" key={label}>
                <div className="metric-card__label">{label}</div>
                <div className="metric-card__compare"><strong>{Math.round(value)} mm</strong></div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Seatpost" title="Seatpost recommendation" defaultOpen={false}>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-card__label">BB to rail distance</div>
              <div className="metric-card__compare">
                <strong>{Math.round(seatpostRec.bbToRailDistance)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Seatpost type</div>
              <div className="metric-card__compare" style={{
                color: seatpostRec.type === "straight"
                  ? "var(--teal)"
                  : seatpostRec.type === "setback"
                  ? "#d4880a"
                  : "var(--accent)"
              }}>
                <strong style={{ textTransform: "capitalize" }}>{seatpostRec.type}</strong>
              </div>
              <div className="metric-card__delta">{seatpostRec.note}</div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Frame" title="Geometry" defaultOpen={false}>
          <div className="metric-grid">
            {[
              ["Stack", `${sizeData.geometry.stack} mm`],
              ["Reach", `${sizeData.geometry.reach} mm`],
              ["Head angle", `${sizeData.geometry.head_angle_deg.toFixed(1)}°`],
              ["Seat angle", `${sizeData.geometry.seat_angle_deg.toFixed(1)}°`],
              ["Chainstay", `${sizeData.geometry.chainstay_length} mm`],
            ].map(([label, value]) => (
              <div className="metric-card" key={String(label)}>
                <div className="metric-card__label">{label}</div>
                <div className="metric-card__compare"><strong>{value}</strong></div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

      </aside>
    </div>
  );
};
