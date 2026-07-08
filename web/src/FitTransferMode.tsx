import React, { useEffect, useMemo, useState } from "react";
import { BikeGeometryAnnotations, BikeFitAnnotations } from "./BikeAnnotations";
import { solve } from "./api";
import { useCatalog } from "./catalog/CatalogContext";
import { Drivetrain2D, Wheel2D } from "./components/BikeParts2D";
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
import type { BikeSelection, Components, ReferenceMode, RiderFit, SetupResult } from "./types";

const ENDURANCE_PRESET = {
  name: "Endurance",
  trunk_angle: { min_deg: 50, max_deg: 60, weight: 1 },
  hip_angle: { min_deg: 95, max_deg: 105, weight: 1 },
  shoulder_flexion: { min_deg: 70, max_deg: 90, weight: 1 },
  elbow_flexion: { min_deg: 10, max_deg: 25, weight: 0.5 },
  knee_extension: { min_deg: 140, max_deg: 150, weight: 1 },
  shoulder_abduction: null,
};

// The four fields the solver owns on Frame B
const SOLVER_FIELDS = new Set<keyof Components>([
  "stem_length",
  "stem_angle_deg",
  "spacer_stack",
  "saddle_clamp_offset",
]);

type SliderRow = readonly [string, number, number, number, number, string, string];

const COCKPIT_SLIDERS = (comps: Components, tyreSize: number): readonly SliderRow[] => [
  ["Stem length", comps.stem_length, 50, 180, 1, "stem_length", "mm"],
  ["Stem angle", comps.stem_angle_deg, -20, 20, 1, "stem_angle_deg", "°"],
  ["Spacers", comps.spacer_stack, 0, 60, 1, "spacer_stack", "mm"],
  ["Saddle offset", comps.saddle_clamp_offset, 550, 900, 5, "saddle_clamp_offset", "mm"],
  ["Saddle stack", comps.saddle_stack, 30, 120, 5, "saddle_stack", "mm"],
  ["Seatpost offset", comps.seatpost_offset, -30, 30, 2, "seatpost_offset", "mm"],
  ["Rail offset", comps.saddle_rail_offset, -25, 25, 5, "saddle_rail_offset", "mm"],
  ["Bar reach", comps.bar_reach, 65, 105, 1, "bar_reach", "mm"],
  ["Hood reach", comps.hood_reach_offset, 16, 32, 0.5, "hood_reach_offset", "mm"],
  ["Bar width", comps.bar_width, 200, 460, 10, "bar_width", "mm"],
  ["Crank length", comps.crank_length, 160, 177.5, 2.5, "crank_length", "mm"],
  ["Tyre size", tyreSize, 25, 38, 1, "__tyre__", "mm"],
];

// Small padlock used on solver-owned sliders
const LockToggle: React.FC<{ locked: boolean; onToggle: (locked: boolean) => void }> = ({
  locked,
  onToggle,
}) => (
  <button
    type="button"
    className={`lock-btn${locked ? " lock-btn--locked" : ""}`}
    title={locked ? "Pinned — solver holds this value fixed. Click to release." : "Pin this value — solver will hold it fixed"}
    onClick={(e) => {
      e.preventDefault();
      onToggle(!locked);
    }}
  >
    <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
      <rect x="1" y="5" width="9" height="6.5" rx="1" fill="currentColor" />
      {locked ? (
        <path d="M 3 5 V 3.4 A 2.5 2.5 0 0 1 8 3.4 V 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path d="M 3 5 V 3.4 A 2.5 2.5 0 0 1 8 3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  </button>
);

export const FitTransferMode: React.FC = () => {
  const { catalog: FRAME_CATALOG, getModelById, getSizeData } = useCatalog();
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
  const [hoodPresetA, setHoodPresetA] = useState<string>(HOOD_PRESETS[0].id);
  const [hoodPresetB, setHoodPresetB] = useState<string>(HOOD_PRESETS[0].id);
  const [riderFit, setRiderFit] = useState<RiderFit>(DEFAULT_RIDER_FIT);

  const [autoSizeB, setAutoSizeB] = useState(false);
  const [showGeometry, setShowGeometry] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [resultB, setResultB] = useState<SetupResult>(null);
  const [tweaksB, setTweaksB] = useState<Partial<Components>>({});
  const [pinnedB, setPinnedB] = useState<Set<keyof Components>>(new Set());
  const [solveNonce, setSolveNonce] = useState(0);
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
  const sizeA = useMemo(() => getSizeData(selectionA.modelId, selectionA.size), [selectionA.modelId, selectionA.size]);
  const sizeB = useMemo(() => getSizeData(selectionB.modelId, selectionB.size), [selectionB.modelId, selectionB.size]);

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

  // Frame B: use solved components when available, else initial components.
  // Post-solve manual tweaks on solver-owned fields are merged on top.
  const solvedComponentsB: Components = resultB
    ? { ...(resultB.components as Components), ...tweaksB }
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
        const pinnedList = Array.from(pinnedB);
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
                  pinned_components: pinnedList,
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
            setTweaksB({});
          }
        } else {
          const response = await solve({
            setup: {
              frame: effectiveFrameB,
              components: componentsB,
              target_contact_points: contactsA,
              rider,
              preset: ENDURANCE_PRESET,
              pinned_components: pinnedList,
              schema_version: "0.1.0",
            },
          });
          if (!cancelled) {
            setResultB(response.result);
            setTweaksB({});
          }
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
  }, [contactsA, effectiveFrameB, componentsB, rider, autoSizeB, selectionB.modelId, tyreSizeB, pinnedB, solveNonce]);

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

  const brands = useMemo(
    () => Array.from(new Set(FRAME_CATALOG.map((m) => m.brand))).sort(),
    []
  );

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

  // Renders one cockpit slider for card A or B; on Frame B the solver-owned
  // fields display solver output (plus any tweak) and route edits to tweaksB
  // so they don't retrigger a solve.
  const renderSlider = (
    row: SliderRow,
    cardKey: "a" | "b",
    comps: Components,
    updateComp: (k: keyof Components, v: number) => void,
    setTyre: (v: number) => void
  ) => {
    const [label, value, min, max, step, k, unit] = row;
    const fieldKey = k as keyof Components;
    const solverOwns = cardKey === "b" && SOLVER_FIELDS.has(fieldKey);
    const isPinned = solverOwns && pinnedB.has(fieldKey);
    const isTweaked = solverOwns && !isPinned && tweaksB[fieldKey] !== undefined;
    // Pinned fields display the user's input (componentsB). Otherwise after a
    // solve, solver-owned sliders display the solver output (merged with any
    // tweak) so they match what's rendered.
    const displayValue =
      solverOwns && isPinned
        ? (componentsB[fieldKey] as number)
        : solverOwns && resultB
        ? (solvedComponentsB[fieldKey] as number)
        : value;

    const handleChange = (v: number) => {
      if (k === "__tyre__") {
        setTyre(v);
      } else if (solverOwns && isPinned) {
        updateComp(fieldKey, v);
      } else if (solverOwns && resultB) {
        setTweaksB((t) => ({ ...t, [k]: v }));
      } else {
        updateComp(fieldKey, v);
      }
    };

    const handlePinToggle = (locked: boolean) => {
      setPinnedB((s) => {
        const next = new Set(s);
        if (locked) next.add(fieldKey);
        else next.delete(fieldKey);
        return next;
      });
      if (locked) {
        // Promote any existing tweak to the pinned input, then clear the tweak
        // entry so it can't fight the pin.
        const tweaked = tweaksB[fieldKey];
        if (tweaked !== undefined) {
          updateComp(fieldKey, tweaked as number);
          setTweaksB((t) => {
            const { [fieldKey]: _omit, ...rest } = t;
            return rest;
          });
        } else if (resultB) {
          // Seed pinned value from the solver result so the visible slider
          // value doesn't jump on pin.
          updateComp(fieldKey, solvedComponentsB[fieldKey] as number);
        }
      }
    };

    const stateChip = solverOwns ? (
      <span
        className={`state-chip state-chip--${isPinned ? "pinned" : isTweaked ? "tweaked" : "solver"}`}
      >
        {isPinned ? "Pinned" : isTweaked ? "Tweaked" : "Auto"}
      </span>
    ) : null;

    const resetTweak = isTweaked ? (
      <button
        type="button"
        className="reset-mini"
        title="Reset to solver value"
        onClick={(e) => {
          e.preventDefault();
          setTweaksB((t) => {
            const { [fieldKey]: _omit, ...rest } = t;
            return rest;
          });
        }}
      >
        ↺
      </button>
    ) : null;

    return (
      <SliderCard
        key={k}
        label={
          solverOwns ? (
            <span className="solver-slider-label">
              <LockToggle locked={isPinned} onToggle={handlePinToggle} />
              {label}
            </span>
          ) : (
            label
          )
        }
        value={`${Number(displayValue).toFixed(step === 0.5 || step === 2.5 ? 1 : 0)} ${unit}`}
        min={min}
        max={max}
        step={step}
        sliderValue={displayValue}
        onChange={handleChange}
        trailing={
          stateChip || resetTweak ? (
            <>
              {stateChip}
              {resetTweak}
            </>
          ) : undefined
        }
      >
        {k === "hood_reach_offset" ? (
          <PresetPills
            small
            inline
            options={HOOD_PRESETS}
            activeId={cardKey === "a" ? hoodPresetA : hoodPresetB}
            onSelect={(id) => {
              const hp = HOOD_PRESETS.find((p) => p.id === id)!;
              if (cardKey === "a") setHoodPresetA(id);
              else setHoodPresetB(id);
              updateComp("hood_reach_offset", hp.hoodReachOffset);
            }}
          />
        ) : undefined}
      </SliderCard>
    );
  };

  const solveStatusLabel = loading ? "Solving Frame B…" : resultB ? "Solved" : "Waiting";

  return (
    <div className={`mode-layout mode-layout--transfer${fullscreen ? " mode-layout--fullscreen" : ""}`}>
      {/* ── Frame pickers row ── */}
      <section className="selector-panel" style={{ display: fullscreen ? "none" : undefined }}>
        <div className="seg-control" role="tablist" aria-label="Reference mode" style={{ marginBottom: 12 }}>
          <button
            role="tab"
            aria-selected={refMode === "frame"}
            className={`seg-control__btn${refMode === "frame" ? " seg-control__btn--active" : ""}`}
            onClick={() => setRefMode("frame")}
          >
            Frame A reference
          </button>
          <button
            role="tab"
            aria-selected={refMode === "direct"}
            className={`seg-control__btn${refMode === "direct" ? " seg-control__btn--active" : ""}`}
            onClick={() => setRefMode("direct")}
          >
            Direct X/Y input
          </button>
        </div>
        <div className="compare-picker compare-picker--horizontal">
          {(
            [
              ["a", "Reference fit", selectionA, setSelectionA, modelA, sizeA, componentsA, updateComponentA, tyreSizeA, setTyreSizeA],
              ["b", "Target frame", selectionB, setSelectionB, modelB, sizeB, componentsB, updateComponentB, tyreSizeB, setTyreSizeB],
            ] as const
          ).map(([key, roleLabel, sel, setSel, model, sizeData, comps, updateComp, tyreSize, setTyreSize]) => {
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
                      ["Saddle X", directSaddleX, setDirectSaddleX],
                      ["Saddle Y", directSaddleY, setDirectSaddleY],
                      ["Hoods X",  directHoodsX,  setDirectHoodsX],
                      ["Hoods Y",  directHoodsY,  setDirectHoodsY],
                      ["Cleat X",  directCleatX,  setDirectCleatX],
                      ["Cleat Y",  directCleatY,  setDirectCleatY],
                    ] as [string, number, (v: number) => void][])).map(([label, value, setter]) => (
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
            const rows = COCKPIT_SLIDERS(comps, tyreSize);
            const solverRows = rows.filter((r) => key === "b" && SOLVER_FIELDS.has(r[5] as keyof Components));
            const manualRows = rows.filter((r) => !(key === "b" && SOLVER_FIELDS.has(r[5] as keyof Components)));
            return (
            <div className={`bike-card bike-card--${key}`} key={key}>
              <div className="bike-card__header">
                <span className={`metric-card__tag metric-card__tag--${key}`}>{roleLabel}</span>
                <strong>
                  {model.brand} {model.model}
                </strong>
              </div>
              <label className="field">
                <span>Brand</span>
                <select
                  value={model.brand}
                  onChange={(e) => {
                    const firstModel = FRAME_CATALOG.find((m) => m.brand === e.target.value)!;
                    setSel({ modelId: firstModel.id, size: firstModel.sizes[0].size });
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
                  value={sel.modelId}
                  onChange={(e) => {
                    const m = getModelById(e.target.value);
                    setSel({ modelId: m.id, size: m.sizes[0].size });
                  }}
                >
                  {FRAME_CATALOG.filter((m) => m.brand === model.brand).map((m) => (
                    <option key={m.id} value={m.id}>{m.model}</option>
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
                      title="Let the solver pick the best size"
                      onClick={() => setAutoSizeB((v) => !v)}
                    >
                      Auto
                    </button>
                  )}
                  {key === "b" && (
                    <button
                      className="preset-pill"
                      style={{ whiteSpace: "nowrap" }}
                      title={`Re-run solver for size ${sel.size}, clearing any tweaks`}
                      onClick={() => {
                        setAutoSizeB(false);
                        setTweaksB({});
                        setSolveNonce((n) => n + 1);
                      }}
                    >
                      Solve for {sel.size}
                    </button>
                  )}
                </div>
              </div>
              <div className="bike-card__meta">
                <span>Stack {sizeData.geometry.stack} mm</span>
                <span>Reach {sizeData.geometry.reach} mm</span>
              </div>

              {key === "b" && solverRows.length > 0 && (
                <div className="solver-block">
                  <div className="solver-block__header">
                    <span>Solver controls</span>
                    {resultB && (Object.keys(tweaksB).length > 0 || pinnedB.size > 0) && (
                      <button
                        type="button"
                        className="preset-pill preset-pill--sm"
                        onClick={() => {
                          setTweaksB({});
                          setPinnedB(new Set());
                        }}
                      >
                        Reset overrides
                      </button>
                    )}
                  </div>
                  <div className="slider-grid slider-grid--compact">
                    {solverRows.map((row) => renderSlider(row, key, comps, updateComp, setTyreSize))}
                  </div>
                </div>
              )}

              <div className="slider-grid slider-grid--compact" style={{ marginTop: 8 }}>
                {manualRows.map((row) => renderSlider(row, key, comps, updateComp, setTyreSize))}
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
            <div className="viz-toolbar">
              <button
                className={`tab-pill tab-pill--visual ${showFit ? "tab-pill--active" : ""}`}
                onClick={() => setShowFit((v) => !v)}
              >
                Fit positions
              </button>
              <button
                className={`tab-pill tab-pill--visual ${showGeometry ? "tab-pill--active" : ""}`}
                onClick={() => setShowGeometry((v) => !v)}
              >
                Frame geometry
              </button>
              <button
                className="tab-pill tab-pill--visual"
                title={fullscreen ? "Show controls" : "Hide controls"}
                onClick={() => setFullscreen((v) => !v)}
              >
                {fullscreen ? "⊠" : "⛶"}
              </button>
            </div>
          </div>

          {/* Solve status bar: live state + residual match error */}
          <div className={`solve-status${loading ? " solve-status--live" : ""}${error ? " solve-status--error" : ""}`}>
            <span className="solve-status__dot" />
            <strong>{error ? "Solve failed" : solveStatusLabel}</strong>
            {!error && residualSaddle !== null && residualHoods !== null && (
              <span className="solve-status__residuals">
                Saddle Δ {residualSaddle.toFixed(1)} mm · Hoods Δ {residualHoods.toFixed(1)} mm
                {resultB?.constraints.status ? ` · Constraints ${resultB.constraints.status}` : ""}
              </span>
            )}
            {error && <span className="solve-status__residuals">{error}</span>}
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
                    <Wheel2D axle={bike.rearAxle} tyreRadius={radius} rimRadius={rimRadius} />
                    <Wheel2D axle={bike.frontAxle} tyreRadius={radius} rimRadius={rimRadius} />
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
                    {[bike.bb, bike.seatCluster, bike.headTubeTop, bike.headTubeBottom, bike.rearAxle, bike.frontAxle, bike.barClamp].map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={-pt.y} r={6} className="geometry-joint" />
                    ))}
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
                        stroke="rgba(250, 240, 226, 0.55)"
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        opacity={0.7}
                      />
                      <text
                        x={(ptA.x + ptB.x) / 2 + 6}
                        y={-((ptA.y + ptB.y) / 2)}
                        className="geometry-label"
                        style={{ fontSize: 18 }}
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
        </section>
      </section>

      {/* ── Results: component changes + details ── */}
      <section className="selector-panel" style={{ display: fullscreen ? "none" : undefined }}>
        <CollapsibleSection eyebrow="Results" title="Component changes A → B">
          <div className="metric-grid">
            <MetricCard
              label="Stem"
              value={`${solvedComponentsB.stem_length.toFixed(0)} mm`}
              delta={deltas ? `A ${componentsA.stem_length.toFixed(0)} mm · ${deltas.stem_length >= 0 ? "+" : ""}${deltas.stem_length.toFixed(0)} mm` : undefined}
            />
            <MetricCard
              label="Stem angle"
              value={`${solvedComponentsB.stem_angle_deg.toFixed(0)}°`}
              delta={deltas ? `A ${componentsA.stem_angle_deg.toFixed(0)}° · ${deltas.stem_angle_deg >= 0 ? "+" : ""}${deltas.stem_angle_deg.toFixed(0)}°` : undefined}
            />
            <MetricCard
              label="Spacers"
              value={`${solvedComponentsB.spacer_stack.toFixed(0)} mm`}
              delta={deltas ? `A ${componentsA.spacer_stack.toFixed(0)} mm · ${deltas.spacer_stack >= 0 ? "+" : ""}${deltas.spacer_stack.toFixed(0)} mm` : undefined}
            />
            <MetricCard
              label="Saddle offset"
              value={`${solvedComponentsB.saddle_clamp_offset.toFixed(0)} mm`}
              delta={deltas ? `A ${componentsA.saddle_clamp_offset.toFixed(0)} mm · ${deltas.saddle_clamp_offset >= 0 ? "+" : ""}${deltas.saddle_clamp_offset.toFixed(0)} mm` : undefined}
            />
            {barReachNeededB !== null ? (
              <MetricCard
                label="B bar reach needed"
                value={`${Math.round(barReachNeededB)} mm`}
                delta={`${barReachNeededB - solvedComponentsB.bar_reach >= 0 ? "+" : ""}${Math.round(barReachNeededB - solvedComponentsB.bar_reach)} mm vs current`}
              />
            ) : (
              <MetricCard label="B bar reach needed" value="Out of range" color="var(--bad)" />
            )}
            <MetricCard
              label="Frame B constraint"
              value={resultB?.constraints.status ?? "waiting"}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection eyebrow="Details" title="Seatposts & contact coordinates" defaultOpen={false}>
          <div className="metric-grid">
            <MetricCard
              label="Saddle match error"
              value={residualSaddle !== null ? `${residualSaddle.toFixed(1)} mm` : "—"}
            />
            <MetricCard
              label="Hood match error"
              value={residualHoods !== null ? `${residualHoods.toFixed(1)} mm` : "—"}
            />
            <MetricCard
              title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper."
              label="A seatpost extension"
              value={`${seatpostExtA.toFixed(0)} mm`}
            />
            <MetricCard
              title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper."
              label="B seatpost extension"
              value={`${seatpostExtB.toFixed(0)} mm`}
            />
            <MetricCard
              label="A seatpost type"
              value={<span style={{ textTransform: "capitalize" }}>{seatpostRecA.type}</span>}
              color={seatpostRecA.type === "straight" ? "var(--ok)" : "var(--warn)"}
              delta={`${Math.round(seatpostRecA.bbToRailDistance)} mm BB→rail`}
            />
            <MetricCard
              label="B seatpost type"
              value={<span style={{ textTransform: "capitalize" }}>{seatpostRecB.type}</span>}
              color={seatpostRecB.type === "straight" ? "var(--ok)" : "var(--warn)"}
              delta={`${Math.round(seatpostRecB.bbToRailDistance)} mm BB→rail`}
            />
            <MetricCard label="A saddle (X, Y)" value={`${Math.round(bikeA.saddle.x)}, ${Math.round(bikeA.saddle.y)} mm`} />
            <MetricCard label="B saddle (X, Y)" value={`${Math.round(bikeB.saddle.x)}, ${Math.round(bikeB.saddle.y)} mm`} />
            <MetricCard label="A hoods (X, Y)" value={`${Math.round(bikeA.hoods.x)}, ${Math.round(bikeA.hoods.y)} mm`} />
            <MetricCard label="B hoods (X, Y)" value={`${Math.round(bikeB.hoods.x)}, ${Math.round(bikeB.hoods.y)} mm`} />
          </div>
        </CollapsibleSection>
      </section>
    </div>
  );
};
