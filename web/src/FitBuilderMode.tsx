import React, { useEffect, useMemo, useRef, useState } from "react";
import { BikeGeometryAnnotations, BikeFitAnnotations } from "./BikeAnnotations";
import {
  FRAME_MEASUREMENT_IDS,
  type FrameMeasurementId,
  type FrameMeasurementVisibility,
} from "./BikeAnnotations";
import { useCatalog } from "./catalog/CatalogContext";
import { Drivetrain2D, JointAngleArc, Wheel2D } from "./components/BikeParts2D";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { HOOD_PRESETS } from "./components/hoodPresets";
import { MetricCard } from "./components/MetricCard";
import { PresetPills } from "./components/PresetPills";
import { SaddleShape } from "./components/SaddleShape";
import { SliderCard } from "./components/SliderCard";
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
  buildMannequin3DPoints,
  buildRider,
  buildSetup,
  exposedSeatpostLength,
  expandBoundsForMannequins,
  fitWarnings,
  idealContactsFromRider,
  idealContactsFromSaddleHeight,
  radiansFromDegrees,
  seatpostRecommendation,
  synthesizeBike,
  withTyreSize,
} from "./geometry";
import type { BikeSelection, Components, FitMode, RiderFit } from "./types";
import { BikeScene3D } from "./BikeScene3D";
import { fetchGeometry3D } from "./api";
import type { Geometry3DResponse } from "./bike3d";

// ── Constants ─────────────────────────────────────────────────────────────────

const PEDAL_PRESETS = [
  { id: "spd-sl", label: "SPD-SL", stack: 6, note: "Shimano 3-bolt" },
  { id: "keo-blade", label: "Look Keo Blade", stack: 7, note: "Look Keo Blade 2" },
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

type RiderVisibilityPart = "legs" | "torso" | "arms" | "head" | "feet" | "contactMarkers";
type RiderVisibility = Record<RiderVisibilityPart, boolean>;

const FRAME_MEASUREMENT_LABELS: Record<FrameMeasurementId, string> = {
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

const RIDER_VISIBILITY_LABELS: Record<RiderVisibilityPart, string> = {
  legs: "Legs",
  torso: "Torso",
  arms: "Arms",
  head: "Head",
  feet: "Feet",
  contactMarkers: "Contacts",
};

const DEFAULT_RIDER_VISIBILITY: RiderVisibility = {
  legs: true,
  torso: true,
  arms: true,
  head: true,
  feet: true,
  contactMarkers: true,
};

const DEFAULT_FRAME_MEASUREMENT_VISIBILITY: FrameMeasurementVisibility = {
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

type ViewKind = "side" | "front" | "3d";
type SummaryTone = "ok" | "warn" | "bad" | "muted";

// ── Tier header: numbers the conceptual flow (rider → posture → hardware) ────

const Tier: React.FC<{
  n: number;
  tone: "frame" | "rider";
  title: string;
  desc: string;
  children: React.ReactNode;
}> = ({ n, tone, title, desc, children }) => (
  <div className={`tier tier--${tone}`}>
    <div className="tier-header">
      <span className="tier-chip">{n}</span>
      <div className="tier-header__text">
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
    </div>
    {children}
  </div>
);

const SummaryRow: React.FC<{
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
    <strong className="fit-summary__value">{value}</strong>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const FitBuilderMode: React.FC = () => {
  const { catalog: FRAME_CATALOG, getModelById, getSizeData } = useCatalog();
  const [selection, setSelection] = useState<BikeSelection>({
    modelId: "specialized-crux",
    size: "52",
  });
  const [components, setComponents] = useState<Components>(DEFAULT_COMPONENTS_BUILDER);
  const [tyreSize, setTyreSize] = useState(DEFAULT_TYRE_SIZE);
  const [riderFit, setRiderFit] = useState<RiderFit>(DEFAULT_RIDER_FIT);
  const [preset, setPreset] = useState<MannequinPresetKey>("endurance");
  const [trunkAngleOverride, setTrunkAngleOverride] = useState<number | null>(35);
  const [backBendOverride, setBackBendOverride] = useState<number | null>(null);
  const [hoodPresetId, setHoodPresetId] = useState<string>(HOOD_PRESETS[0].id);
  const [showFrameGeometry, setShowFrameGeometry] = useState(false);
  const [showFitPositions, setShowFitPositions] = useState(false);
  const [showJointAngles, setShowJointAngles] = useState(true);
  const [riderVisibility, setRiderVisibility] = useState<RiderVisibility>(DEFAULT_RIDER_VISIBILITY);
  const [frameMeasurementVisibility, setFrameMeasurementVisibility] = useState<FrameMeasurementVisibility>(
    DEFAULT_FRAME_MEASUREMENT_VISIBILITY
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ViewKind>("side");
  const [layersOpen, setLayersOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"controls" | "results" | null>(null);
  const [geo3d, setGeo3d] = useState<Geometry3DResponse | null>(null);
  const [geo3dLoading, setGeo3dLoading] = useState(false);
  const [geo3dError, setGeo3dError] = useState<string | null>(null);
  const [geo3dNonce, setGeo3dNonce] = useState(0);
  const layersRef = useRef<HTMLDivElement | null>(null);
  // Partial — any unset field falls back to the height-derived default in buildRider.
  // This means height changes still rescale the body unless the user has explicitly
  // overridden a measurement by moving its slider.
  const [bodyMeasurements, setBodyMeasurements] = useState<Partial<BodyMeasurements>>({
    shoulderWidth: 370,
    upperArmLength: 320,
    forearmLength: 270,
    hipJointOffset: 80,
    footLength: 290,
  });
  const [pedalPresetId, setPedalPresetId] = useState<string>("keo-blade");
  const [shoePresetId, setShoePresetId] = useState<string>(SHOE_PRESETS[0].id);
  const [fitMode, setFitMode] = useState<FitMode>("contact");
  const [targetSaddleHeightMm, setTargetSaddleHeightMm] = useState(700);

  const view3d = view === "3d";

  const model = getModelById(selection.modelId);
  const sizeData = useMemo(
    () => getSizeData(selection.modelId, selection.size),
    [selection.modelId, selection.size]
  );
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
  const backBendDeg =
    backBendOverride !== null ? backBendOverride : MANNEQUIN_PRESETS[preset].backBendDeg;
  const targetKneeExtension = 180 - riderFit.targetKneeFlexDeg;

  const idealContacts = useMemo(
    () => {
      if (fitMode === "saddle_height") {
        return idealContactsFromSaddleHeight(
          rider,
          targetSaddleHeightMm,
          targetTrunkAngleDeg,
          components.crank_length,
          effectiveFrame.seat_angle_deg,
          components.bar_width,
          components.saddle_stack
        );
      }
      return idealContactsFromRider(
        rider,
        targetKneeExtension,
        targetTrunkAngleDeg,
        components.crank_length,
        effectiveFrame.seat_angle_deg,
        components.bar_width,
        components.pedal_stack_height,
        components.saddle_stack
      );
    },
    [fitMode, rider, targetSaddleHeightMm, targetKneeExtension, targetTrunkAngleDeg, components.crank_length, effectiveFrame.seat_angle_deg, components.bar_width, components.pedal_stack_height, components.saddle_stack]
  );

  // Build mannequin: hip/cleat at actual bike contacts (so seatpost/rail offsets move the body),
  // hands pinned to actual hood position.
  const bikeForMannequin = useMemo(
    () => ({
      ...bike,
      saddle: bike.saddle,
      hoods: bike.hoods,
      cleat: bike.cleat,
    }),
    [bike]
  );

  const mannequin = useMemo(
    () => buildMannequin(bikeForMannequin, rider, components.bar_width, components.pedal_stack_height, targetTrunkAngleDeg, backBendDeg),
    [bikeForMannequin, rider, components.bar_width, components.pedal_stack_height, targetTrunkAngleDeg, backBendDeg]
  );
  const frontalMannequin = useMemo(
    () => buildFrontalMannequin(mannequin, rider, components.bar_width),
    [mannequin, rider, components.bar_width]
  );

  const warnings = useMemo(() => fitWarnings(idealContacts, bike), [idealContacts, bike]);

  const seatpostRec = useMemo(
    () => seatpostRecommendation(bike.saddle, bike.saddleClamp),
    [bike.saddle, bike.saddleClamp]
  );

  const barReachNeededValue = useMemo(
    () => barReachNeeded(idealContacts.hoods, bike.barClamp, components.hood_reach_offset),
    [idealContacts.hoods, bike.barClamp, components.hood_reach_offset]
  );

  // Auto-seatpost: keep saddle_clamp_offset in sync with the ideal saddle position.
  // Works for both modes: in knee-flex mode it tracks IK output, in saddle-height mode
  // it tracks the user's target height.
  useEffect(() => {
    const seatAngle = radiansFromDegrees(effectiveFrame.seat_angle_deg);
    const clampY = idealContacts.saddle.y - components.saddle_stack;
    const offset = clampY / Math.sin(seatAngle);
    setComponents((c) => ({ ...c, saddle_clamp_offset: Math.max(400, Math.min(950, offset)) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idealContacts.saddle.y, effectiveFrame.seat_angle_deg, components.saddle_stack]);

  // Fetch 3D geometry from API when 3D view is active and inputs change
  useEffect(() => {
    if (!view3d) return;
    let cancelled = false;
    setGeo3dLoading(true);
    const setup = buildSetup({
      ...effectiveFrame,
      wheelbase: sizeData.wheelbase,
      top_tube_effective: sizeData.top_tube_effective,
    }, components, {
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
  }, [view3d, effectiveFrame, components, rider, idealContacts.saddle.y, idealContacts.saddle.x, idealContacts.hoods.x, idealContacts.hoods.y, geo3dNonce]);

  // Close the layers popover on outside click
  useEffect(() => {
    if (!layersOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (layersRef.current && !layersRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [layersOpen]);

  // Build a 3D mannequin from backend bike contact points + frontend forward kinematics.
  // This ensures the 3D mesh mannequin uses the same trunk angle as the 2D view.
  const mannequin3DData = useMemo(() => {
    if (!geo3d) return null;
    const ptMap = new Map(geo3d.points.map(p => [p.name, p.pos]));
    const saddle3d = ptMap.get("saddle");
    const hoodsL = ptMap.get("hoods_l");
    const hoodsR = ptMap.get("hoods_r");
    const cleatL = ptMap.get("cleat_l");
    if (!saddle3d || !hoodsL || !hoodsR || !cleatL) return null;
    // Build a side-view bike from backend 3D points (use centerline)
    const bike3dSide = {
      ...bike,
      saddle: { x: saddle3d[0], y: saddle3d[1] },
      hoods: { x: (hoodsL[0] + hoodsR[0]) / 2, y: (hoodsL[1] + hoodsR[1]) / 2 },
      cleat: { x: cleatL[0], y: cleatL[1] },
    };
    // Build 2D mannequin with forward kinematics using target trunk angle
    const mannequin2dFor3d = buildMannequin(
      bike3dSide, rider, components.bar_width,
      components.pedal_stack_height, targetTrunkAngleDeg, backBendDeg
    );
    // Bilaterally expand to 3D
    return {
      mannequin2d: mannequin2dFor3d,
      ...buildMannequin3DPoints(mannequin2dFor3d, rider, components),
    };
  }, [geo3d, bike, rider, components, targetTrunkAngleDeg, backBendDeg]);

  const kneeExtension = angleAtPoint(mannequin.hip, mannequin.knee, mannequin.ankle);
  const kneeFlex = 180 - kneeExtension;

  const idealSaddleY = idealContacts.saddle.y;
  const actualSaddleY = bike.saddle.y;
  const bbToSaddleDistance = bike.saddle.y / Math.sin(radiansFromDegrees(effectiveFrame.seat_angle_deg));
  const seatpostExtension = exposedSeatpostLength(bike);

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
      bike.bb, bike.seatCluster, bike.seatTubeTop, bike.headTubeBottom, bike.headTubeTop,
      bike.saddle, bike.hoods, bike.cleat, bike.barClamp,
      mannequin.hip, mannequin.knee, mannequin.ankle,
      mannequin.shoulder, mannequin.elbow, mannequin.wrist, mannequin.hands, mannequin.head,
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

  const brands = useMemo(
    () => Array.from(new Set(FRAME_CATALOG.map((m) => m.brand))).sort(),
    [FRAME_CATALOG]
  );
  const currentBrand = model.brand;
  const modelsForBrand = useMemo(
    () => FRAME_CATALOG.filter((m) => m.brand === currentBrand),
    [FRAME_CATALOG, currentBrand]
  );

  const severityColor = (s: "ok" | "warning" | "bad") =>
    s === "ok" ? "var(--ok)" : s === "warning" ? "var(--warn)" : "var(--bad)";
  // Brighter variants for strokes/labels on the dark visualization canvas
  const severitySvgColor = (s: "ok" | "warning" | "bad") =>
    s === "ok" ? "#4cbf7e" : s === "warning" ? "#e8a33c" : "#e05252";
  const severityTone = (s: "ok" | "warning" | "bad"): SummaryTone =>
    s === "ok" ? "ok" : s === "warning" ? "warn" : "bad";

  const updateComponent = (key: keyof Components, value: number) =>
    setComponents((c) => ({ ...c, [key]: value }));

  const resetComponent = (key: keyof Components) =>
    updateComponent(key, DEFAULT_COMPONENTS_BUILDER[key] as number);

  const handleFitModeChange = (mode: FitMode) => {
    if (mode === "saddle_height" && fitMode === "contact") {
      setTargetSaddleHeightMm(Math.round(idealContacts.saddle.y));
    }
    setFitMode(mode);
  };

  const updateBodyMeasurement = (key: keyof BodyMeasurements, value: number) =>
    setBodyMeasurements((b: Partial<BodyMeasurements>) => ({ ...b, [key]: value }));

  const toggleRiderVisibility = (part: RiderVisibilityPart) =>
    setRiderVisibility((current) => ({ ...current, [part]: !current[part] }));

  const setAllRiderVisibility = (value: boolean) =>
    setRiderVisibility({
      legs: value,
      torso: value,
      arms: value,
      head: value,
      feet: value,
      contactMarkers: value,
    });

  const toggleFrameMeasurement = (measurement: FrameMeasurementId) =>
    setFrameMeasurementVisibility((current) => ({ ...current, [measurement]: !current[measurement] }));

  const setAllFrameMeasurements = (value: boolean) =>
    setFrameMeasurementVisibility({
      stack: value,
      reach: value,
      effectiveTopTube: value,
      headTubeLength: value,
      headTubeAngle: value,
      seatTubeAngle: value,
      seatTubeLength: value,
      bbDrop: value,
      chainstay: value,
      wheelbase: value,
      forkLength: value,
      forkOffset: value,
    });

  const frameGeometryRows = [
    ["Stack", `${sizeData.geometry.stack} mm`],
    ["Reach", `${sizeData.geometry.reach} mm`],
    ["Head angle", `${sizeData.geometry.head_angle_deg.toFixed(1)}°`],
    ["Seat angle", `${sizeData.geometry.seat_angle_deg.toFixed(1)}°`],
    ["BB drop", `${sizeData.geometry.bb_drop} mm`],
    ["Chainstay", `${sizeData.geometry.chainstay_length} mm`],
    ["Fork length", `${sizeData.geometry.fork_length} mm`],
    ["Fork offset", `${sizeData.geometry.fork_offset} mm`],
    ["Wheel radius", `${sizeData.geometry.wheel_radius} mm`],
    ["Wheelbase", sizeData.wheelbase != null ? `${sizeData.wheelbase} mm` : null],
    ["Seat tube C-T", sizeData.geometry.seat_tube_ct != null ? `${Math.round(sizeData.geometry.seat_tube_ct)} mm` : null],
    ["Head tube", sizeData.geometry.head_tube != null ? `${sizeData.geometry.head_tube} mm` : null],
    ["Front center", sizeData.front_center != null ? `${sizeData.front_center} mm` : null],
    ["Trail", sizeData.trail != null ? `${sizeData.trail} mm` : null],
    ["Effective top tube", sizeData.top_tube_effective != null ? `${sizeData.top_tube_effective} mm` : null],
    ["Standover", sizeData.standover != null ? `${sizeData.standover} mm` : null],
    ["BB height", sizeData.bb_height != null ? `${sizeData.bb_height} mm` : null],
  ].filter((row): row is [string, string] => row[1] !== null);

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

  // ── Fit summary (headline numbers + status) ────────────────────────────────
  const saddleWarning = warnings.find((w) => w.contact === "saddle");
  const hoodsWarning = warnings.find((w) => w.contact === "hoods");
  const saddleDelta = actualSaddleY - idealSaddleY;
  const kneeFlexDelta = kneeFlex - riderFit.targetKneeFlexDeg;
  const kneeTone: SummaryTone =
    fitMode === "saddle_height"
      ? "muted"
      : Math.abs(kneeFlexDelta) <= 2
      ? "ok"
      : Math.abs(kneeFlexDelta) <= 5
      ? "warn"
      : "bad";
  const barReachDelta = barReachNeededValue !== null ? barReachNeededValue - components.bar_reach : null;
  const barReachTone: SummaryTone =
    barReachDelta === null ? "bad" : Math.abs(barReachDelta) <= 3 ? "ok" : Math.abs(barReachDelta) <= 10 ? "warn" : "bad";
  const issueCount = warnings.filter((w) => w.severity !== "ok").length;

  const viewOptions: Array<{ id: ViewKind; label: string }> = [
    { id: "side", label: "Side" },
    { id: "front", label: "Front" },
    { id: "3d", label: "3D" },
  ];

  const controlPanels = (
    <>
      {/* ── Left panel ── */}
      <aside
        className={`controls-panel controls-panel--dense builder-left${mobilePanel === "controls" ? " mobile-open" : ""}`}
        style={{ display: fullscreen ? "none" : undefined }}
      >
        <Tier n={1} tone="rider" title="Rider" desc="Who is being fitted">
          <CollapsibleSection eyebrow="Rider" title="Fit targets">
            <div className="seg-control" role="tablist" aria-label="Fit target mode">
              <button
                role="tab"
                aria-selected={fitMode === "contact"}
                className={`seg-control__btn${fitMode === "contact" ? " seg-control__btn--active" : ""}`}
                onClick={() => handleFitModeChange("contact")}
              >
                Knee flex
              </button>
              <button
                role="tab"
                aria-selected={fitMode === "saddle_height"}
                className={`seg-control__btn${fitMode === "saddle_height" ? " seg-control__btn--active" : ""}`}
                onClick={() => handleFitModeChange("saddle_height")}
              >
                Saddle height
              </button>
            </div>
            <p className="subpanel-note subpanel-note--tight">
              {fitMode === "contact"
                ? `Saddle height follows knee flex → ${idealSaddleY.toFixed(0)} mm`
                : `Knee flex follows saddle height → ${kneeFlex.toFixed(1)}°`}
            </p>
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
              <SliderCard
                label="Body weight"
                value={`${riderFit.weight} kg`}
                min={40} max={130} step={1}
                sliderValue={riderFit.weight}
                variant="target"
                onChange={(v) => setRiderFit((f) => ({ ...f, weight: v }))}
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
                min={-10} max={30} step={1}
                sliderValue={backBendDeg}
                variant="target"
                onChange={setBackBendOverride}
                onReset={() => setBackBendOverride(null)}
              />
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
            </div>
          </CollapsibleSection>

          <CollapsibleSection eyebrow="Saddle" title="Saddle & seatpost">
            <div className="slider-grid slider-grid--compact">
              {(
                [
                  ["Saddle stack", components.saddle_stack, 30, 120, 5, "saddle_stack", "mm"],
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
  );

  const metricsPanel = (
    <aside
      className={`controls-panel controls-panel--dense builder-right${mobilePanel === "results" ? " mobile-open" : ""}`}
      style={{ display: fullscreen ? "none" : undefined }}
    >
      {/* ── Fit summary: the numbers that matter, always visible ── */}
      <div className="fit-summary">
        <div className="fit-summary__header">
          <div>
            <div className="eyebrow">Fit summary</div>
            <h3>At a glance</h3>
          </div>
          {issueCount > 0 ? (
            <span className="warn-chip">{issueCount} issue{issueCount === 1 ? "" : "s"}</span>
          ) : (
            <span className="warn-chip warn-chip--ok">All on target</span>
          )}
        </div>
        <SummaryRow
          label="Saddle height"
          value={`${actualSaddleY.toFixed(0)} mm`}
          caption={`${saddleDelta >= 0 ? "+" : ""}${saddleDelta.toFixed(0)} mm vs ideal ${idealSaddleY.toFixed(0)}`}
          tone={saddleWarning ? severityTone(saddleWarning.severity) : "muted"}
        />
        <SummaryRow
          label="Knee flex at BDC"
          value={`${kneeFlex.toFixed(1)}°`}
          caption={
            fitMode === "contact"
              ? `target ${riderFit.targetKneeFlexDeg}°`
              : "follows saddle height"
          }
          tone={kneeTone}
        />
        <SummaryRow
          label="Hoods position"
          value={
            hoodsWarning
              ? hoodsWarning.severity === "ok"
                ? "On target"
                : `${hoodsWarning.distance.toFixed(0)} mm off`
              : "—"
          }
          caption={
            hoodsWarning && hoodsWarning.severity !== "ok"
              ? `ΔX ${hoodsWarning.deltaX.toFixed(0)} · ΔY ${hoodsWarning.deltaY.toFixed(0)} mm`
              : undefined
          }
          tone={hoodsWarning ? severityTone(hoodsWarning.severity) : "muted"}
        />
        <SummaryRow
          label="Bar reach"
          value={barReachNeededValue !== null ? `${Math.round(barReachNeededValue)} mm needed` : "Out of range"}
          caption={
            barReachDelta !== null
              ? `${barReachDelta >= 0 ? "+" : ""}${Math.round(barReachDelta)} mm vs current ${components.bar_reach}`
              : undefined
          }
          tone={barReachTone}
        />
      </div>

      <CollapsibleSection eyebrow="Fit Analysis" title="Ideal vs actual" defaultOpen={false}>
        <div className="metric-grid">
          <MetricCard
            title="Measured vertically from the centre of the bottom bracket axle to the top of the saddle surface. This is the height that gives your target knee flex angle at bottom dead centre."
            label={fitMode === "saddle_height" ? "Target saddle height" : "Ideal saddle height"}
            value={`${idealSaddleY.toFixed(0)} mm`}
          />
          <MetricCard
            title="Current saddle height based on your seatpost and saddle stack settings. Measured vertically from the centre of the bottom bracket axle to the top of the saddle surface."
            label="Actual saddle height"
            value={`${actualSaddleY.toFixed(0)} mm`}
            delta={`${saddleDelta.toFixed(0)} mm vs ideal`}
          />
          <MetricCard
            title="Distance measured along the seat tube from the centre of the bottom bracket axle to the top of the saddle surface. This matches the standard tape measurement a bike fitter takes."
            label="BB to saddle"
            value={`${Math.round(bbToSaddleDistance)} mm`}
          />
          <MetricCard
            title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper."
            label="Seatpost extension"
            value={`${seatpostExtension.toFixed(0)} mm`}
          />
          <MetricCard
            label="Knee flex at BDC"
            value={`${kneeFlex.toFixed(1)}°`}
            delta={fitMode === "contact" ? `Target ${riderFit.targetKneeFlexDeg}°` : undefined}
          />
          <MetricCard
            label="Trunk angle"
            value={`${targetTrunkAngleDeg}°`}
            delta={`${PRESET_LABELS[preset]} preset`}
          />
          <MetricCard label="Current bar reach" value={`${components.bar_reach} mm`} />
          {barReachNeededValue !== null ? (
            <MetricCard
              label="Bar reach needed"
              value={`${Math.round(barReachNeededValue)} mm`}
              delta={`${barReachNeededValue - components.bar_reach >= 0 ? "+" : ""}${Math.round(barReachNeededValue - components.bar_reach)} mm vs current`}
            />
          ) : (
            <MetricCard label="Bar reach needed" value="Out of range" color="var(--bad)" />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Warnings" title="Contact point match">
        <div className="metric-grid">
          {warnings.map((w) => (
            <MetricCard
              key={w.contact}
              label={w.contact}
              labelStyle={{ textTransform: "capitalize" }}
              value={w.severity === "ok" ? `On target (${w.distance.toFixed(0)} mm)` : `${w.distance.toFixed(0)} mm off`}
              color={severityColor(w.severity)}
              delta={
                w.severity !== "ok"
                  ? `ΔX ${w.deltaX.toFixed(0)} mm · ΔY ${w.deltaY.toFixed(0)} mm`
                  : undefined
              }
            />
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
            <MetricCard key={label} label={label} value={`${Math.round(value)} mm`} />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Seatpost" title="Seatpost recommendation" defaultOpen={false}>
        <div className="metric-grid">
          <MetricCard
            label="BB to rail distance"
            value={`${Math.round(seatpostRec.bbToRailDistance)} mm`}
          />
          <MetricCard
            label="Seatpost type"
            value={<span style={{ textTransform: "capitalize" }}>{seatpostRec.type}</span>}
            color={
              seatpostRec.type === "straight"
                ? "var(--ok)"
                : seatpostRec.type === "setback"
                ? "var(--warn)"
                : "var(--bad)"
            }
            delta={seatpostRec.note}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Frame" title="Geometry" defaultOpen={false}>
        <div className="metric-grid">
          {frameGeometryRows.map(([label, value]) => (
            <MetricCard key={label} label={label} value={value} />
          ))}
        </div>
      </CollapsibleSection>
    </aside>
  );

  return (
    <div className={`mode-layout mode-layout--builder${fullscreen ? " mode-layout--fullscreen" : ""}`}>

      {controlPanels}

      {/* ── Centre: visualization ── */}
      <section className="visual-panel builder-center">
        <div className="panel-header">
          <div>
            <div className="eyebrow eyebrow--light">Fit Builder</div>
            <h2>{model.brand} {model.model} {sizeData.size}</h2>
          </div>
          <div className="viz-toolbar">
            <div className="seg-control seg-control--dark" role="tablist" aria-label="View">
              {viewOptions.map((opt) => (
                <button
                  key={opt.id}
                  role="tab"
                  aria-selected={view === opt.id}
                  className={`seg-control__btn${view === opt.id ? " seg-control__btn--active" : ""}`}
                  onClick={() => setView(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!view3d && (
              <div className="layers-anchor" ref={layersRef}>
                <button
                  className={`tab-pill tab-pill--visual${layersOpen ? " tab-pill--active" : ""}`}
                  aria-expanded={layersOpen}
                  onClick={() => setLayersOpen((v) => !v)}
                >
                  Layers ▾
                </button>
                {layersOpen && (
                  <div className="layers-popover">
                    <div className="overlay-drawer__section">
                      <div className="overlay-drawer__header">
                        <span>Rider</span>
                        <div className="overlay-drawer__actions">
                          <button className="overlay-chip overlay-chip--action" onClick={() => setAllRiderVisibility(true)}>All</button>
                          <button className="overlay-chip overlay-chip--action" onClick={() => setAllRiderVisibility(false)}>None</button>
                        </div>
                      </div>
                      <div className="overlay-chip-row">
                        {(["legs", "torso", "arms", "head", "feet", "contactMarkers"] as RiderVisibilityPart[]).map((part) => (
                          <button
                            key={part}
                            className={`overlay-chip ${riderVisibility[part] ? "overlay-chip--active" : ""}`}
                            onClick={() => toggleRiderVisibility(part)}
                          >
                            {RIDER_VISIBILITY_LABELS[part]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overlay-drawer__section">
                      <div className="overlay-drawer__header">
                        <span>Annotations</span>
                      </div>
                      <div className="overlay-chip-row">
                        <button
                          className={`overlay-chip ${showJointAngles ? "overlay-chip--active" : ""}`}
                          onClick={() => setShowJointAngles((v) => !v)}
                        >
                          Joint angles
                        </button>
                        <button
                          className={`overlay-chip ${showFitPositions ? "overlay-chip--active" : ""}`}
                          onClick={() => setShowFitPositions((v) => !v)}
                        >
                          Fit positions
                        </button>
                        <button
                          className={`overlay-chip ${showFrameGeometry ? "overlay-chip--active" : ""}`}
                          onClick={() => setShowFrameGeometry((v) => !v)}
                        >
                          Frame geometry
                        </button>
                      </div>
                    </div>
                    {showFrameGeometry && (
                      <div className="overlay-drawer__section">
                        <div className="overlay-drawer__header">
                          <span>Frame measurements</span>
                          <div className="overlay-drawer__actions">
                            <button className="overlay-chip overlay-chip--action" onClick={() => setAllFrameMeasurements(true)}>All</button>
                            <button className="overlay-chip overlay-chip--action" onClick={() => setAllFrameMeasurements(false)}>None</button>
                          </div>
                        </div>
                        <div className="overlay-chip-row">
                          {FRAME_MEASUREMENT_IDS.map((measurement) => {
                            if (measurement === "seatTubeLength" && sizeData.geometry.seat_tube_ct == null) {
                              return null;
                            }
                            return (
                              <button
                                key={measurement}
                                className={`overlay-chip ${frameMeasurementVisibility[measurement] ? "overlay-chip--active" : ""}`}
                                onClick={() => toggleFrameMeasurement(measurement)}
                              >
                                {FRAME_MEASUREMENT_LABELS[measurement]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              className="tab-pill tab-pill--visual"
              title={fullscreen ? "Show controls" : "Hide controls"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? "⊠" : "⛶"}
            </button>
          </div>
        </div>

        {!view3d && (
          <div className="legend-row">
            <span><i className="legend-swatch legend-swatch--a" /> Frame</span>
            <span><i className="legend-swatch legend-swatch--target" /> Ideal contacts</span>
          </div>
        )}

        <div className="visual-stage">
          {view3d ? (
            geo3dError ? (
              <div className="visual-stage__loading visual-stage__loading--error">
                <div>
                  <strong>Could not load 3D geometry</strong>
                  <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{geo3dError}</p>
                  <p style={{ marginTop: 4, fontSize: 12, opacity: 0.5 }}>Is the API running? <code>make api</code></p>
                  <button
                    className="tab-pill tab-pill--visual"
                    style={{ marginTop: 12 }}
                    onClick={() => setGeo3dNonce((n) => n + 1)}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : geo3dLoading || !geo3d ? (
              <div className="visual-stage__loading">
                <div className="viz-skeleton">
                  <span className="viz-skeleton__pulse" />
                  {geo3dLoading ? "Loading 3D geometry…" : "Switch to 3D to load"}
                </div>
              </div>
            ) : (
              <BikeScene3D
                geo={geo3d}
                mannequin2D={mannequin3DData?.mannequin2d ?? mannequin}
                mannequin3DOverride={mannequin3DData ?? undefined}
                weightKg={riderFit.weight}
              />
            )
          ) : view === "side" ? (
            <svg viewBox={viewBox} className="geometry-svg">
              <line
                x1={activeBounds.minX} y1={groundY} x2={activeBounds.maxX} y2={groundY}
                className="geometry-ground"
              />

              <g className="geometry-layer geometry-layer--a">
                <Wheel2D
                  axle={bike.rearAxle}
                  tyreRadius={effectiveFrame.wheel_radius}
                  rimRadius={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)}
                />
                <Wheel2D
                  axle={bike.frontAxle}
                  tyreRadius={effectiveFrame.wheel_radius}
                  rimRadius={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)}
                />
                <Drivetrain2D bb={bike.bb} crankEnd={bike.crankEnd} />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.bb.x} y2={-bike.bb.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.seatCluster.x} y2={-bike.seatCluster.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.seatCluster.x} y2={-bike.seatCluster.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.seatCluster.x} y1={-bike.seatCluster.y} x2={bike.seatTubeTop.x} y2={-bike.seatTubeTop.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.seatCluster.x} y1={-bike.seatCluster.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.headTubeBottom.x} y2={-bike.headTubeBottom.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.frontAxle.x} y2={-bike.frontAxle.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.seatTubeTop.x} y1={-bike.seatTubeTop.y} x2={bike.seatpostBend.x} y2={-bike.seatpostBend.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.seatpostBend.x} y1={-bike.seatpostBend.y} x2={bike.seatpostTop.x} y2={-bike.seatpostTop.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.steererTop.x} y1={-bike.steererTop.y} x2={bike.barClamp.x} y2={-bike.barClamp.y} className="geometry-frame geometry-frame--cockpit" />
                <line x1={bike.barClamp.x} y1={-bike.barClamp.y} x2={bike.hoods.x} y2={-bike.hoods.y} className="geometry-frame geometry-frame--cockpit-thin" />
                {/* Tube-junction dots so the frame reads as welded tubes, not a wireframe */}
                {[bike.bb, bike.seatCluster, bike.headTubeTop, bike.headTubeBottom, bike.rearAxle, bike.frontAxle, bike.barClamp].map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={-pt.y} r={6} className="geometry-joint" />
                ))}
                <SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className="geometry-layer--a" />
                {riderVisibility.contactMarkers && (
                  <>
                    <circle cx={bike.hoods.x} cy={-bike.hoods.y} r={6} className="geometry-node geometry-node--contact" />
                    <circle cx={bike.cleat.x} cy={-bike.cleat.y} r={6} className="geometry-node geometry-node--contact" />
                  </>
                )}
              </g>

              {(() => {
                const s = rider.height / 1800;
                // Anatomical ankle joint is ~19% of foot length behind the ball of foot.
                // Used both for shoe collar drawing and as the shank line endpoint.
                const visualAnkleX = bike.cleat.x - rider.foot_length * 0.19 * s;
                // Two-tone limb: a wider low-opacity underlay gives the stick figure volume
                const bodyLine = (x1: number, y1: number, x2: number, y2: number, sw: number) => (
                  <g>
                    <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__flesh" strokeWidth={Math.round(sw * 1.35 * s)} />
                    <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__line" strokeWidth={Math.round(sw * s)} />
                  </g>
                );
                return (
                  <g className="geometry-mannequin">
                    {/* ── Foot / shoe ── */}
                    {riderVisibility.feet && (() => {
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
                    {riderVisibility.torso && (
                      <>
                        <line
                          x1={bike.saddle.x} y1={-bike.saddle.y}
                          x2={mannequin.hip.x} y2={-mannequin.hip.y}
                          className="geometry-mannequin__line"
                          strokeWidth={Math.round(80 * s)}
                          opacity={0.45}
                        />
                        {/* Lower torso: hip → spine joint */}
                        {bodyLine(mannequin.hip.x, mannequin.hip.y, mannequin.spineJoint.x, mannequin.spineJoint.y, 160)}
                        {/* Upper torso: spine joint → shoulder */}
                        {bodyLine(mannequin.spineJoint.x, mannequin.spineJoint.y, mannequin.shoulder.x, mannequin.shoulder.y, 175)}
                      </>
                    )}
                    {riderVisibility.legs && (
                      <>
                        {bodyLine(mannequin.hip.x, mannequin.hip.y, mannequin.knee.x, mannequin.knee.y, 110)}
                        {bodyLine(mannequin.knee.x, mannequin.knee.y, visualAnkleX, mannequin.ankle.y, 82)}
                      </>
                    )}
                    {riderVisibility.arms && (
                      <>
                        {bodyLine(mannequin.shoulder.x, mannequin.shoulder.y, mannequin.elbow.x, mannequin.elbow.y, 70)}
                        {bodyLine(mannequin.elbow.x, mannequin.elbow.y, mannequin.wrist.x, mannequin.wrist.y, 55)}
                        {bodyLine(mannequin.wrist.x, mannequin.wrist.y, mannequin.hands.x, mannequin.hands.y, 45)}
                      </>
                    )}
                    {riderVisibility.head && (
                      <>
                        {/* Neck: shoulder → neck base */}
                        {bodyLine(mannequin.shoulder.x, mannequin.shoulder.y, mannequin.neckBase.x, mannequin.neckBase.y, 55)}
                        {/* Neck → head */}
                        {bodyLine(mannequin.neckBase.x, mannequin.neckBase.y, mannequin.head.x, mannequin.head.y, 45)}
                        <circle cx={mannequin.head.x} cy={-mannequin.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                      </>
                    )}
                  </g>
                );
              })()}

              {/* ── On-figure joint angle arcs, color-coded by constraint status ── */}
              {showJointAngles && (
                <g>
                  <JointAngleArc
                    joint={mannequin.knee}
                    a={mannequin.hip}
                    b={{ x: bike.cleat.x - rider.foot_length * 0.19 * (rider.height / 1800), y: mannequin.ankle.y }}
                    label={`Knee ${kneeFlex.toFixed(0)}° flex`}
                    color={
                      kneeTone === "ok" ? "#4cbf7e" : kneeTone === "warn" ? "#e8a33c" : kneeTone === "bad" ? "#e05252" : "rgba(250, 240, 226, 0.85)"
                    }
                  />
                  <JointAngleArc
                    joint={mannequin.hip}
                    a={mannequin.shoulder}
                    b={{ x: mannequin.hip.x + 300, y: mannequin.hip.y }}
                    label={`Trunk ${targetTrunkAngleDeg.toFixed(0)}°`}
                    color="#5fb8c4"
                    radius={90}
                    labelRadiusFactor={1.35}
                  />
                  <JointAngleArc
                    joint={mannequin.elbow}
                    a={mannequin.shoulder}
                    b={mannequin.wrist}
                    label={`Elbow ${(180 - angleAtPoint(mannequin.shoulder, mannequin.elbow, mannequin.wrist)).toFixed(0)}°`}
                    color="rgba(250, 240, 226, 0.75)"
                    radius={52}
                  />
                </g>
              )}

              {riderVisibility.contactMarkers && (["saddle", "hoods", "cleat"] as const).map((contact) => {
                const pt = idealContacts[contact];
                const w = warnings.find((warning) => warning.contact === contact);
                const crossStyle =
                  w && w.severity !== "ok"
                    ? { stroke: w.severity === "warning" ? "#e8a33c" : "#e05252" }
                    : undefined;
                return (
                  <g key={contact}>
                    <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" style={crossStyle} />
                    <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" style={crossStyle} />
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
                        stroke={severitySvgColor(w.severity)}
                        strokeWidth={1.5} strokeDasharray="5 3" opacity={0.8}
                      />
                      <text
                        x={(actual.x + ideal.x) / 2 + 8}
                        y={-((actual.y + ideal.y) / 2)}
                        className="geometry-label"
                        style={{ fill: severitySvgColor(w.severity), fontSize: 20 }}
                      >
                        {w.distance.toFixed(0)} mm
                      </text>
                    </g>
                  );
                })}

              {showFitPositions && (
                <BikeFitAnnotations bike={bike} barWidth={components.bar_width} />
              )}
              {showFrameGeometry && (
                <BikeGeometryAnnotations
                  bike={bike}
                  frame={effectiveFrame}
                  sizeData={sizeData}
                  visibleMeasurements={frameMeasurementVisibility}
                />
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
                <line x1={-components.bar_width / 2} y1={-mannequin.hands.y} x2={components.bar_width / 2} y2={-mannequin.hands.y} className="geometry-mannequin__line" strokeWidth={Math.round(30 * s)} opacity={0.4} />
                <g className="geometry-mannequin">
                  {/* Legs */}
                  {riderVisibility.legs && (
                    <>
                      {mline(fm.ankleL.x, fm.ankleL.y, fm.kneeL.x, fm.kneeL.y, 82)}
                      {mline(fm.kneeL.x, fm.kneeL.y, fm.hipL.x, fm.hipL.y, 110)}
                      {mline(fm.ankleR.x, fm.ankleR.y, fm.kneeR.x, fm.kneeR.y, 82)}
                      {mline(fm.kneeR.x, fm.kneeR.y, fm.hipR.x, fm.hipR.y, 110)}
                    </>
                  )}
                  {/* Torso trapezoid: wide at shoulders, tapers to hip + ½ thigh width */}
                  {riderVisibility.torso && (() => {
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
                  {riderVisibility.arms && (
                    <>
                      {mline(fm.shoulderL.x, fm.shoulderL.y, fm.elbowL.x, fm.elbowL.y, 70)}
                      {mline(fm.elbowL.x, fm.elbowL.y, fm.handsL.x, fm.handsL.y, 55)}
                      {mline(fm.shoulderR.x, fm.shoulderR.y, fm.elbowR.x, fm.elbowR.y, 70)}
                      {mline(fm.elbowR.x, fm.elbowR.y, fm.handsR.x, fm.handsR.y, 55)}
                    </>
                  )}
                  {/* Neck + head */}
                  {riderVisibility.head && (
                    <>
                      {mline(0, shoulderMidY, fm.head.x, fm.head.y, 55)}
                      <circle cx={fm.head.x} cy={-fm.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                    </>
                  )}
                </g>
              </svg>
            );
          })()}
        </div>
      </section>

      {metricsPanel}

      {/* ── Mobile: bottom bar toggling controls/results sheets ── */}
      <div className="builder-mobilebar">
        <button
          className={`builder-mobilebar__btn${mobilePanel === "controls" ? " builder-mobilebar__btn--active" : ""}`}
          onClick={() => setMobilePanel((p) => (p === "controls" ? null : "controls"))}
        >
          Controls
        </button>
        <button
          className={`builder-mobilebar__btn${mobilePanel === "results" ? " builder-mobilebar__btn--active" : ""}`}
          onClick={() => setMobilePanel((p) => (p === "results" ? null : "results"))}
        >
          Results{issueCount > 0 ? ` (${issueCount})` : ""}
        </button>
      </div>
    </div>
  );
};
