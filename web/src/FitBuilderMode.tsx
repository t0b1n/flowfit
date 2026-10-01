import React, { useEffect, useMemo, useRef, useState } from "react";
import { type FrameMeasurementId, type FrameMeasurementVisibility } from "./BikeAnnotations";
import { useCatalog } from "./catalog/CatalogContext";
import { HOOD_PRESETS } from "./components/hoodPresets";
import { DEFAULT_RIDER_FIT, DEFAULT_TYRE_SIZE, MANNEQUIN_PRESETS, MannequinPresetKey, BodyMeasurements, angleAtPoint, barReachNeeded, boundsForBikes, buildFrontalMannequin, buildGeometry3D, buildMannequin, buildRider, exposedSeatpostLength, expandBoundsForMannequins, fitWarnings, idealContactsFromRider, idealContactsFromSaddleHeight, radiansFromDegrees, seatpostRecommendation, solvePedalStroke, synthesizeBike, withTyreSize, POSTURE_PRESET, type BandStatus } from "./geometry";
import type { BikeSelection, Components, FitMode, RiderFit } from "./types";
import { BikeScene3D } from "./BikeScene3D";
import { ControlsColumn } from "./builder/ControlsColumn";
import { ResultsColumn } from "./builder/ResultsColumn";
import { StageToolbar } from "./builder/StageToolbar";
import { Stage2DSide } from "./builder/Stage2DSide";
import { DEFAULT_COMPONENTS_BUILDER, RiderVisibility, DEFAULT_RIDER_VISIBILITY, DEFAULT_FRAME_MEASUREMENT_VISIBILITY, ViewKind, SHOE_PRESETS, SummaryTone, RiderVisibilityPart, PEDAL_PRESETS } from "./builder/shared";
import { Stage2DFront } from "./builder/Stage2DFront";


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

  // Stroke metrics for the metric grid and the 3D pedaling animation —
  // solved from the 2D mannequin hip against the displayed bike.
  const strokeMetrics = useMemo(
    () =>
      solvePedalStroke(
        mannequin.hip,
        bike.bb,
        components.crank_length,
        components.cleat_setback,
        components.pedal_stack_height,
        rider
      ),
    [mannequin.hip, bike.bb, components.crank_length, components.cleat_setback, components.pedal_stack_height, rider]
  );

  // 3D scene graph, derived from the same bike/mannequin the 2D view renders
  // — no fetch, and the two views cannot diverge.
  const geo3d = useMemo(
    () => buildGeometry3D(effectiveFrame, components, rider, bike, mannequin, strokeMetrics),
    [effectiveFrame, components, rider, bike, mannequin, strokeMetrics]
  );

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

  const bandColor = (s: BandStatus) =>
    s === "in" ? "var(--teal)" : s === "near" ? "#d4880a" : "var(--accent)";

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

  const controlPanels = <ControlsColumn mobilePanel={mobilePanel} fullscreen={fullscreen} fitMode={fitMode} handleFitModeChange={handleFitModeChange} idealSaddleY={idealSaddleY} kneeFlex={kneeFlex} riderFit={riderFit} setRiderFit={setRiderFit} targetSaddleHeightMm={targetSaddleHeightMm} setTargetSaddleHeightMm={setTargetSaddleHeightMm} rider={rider} updateBodyMeasurement={updateBodyMeasurement} setBodyMeasurements={setBodyMeasurements} trunkAngleOverride={trunkAngleOverride} backBendOverride={backBendOverride} preset={preset} setPreset={setPreset} setTrunkAngleOverride={setTrunkAngleOverride} setBackBendOverride={setBackBendOverride} targetTrunkAngleDeg={targetTrunkAngleDeg} backBendDeg={backBendDeg} currentBrand={currentBrand} FRAME_CATALOG={FRAME_CATALOG} setSelection={setSelection} brands={brands} selection={selection} getModelById={getModelById} modelsForBrand={modelsForBrand} model={model} sizeData={sizeData} components={components} updateComponent={updateComponent} resetComponent={resetComponent} hoodPresetId={hoodPresetId} setHoodPresetId={setHoodPresetId} tyreSize={tyreSize} setTyreSize={setTyreSize} pedalPresetId={pedalPresetId} handlePedalPreset={handlePedalPreset} shoePresetId={shoePresetId} handleShoePreset={handleShoePreset} setPedalPresetId={setPedalPresetId} setShoePresetId={setShoePresetId} />;

  const metricsPanel = <ResultsColumn mobilePanel={mobilePanel} fullscreen={fullscreen} issueCount={issueCount} actualSaddleY={actualSaddleY} saddleDelta={saddleDelta} idealSaddleY={idealSaddleY} saddleWarning={saddleWarning} severityTone={severityTone} kneeFlex={kneeFlex} fitMode={fitMode} riderFit={riderFit} kneeTone={kneeTone} hoodsWarning={hoodsWarning} barReachNeededValue={barReachNeededValue} barReachDelta={barReachDelta} components={components} barReachTone={barReachTone} bbToSaddleDistance={bbToSaddleDistance} seatpostExtension={seatpostExtension} strokeMetrics={strokeMetrics} bandColor={bandColor} targetTrunkAngleDeg={targetTrunkAngleDeg} preset={preset} warnings={warnings} severityColor={severityColor} bike={bike} seatpostRec={seatpostRec} frameGeometryRows={frameGeometryRows} />;

  return (
    <div className={`mode-layout mode-layout--builder${fullscreen ? " mode-layout--fullscreen" : ""}`}>

      {controlPanels}

      {/* ── Centre: visualization ── */}
      <section className="visual-panel builder-center">
        <StageToolbar model={model} sizeData={sizeData} viewOptions={viewOptions} view={view} setView={setView} view3d={view3d} layersRef={layersRef} layersOpen={layersOpen} setLayersOpen={setLayersOpen} setAllRiderVisibility={setAllRiderVisibility} riderVisibility={riderVisibility} toggleRiderVisibility={toggleRiderVisibility} showJointAngles={showJointAngles} setShowJointAngles={setShowJointAngles} showFitPositions={showFitPositions} setShowFitPositions={setShowFitPositions} showFrameGeometry={showFrameGeometry} setShowFrameGeometry={setShowFrameGeometry} setAllFrameMeasurements={setAllFrameMeasurements} frameMeasurementVisibility={frameMeasurementVisibility} toggleFrameMeasurement={toggleFrameMeasurement} fullscreen={fullscreen} setFullscreen={setFullscreen} />

        {!view3d && (
          <div className="legend-row">
            <span><i className="legend-swatch legend-swatch--a" /> Frame</span>
            <span><i className="legend-swatch legend-swatch--target" /> Ideal contacts</span>
          </div>
        )}

        <div className="visual-stage">
          {view3d ? (
            <BikeScene3D
              geo={geo3d}
              mannequin2D={mannequin}
              weightKg={riderFit.weight}
              strokeLUT={strokeMetrics}
              stanceWidth={components.stance_width ?? 155}
              postureBands={POSTURE_PRESET}
            />
          ) : view === "side" ? (
            <Stage2DSide viewBox={viewBox} activeBounds={activeBounds} groundY={groundY} bike={bike} effectiveFrame={effectiveFrame} tyreSize={tyreSize} riderVisibility={riderVisibility} rider={rider} mannequin={mannequin} showJointAngles={showJointAngles} kneeFlex={kneeFlex} kneeTone={kneeTone} targetTrunkAngleDeg={targetTrunkAngleDeg} idealContacts={idealContacts} warnings={warnings} severitySvgColor={severitySvgColor} showFitPositions={showFitPositions} components={components} showFrameGeometry={showFrameGeometry} sizeData={sizeData} frameMeasurementVisibility={frameMeasurementVisibility} />
          ) : <Stage2DFront frontalMannequin={frontalMannequin} rider={rider} components={components} mannequin={mannequin} groundY={groundY} riderVisibility={riderVisibility} />}
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
