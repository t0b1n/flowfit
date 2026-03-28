import React, { useEffect, useMemo, useState } from "react";
import { BikeGeometryAnnotations, BikeFitAnnotations } from "./BikeAnnotations";
import { solve } from "./api";
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
  barReachNeeded,
  boundsForBikes,
  buildRider,
  computeComponentDeltas,
  expandBoundsForMannequins,
  exposedSeatpostLength,
  seatpostRecommendation,
  synthesizeBike,
  withTyreSize,
} from "./geometry";
import type { BikeSelection, Components, ContactPoint, ReferenceMode, RiderFit, SetupResult } from "./types";

// ── Saddle shape SVG sub-component ────────────────────────────────────────────

const SaddleShape: React.FC<{
  contact: ContactPoint; // bike coordinates (y up) — saddle surface
  clamp: ContactPoint;   // bike coordinates — visual seatpost head / rail support
  className?: string;
}> = ({ contact, clamp, className }) => {
  const cx = contact.x;
  const cy = -contact.y;
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

const HOOD_PRESETS = [
  { id: "shimano", label: "Shimano DA", hoodReachOffset: 24 },
  { id: "sram-red", label: "SRAM Red E1", hoodReachOffset: 28 },
  { id: "sram-force", label: "SRAM Force E1", hoodReachOffset: 28 },
];

const ENDURANCE_PRESET = {
  name: "Endurance",
  trunk_angle: { min_deg: 50, max_deg: 60, weight: 1 },
  hip_angle: { min_deg: 95, max_deg: 105, weight: 1 },
  shoulder_flexion: { min_deg: 70, max_deg: 90, weight: 1 },
  elbow_flexion: { min_deg: 10, max_deg: 25, weight: 0.5 },
  knee_extension: { min_deg: 140, max_deg: 150, weight: 1 },
  shoulder_abduction: null,
};

export const FitTransferMode: React.FC = () => {
  const firstModel = FRAME_CATALOG[0];
  const secondModel = FRAME_CATALOG[1];

  // Frame A: reference
  const [selectionA, setSelectionA] = useState<BikeSelection>({
    modelId: firstModel.id,
    size: firstModel.sizes[2]?.size ?? firstModel.sizes[0].size,
  });
  // Frame B: target
  const [selectionB, setSelectionB] = useState<BikeSelection>({
    modelId: secondModel.id,
    size: secondModel.sizes[3]?.size ?? secondModel.sizes[0].size,
  });

  const [componentsA, setComponentsA] = useState<Components>({ ...DEFAULT_COMPONENTS });
  const [componentsB, setComponentsB] = useState<Components>({ ...DEFAULT_COMPONENTS });
  const [tyreSizeA, setTyreSizeA] = useState(DEFAULT_TYRE_SIZE);
  const [tyreSizeB, setTyreSizeB] = useState(DEFAULT_TYRE_SIZE);
  const [hoodPresetA, setHoodPresetA] = useState(HOOD_PRESETS[0].id);
  const [hoodPresetB, setHoodPresetB] = useState(HOOD_PRESETS[0].id);
  const [riderFit, setRiderFit] = useState<RiderFit>(DEFAULT_RIDER_FIT);

  const [autoSizeB, setAutoSizeB] = useState(false);
  const [showGeometry, setShowGeometry] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [resultB, setResultB] = useState<SetupResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [refMode, setRefMode] = useState<ReferenceMode>("frame");
  const [directSaddleX, setDirectSaddleX] = useState(-10);
  const [directSaddleY, setDirectSaddleY] = useState(710);
  const [directHoodsX, setDirectHoodsX] = useState(430);
  const [directHoodsY, setDirectHoodsY] = useState(610);
  const [directCleatX, setDirectCleatX] = useState(0);
  const [directCleatY, setDirectCleatY] = useState(-172.5);

  const modelA = getModelById(selectionA.modelId);
  const modelB = getModelById(selectionB.modelId);
  const sizeA = getSizeData(selectionA.modelId, selectionA.size);
  const sizeB = getSizeData(selectionB.modelId, selectionB.size);

  const effectiveFrameA = useMemo(
    () => withTyreSize(sizeA.geometry, tyreSizeA),
    [sizeA.geometry, tyreSizeA]
  );
  const effectiveFrameB = useMemo(
    () => withTyreSize(sizeB.geometry, tyreSizeB),
    [sizeB.geometry, tyreSizeB]
  );
  const rider = useMemo(() => buildRider(riderFit), [riderFit]);

  // Frame A: always computed from components (no solver)
  const bikeA = useMemo(
    () => synthesizeBike(sizeA, effectiveFrameA, componentsA),
    [sizeA, effectiveFrameA, componentsA]
  );

  const contactsA = useMemo(() => refMode === "direct"
    ? {
        saddle: { x: directSaddleX, y: directSaddleY },
        hoods:  { x: directHoodsX,  y: directHoodsY  },
        cleat:  { x: directCleatX,  y: directCleatY  },
      }
    : {
        saddle: { x: bikeA.saddle.x, y: bikeA.saddle.y },
        hoods:  { x: bikeA.hoods.x,  y: bikeA.hoods.y  },
        cleat:  { x: bikeA.cleat.x,  y: bikeA.cleat.y  },
      },
    [refMode, directSaddleX, directSaddleY, directHoodsX, directHoodsY, directCleatX, directCleatY,
     bikeA.saddle.x, bikeA.saddle.y, bikeA.hoods.x, bikeA.hoods.y, bikeA.cleat.x, bikeA.cleat.y]
  );

  // Frame B: use solved components when available, else initial components
  const solvedComponentsB: Components = resultB
    ? (resultB.components as Components)
    : componentsB;

  const bikeB = useMemo(
    () => synthesizeBike(sizeB, effectiveFrameB, solvedComponentsB),
    [sizeB, effectiveFrameB, solvedComponentsB]
  );

  // Solver: POST to /solve with Frame A's contacts as targets for Frame B.
  // When autoSizeB is active, runs one solve per available size and picks the winner.
  useEffect(() => {
    let cancelled = false;

    const contactResidual = (cp: { saddle: { x: number; y: number }; hoods: { x: number; y: number } }) =>
      Math.hypot(cp.saddle.x - contactsA.saddle.x, cp.saddle.y - contactsA.saddle.y) +
      Math.hypot(cp.hoods.x - contactsA.hoods.x, cp.hoods.y - contactsA.hoods.y);

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (autoSizeB) {
          const results = await Promise.all(
            modelB.sizes.map(async (entry) => {
              const sd = getSizeData(selectionB.modelId, entry.size);
              const frame = withTyreSize(sd.geometry, tyreSizeB);
              const res = await solve({
                setup: {
                  frame,
                  components: componentsB,
                  target_contact_points: contactsA,
                  rider,
                  preset: ENDURANCE_PRESET,
                  schema_version: "0.1.0",
                },
              });
              return { size: entry.size, result: res.result };
            })
          );
          const valid = results.filter((r) => r.result != null);
          if (valid.length > 0 && !cancelled) {
            const winner = valid.reduce((best, cur) =>
              contactResidual(cur.result!.contact_points) < contactResidual(best.result!.contact_points)
                ? cur
                : best
            );
            setSelectionB((s) => (s.size === winner.size ? s : { ...s, size: winner.size }));
            setResultB(winner.result);
          }
        } else {
          const response = await solve({
            setup: {
              frame: effectiveFrameB,
              components: componentsB,
              target_contact_points: contactsA,
              rider,
              preset: ENDURANCE_PRESET,
              schema_version: "0.1.0",
            },
          });
          if (!cancelled) setResultB(response.result);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const id = window.setTimeout(run, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [contactsA, effectiveFrameB, componentsB, rider, autoSizeB, selectionB.modelId, tyreSizeB]);

  // Component deltas (A components vs B solved components)
  const deltas = resultB ? computeComponentDeltas(componentsA, solvedComponentsB) : null;

  // Residual contact match error
  const residualSaddle =
    resultB
      ? Math.hypot(
          bikeB.saddle.x - contactsA.saddle.x,
          bikeB.saddle.y - contactsA.saddle.y
        )
      : null;
  const residualHoods =
    resultB
      ? Math.hypot(
          bikeB.hoods.x - contactsA.hoods.x,
          bikeB.hoods.y - contactsA.hoods.y
        )
      : null;

  // SVG bounds
  const pseudoTargets = {
    saddle: contactsA.saddle,
    hoods: contactsA.hoods,
    cleat: contactsA.cleat,
  };
  const baseBounds = boundsForBikes(
    [bikeA, bikeB],
    pseudoTargets,
    Math.max(effectiveFrameA.wheel_radius, effectiveFrameB.wheel_radius)
  );
  const bounds = expandBoundsForMannequins(baseBounds, []);

  const activeBounds = useMemo(() => {
    if (!fullscreen) return bounds;
    const pts = [
      bikeA.bb, bikeA.seatCluster, bikeA.seatTubeTop, bikeA.headTubeBottom, bikeA.headTubeTop,
      bikeA.saddle, bikeA.hoods, bikeA.cleat, bikeA.barClamp,
      bikeB.bb, bikeB.seatCluster, bikeB.seatTubeTop, bikeB.headTubeBottom, bikeB.headTubeTop,
      bikeB.saddle, bikeB.hoods, bikeB.cleat, bikeB.barClamp,
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs) - 140,
      maxX: Math.max(...xs) + 140,
      minY: Math.min(...ys) - 140,
      maxY: Math.max(...ys) + 100,
    };
  }, [fullscreen, bounds, bikeA, bikeB]);

  const viewBox = `${activeBounds.minX} ${-activeBounds.maxY} ${activeBounds.maxX - activeBounds.minX} ${activeBounds.maxY - activeBounds.minY}`;
  const groundY = Math.max(
    effectiveFrameA.wheel_radius - effectiveFrameA.bb_drop,
    effectiveFrameB.wheel_radius - effectiveFrameB.bb_drop
  );

  const sourceModels = FRAME_CATALOG.map((m) => ({ label: `${m.brand} ${m.model}`, value: m.id }));

  const updateComponentA = (key: keyof Components, value: number) =>
    setComponentsA((c) => ({ ...c, [key]: value }));
  const updateComponentB = (key: keyof Components, value: number) =>
    setComponentsB((c) => ({ ...c, [key]: value }));

  const seatpostExtA = exposedSeatpostLength(bikeA);
  const seatpostExtB = exposedSeatpostLength(bikeB);

  const seatpostRecA = useMemo(
    () => seatpostRecommendation(bikeA.saddle, bikeA.saddleClamp),
    [bikeA.saddle, bikeA.saddleClamp]
  );
  const seatpostRecB = useMemo(
    () => seatpostRecommendation(bikeB.saddle, bikeB.saddleClamp),
    [bikeB.saddle, bikeB.saddleClamp]
  );
  const barReachNeededB = useMemo(
    () => resultB
      ? barReachNeeded(contactsA.hoods, bikeB.barClamp, solvedComponentsB.hood_reach_offset)
      : null,
    [resultB, contactsA.hoods, bikeB.barClamp, solvedComponentsB.hood_reach_offset]
  );

  return (
    <div className={`mode-layout mode-layout--transfer${fullscreen ? " mode-layout--fullscreen" : ""}`}>
      {/* ── Frame pickers row ── */}
      <section className="selector-panel" style={{ display: fullscreen ? "none" : undefined }}>
        <div className="tab-row" style={{ marginBottom: 12 }}>
          <button
            className={`tab-pill ${refMode === "frame" ? "tab-pill--active" : ""}`}
            onClick={() => setRefMode("frame")}
          >
            Frame A reference
          </button>
          <button
            className={`tab-pill ${refMode === "direct" ? "tab-pill--active" : ""}`}
            onClick={() => setRefMode("direct")}
          >
            Direct X/Y input
          </button>
        </div>
        <div className="compare-picker compare-picker--horizontal">
          {(
            [
              ["a", "Reference fit", selectionA, setSelectionA, modelA, sizeA, componentsA, updateComponentA, hoodPresetA, setHoodPresetA, tyreSizeA, setTyreSizeA],
              ["b", "Target frame", selectionB, setSelectionB, modelB, sizeB, componentsB, updateComponentB, hoodPresetB, setHoodPresetB, tyreSizeB, setTyreSizeB],
            ] as const
          ).map(([key, roleLabel, sel, setSel, model, sizeData, comps, updateComp, hoodId, setHoodId, tyreSize, setTyreSize]) => {
            if (key === "a" && refMode === "direct") {
              return (
                <div className="bike-card bike-card--a" key={key}>
                  <div className="bike-card__header">
                    <span className="metric-card__tag metric-card__tag--a">Reference fit</span>
                    <strong>Direct X/Y entry</strong>
                  </div>
                  <p className="subpanel-note">
                    Enter coordinates measured from the bottom bracket (BB = 0, 0).
                    Use data from a Retül, Guru, or Purely Custom fit bike session.
                  </p>
                  <div className="slider-grid slider-grid--compact">
                    {(([
                      ["Saddle X", directSaddleX, setDirectSaddleX, -200, 100],
                      ["Saddle Y", directSaddleY, setDirectSaddleY, 500, 900],
                      ["Hoods X",  directHoodsX,  setDirectHoodsX,  200, 700],
                      ["Hoods Y",  directHoodsY,  setDirectHoodsY,  400, 800],
                      ["Cleat X",  directCleatX,  setDirectCleatX,  -50, 50],
                      ["Cleat Y",  directCleatY,  setDirectCleatY, -300, -100],
                    ] as [string, number, (v: number) => void, number, number][])).map(([label, value, setter, min, max]) => (
                      <label className="slider-card" key={label}>
                        <div className="slider-card__header">
                          <span>{label}</span>
                          <strong>{Math.round(value)} mm</strong>
                        </div>
                        <input
                          className="slider-card__input slider-card__input--target"
                          type="number"
                          value={Math.round(value)}
                          onChange={(e) => setter(Number(e.target.value))}
                          style={{ width: "100%", padding: "4px 8px" }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            }
            return (
            <div className={`bike-card bike-card--${key}`} key={key}>
              <div className="bike-card__header">
                <span className={`metric-card__tag metric-card__tag--${key}`}>{roleLabel}</span>
                <strong>
                  {model.brand} {model.model}
                </strong>
              </div>
              <label className="field">
                <span>Frame</span>
                <select
                  value={sel.modelId}
                  onChange={(e) => {
                    const m = getModelById(e.target.value);
                    setSel({ modelId: m.id, size: m.sizes[0].size });
                  }}
                >
                  {sourceModels.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field field--with-action">
                <span>Size</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={sel.size}
                    onChange={(e) => {
                      setSel((s) => ({ ...s, size: e.target.value }));
                      if (key === "b") setAutoSizeB(false);
                    }}
                  >
                    {model.sizes.map((entry) => (
                      <option key={entry.size} value={entry.size}>
                        {entry.size}
                      </option>
                    ))}
                  </select>
                  {key === "b" && (
                    <button
                      className={`preset-pill${autoSizeB ? " preset-pill--active" : ""}`}
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => setAutoSizeB((v) => !v)}
                    >
                      Auto
                    </button>
                  )}
                </div>
              </div>
              <div className="bike-card__meta">
                <span>Stack {sizeData.geometry.stack} mm</span>
                <span>Reach {sizeData.geometry.reach} mm</span>
              </div>

              {/* Hood preset pills */}
              <div className="preset-row" style={{ marginTop: 8 }}>
                {HOOD_PRESETS.map((hp) => (
                  <button
                    key={hp.id}
                    className={`preset-pill ${hoodId === hp.id ? "preset-pill--active" : ""}`}
                    onClick={() => {
                      setHoodId(hp.id);
                      updateComp("hood_reach_offset", hp.hoodReachOffset);
                    }}
                  >
                    {hp.label}
                  </button>
                ))}
              </div>

              {/* Cockpit sliders — greyed on B to indicate solver overwrites key fields */}
              <div className="slider-grid slider-grid--compact" style={{ marginTop: 8 }}>
                {(
                  [
                    ["Stem length", comps.stem_length, 70, 150, 1, "stem_length", "mm"],
                    ["Stem angle", comps.stem_angle_deg, -17, 17, 1, "stem_angle_deg", "°"],
                    ["Spacers", comps.spacer_stack, 0, 40, 1, "spacer_stack", "mm"],
                    ["Saddle offset", comps.saddle_clamp_offset, 550, 900, 5, "saddle_clamp_offset", "mm"],
                    ["Saddle stack", comps.saddle_stack, 30, 120, 5, "saddle_stack", "mm"],
                    ["Seatpost offset", comps.seatpost_offset, -30, 30, 2, "seatpost_offset", "mm"],
                    ["Rail offset", comps.saddle_rail_offset, -25, 25, 5, "saddle_rail_offset", "mm"],
                    ["Bar reach", comps.bar_reach, 65, 105, 1, "bar_reach", "mm"],
                    ["Hood reach", comps.hood_reach_offset, 16, 32, 0.5, "hood_reach_offset", "mm"],
                    ["Bar width", comps.bar_width, 200, 460, 10, "bar_width", "mm"],
                    ["Crank length", comps.crank_length, 160, 177.5, 2.5, "crank_length", "mm"],
                    ["Tyre size", tyreSize, 25, 38, 1, "__tyre__", "mm"],
                  ] as const
                ).map(([label, value, min, max, step, k, unit]) => {
                  const solverOwns =
                    key === "b" &&
                    (k === "stem_length" || k === "spacer_stack" || k === "saddle_clamp_offset" || k === "stem_angle_deg");
                  return (
                    <label
                      className="slider-card"
                      key={k}
                      style={{ opacity: solverOwns ? 0.45 : 1 }}
                    >
                      <div className="slider-card__header">
                        <span>
                          {label}
                          {solverOwns ? " (solver)" : ""}
                        </span>
                        <strong>
                          {Number(value).toFixed(step === 0.5 || step === 2.5 ? 1 : 0)} {unit}
                        </strong>
                      </div>
                      <input
                        className="slider-card__input slider-card__input--frame"
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        disabled={solverOwns}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (k === "__tyre__") {
                            setTyreSize(v);
                          } else {
                            updateComp(k as keyof Components, v);
                          }
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        {/* Rider controls */}
        <div className="subpanel" style={{ marginTop: 16 }}>
          <div className="panel-header panel-header--compact">
            <div>
              <div className="eyebrow">Rider</div>
              <h3>Shared rider measurements</h3>
            </div>
          </div>
          <div className="slider-grid slider-grid--compact">
            {(
              [
                ["Height", riderFit.height, 1500, 2050, 5, "height", "mm"],
                ["Inseam", riderFit.inseam, 700, 1000, 5, "inseam", "mm"],
              ] as const
            ).map(([label, value, min, max, step, key, unit]) => (
              <label className="slider-card slider-card--target" key={key}>
                <div className="slider-card__header">
                  <span>{label}</span>
                  <strong>
                    {value} {unit}
                  </strong>
                </div>
                <input
                  className="slider-card__input slider-card__input--target"
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(e) =>
                    setRiderFit((r) => ({ ...r, [key]: Number(e.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ── SVG overlay ── */}
      <section className="workspace-grid">
        <section className="visual-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow eyebrow--light">Fit Transfer</div>
              <h2>Contact point overlay</h2>
            </div>
            <div className={`status-pill ${loading ? "status-pill--live" : ""}`}>
              {loading ? "Solving Frame B…" : resultB ? "Solved" : "Waiting"}
            </div>
          </div>

          <div className="legend-row">
            <span>
              <i className="legend-swatch legend-swatch--a" /> Frame A (reference)
            </span>
            <span>
              <i className="legend-swatch legend-swatch--b" /> Frame B (target)
            </span>
            <span>
              <i className="legend-swatch legend-swatch--target" /> A contacts (targets)
            </span>
            {error && <span style={{ color: "var(--accent)" }}>{error}</span>}
            <button
              className={`tab-pill ${showFit ? "tab-pill--active" : ""}`}
              style={{ marginLeft: "auto" }}
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
            <button
              className="tab-pill"
              title={fullscreen ? "Show controls" : "Hide controls"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? "⊠" : "⛶"}
            </button>
          </div>

          <div className="visual-stage">
            <svg viewBox={viewBox} className="geometry-svg">
              <line
                x1={activeBounds.minX} y1={groundY}
                x2={activeBounds.maxX} y2={groundY}
                className="geometry-ground"
              />

              {[bikeA, bikeB].map((bike, idx) => {
                const tone = idx === 0 ? "a" : "b";
                if (idx === 0 && refMode === "direct") return null;
                const fr = idx === 0 ? effectiveFrameA : effectiveFrameB;
                const tyreS = idx === 0 ? tyreSizeA : tyreSizeB;
                const radius = fr.wheel_radius;
                const rimRadius = Math.max(radius - tyreS, radius - 42);
                return (
                  <g key={tone} className={`geometry-layer geometry-layer--${tone}`}>
                    <circle cx={bike.rearAxle.x} cy={-bike.rearAxle.y} r={radius} className="geometry-tyre" />
                    <circle cx={bike.frontAxle.x} cy={-bike.frontAxle.y} r={radius} className="geometry-tyre" />
                    <circle cx={bike.rearAxle.x} cy={-bike.rearAxle.y} r={rimRadius} className="geometry-wheel" />
                    <circle cx={bike.frontAxle.x} cy={-bike.frontAxle.y} r={rimRadius} className="geometry-wheel" />
                    <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.crankEnd.x} y2={-bike.crankEnd.y} className="geometry-frame geometry-frame--cockpit-thin" />
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
                    {/* Saddle shape + contact nodes */}
                    {tone === "a" ? (
                      <>
                        <SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className={`geometry-layer--${tone}`} />
                        <circle cx={bike.hoods.x} cy={-bike.hoods.y} r={7} className="geometry-node geometry-node--contact" />
                        <circle cx={bike.cleat.x} cy={-bike.cleat.y} r={7} className="geometry-node geometry-node--contact" />
                      </>
                    ) : (
                      <>
                        <SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className={`geometry-layer--${tone}`} />
                        <circle cx={bike.hoods.x} cy={-bike.hoods.y} r={7} className="geometry-node geometry-node--contact geometry-node--open" />
                        <circle cx={bike.cleat.x} cy={-bike.cleat.y} r={7} className="geometry-node geometry-node--contact geometry-node--open" />
                      </>
                    )}
                  </g>
                );
              })}

              {/* Dashed lines: A contacts → B contacts */}
              {resultB &&
                (["saddle", "hoods", "cleat"] as const).map((contact) => {
                  const ptA =
                    contact === "saddle" ? contactsA.saddle : contact === "hoods" ? contactsA.hoods : contactsA.cleat;
                  const ptB =
                    contact === "saddle" ? bikeB.saddle : contact === "hoods" ? bikeB.hoods : bikeB.cleat;
                  const dist = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y);
                  if (dist < 2) return null;
                  return (
                    <g key={contact}>
                      <line
                        x1={ptA.x} y1={-ptA.y}
                        x2={ptB.x} y2={-ptB.y}
                        stroke="var(--muted)"
                        strokeWidth={1}
                        strokeDasharray="6 3"
                        opacity={0.5}
                      />
                      <text
                        x={(ptA.x + ptB.x) / 2 + 6}
                        y={-((ptA.y + ptB.y) / 2)}
                        style={{ fill: "var(--muted)", fontSize: 18 }}
                      >
                        {dist.toFixed(0)} mm
                      </text>
                    </g>
                  );
                })}

              {/* Frame A contact crosshairs (shared targets) */}
              {(["saddle", "hoods", "cleat"] as const).map((contact) => {
                const pt = contact === "saddle" ? contactsA.saddle : contact === "hoods" ? contactsA.hoods : contactsA.cleat;
                return (
                  <g key={`target-${contact}`}>
                    <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" />
                    <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" />
                  </g>
                );
              })}

              {showFit && (
                <>
                  <BikeFitAnnotations bike={bikeA} barWidth={componentsA.bar_width} />
                  <BikeFitAnnotations bike={bikeB} barWidth={solvedComponentsB.bar_width} />
                </>
              )}
              {showGeometry && (
                <>
                  <BikeGeometryAnnotations bike={bikeA} frame={effectiveFrameA} />
                  <BikeGeometryAnnotations bike={bikeB} frame={effectiveFrameB} />
                </>
              )}
            </svg>
          </div>

          {/* Component delta table */}
          <div className="metric-grid metric-grid--visual" style={{ marginTop: 16 }}>
            <div className="metric-card">
              <div className="metric-card__label">Frame A saddle offset</div>
              <div className="metric-card__compare">
                <strong>{componentsA.saddle_clamp_offset.toFixed(0)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame B saddle offset</div>
              <div className="metric-card__compare">
                <strong>{solvedComponentsB.saddle_clamp_offset.toFixed(0)} mm</strong>
              </div>
              {deltas && (
                <div className="metric-card__delta">
                  {deltas.saddle_clamp_offset >= 0 ? "+" : ""}
                  {deltas.saddle_clamp_offset.toFixed(0)} mm vs A
                </div>
              )}
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame A spacers</div>
              <div className="metric-card__compare">
                <strong>{componentsA.spacer_stack.toFixed(0)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame B spacers</div>
              <div className="metric-card__compare">
                <strong>{solvedComponentsB.spacer_stack.toFixed(0)} mm</strong>
              </div>
              {deltas && (
                <div className="metric-card__delta">
                  {deltas.spacer_stack >= 0 ? "+" : ""}
                  {deltas.spacer_stack.toFixed(0)} mm vs A
                </div>
              )}
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame A stem</div>
              <div className="metric-card__compare">
                <strong>{componentsA.stem_length.toFixed(0)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame B stem</div>
              <div className="metric-card__compare">
                <strong>{solvedComponentsB.stem_length.toFixed(0)} mm</strong>
              </div>
              {deltas && (
                <div className="metric-card__delta">
                  {deltas.stem_length >= 0 ? "+" : ""}
                  {deltas.stem_length.toFixed(0)} mm vs A
                </div>
              )}
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame A stem angle</div>
              <div className="metric-card__compare">
                <strong>{componentsA.stem_angle_deg.toFixed(0)}°</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame B stem angle</div>
              <div className="metric-card__compare">
                <strong>{solvedComponentsB.stem_angle_deg.toFixed(0)}°</strong>
              </div>
              {deltas && (
                <div className="metric-card__delta">
                  {deltas.stem_angle_deg >= 0 ? "+" : ""}
                  {deltas.stem_angle_deg.toFixed(0)}° vs A
                </div>
              )}
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Saddle match error</div>
              <div className="metric-card__compare">
                <strong>
                  {residualSaddle !== null ? `${residualSaddle.toFixed(1)} mm` : "—"}
                </strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Hood match error</div>
              <div className="metric-card__compare">
                <strong>
                  {residualHoods !== null ? `${residualHoods.toFixed(1)} mm` : "—"}
                </strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">Frame B constraint</div>
              <div className="metric-card__compare">
                <strong>{resultB?.constraints.status ?? "waiting"}</strong>
              </div>
            </div>
            <div className="metric-card"
              title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper.">
              <div className="metric-card__label">A seatpost extension</div>
              <div className="metric-card__compare">
                <strong>{seatpostExtA.toFixed(0)} mm</strong>
              </div>
            </div>
            <div className="metric-card"
              title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper.">
              <div className="metric-card__label">B seatpost extension</div>
              <div className="metric-card__compare">
                <strong>{seatpostExtB.toFixed(0)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">A saddle (X, Y)</div>
              <div className="metric-card__compare">
                <strong>{Math.round(bikeA.saddle.x)}, {Math.round(bikeA.saddle.y)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">B saddle (X, Y)</div>
              <div className="metric-card__compare">
                <strong>{Math.round(bikeB.saddle.x)}, {Math.round(bikeB.saddle.y)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">A hoods (X, Y)</div>
              <div className="metric-card__compare">
                <strong>{Math.round(bikeA.hoods.x)}, {Math.round(bikeA.hoods.y)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">B hoods (X, Y)</div>
              <div className="metric-card__compare">
                <strong>{Math.round(bikeB.hoods.x)}, {Math.round(bikeB.hoods.y)} mm</strong>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">A seatpost type</div>
              <div className="metric-card__compare"
                style={{ color: seatpostRecA.type === "straight" ? "var(--teal)" : "#d4880a" }}
              >
                <strong style={{ textTransform: "capitalize" }}>{seatpostRecA.type}</strong>
              </div>
              <div className="metric-card__delta">{Math.round(seatpostRecA.bbToRailDistance)} mm BB→rail</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">B seatpost type</div>
              <div className="metric-card__compare"
                style={{ color: seatpostRecB.type === "straight" ? "var(--teal)" : "#d4880a" }}
              >
                <strong style={{ textTransform: "capitalize" }}>{seatpostRecB.type}</strong>
              </div>
              <div className="metric-card__delta">{Math.round(seatpostRecB.bbToRailDistance)} mm BB→rail</div>
            </div>
            <div className="metric-card">
              <div className="metric-card__label">B bar reach needed</div>
              <div className="metric-card__compare">
                {barReachNeededB !== null
                  ? <strong>{Math.round(barReachNeededB)} mm</strong>
                  : <strong style={{ color: "var(--accent)" }}>Out of range</strong>
                }
              </div>
              {barReachNeededB !== null && (
                <div className="metric-card__delta">
                  {barReachNeededB - solvedComponentsB.bar_reach >= 0 ? "+" : ""}
                  {Math.round(barReachNeededB - solvedComponentsB.bar_reach)} mm vs current
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};
