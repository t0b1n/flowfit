import React from "react";
import { FRAME_MEASUREMENT_IDS, type FrameMeasurementId } from "../BikeAnnotations";
import { ViewKind, RiderVisibilityPart, RIDER_VISIBILITY_LABELS, FRAME_MEASUREMENT_LABELS } from "./shared";
import { RiderVisibility } from "./shared";
import type { SizeData, FrameGeometry } from "../frameCatalog";
export interface StageToolbarProps {
  model: { id: string; brand: string; model: string; launch_year: number; category: string; popularity: string; sources: string[]; sizes: SizeData[]; };
  sizeData: { size: string; geometry: FrameGeometry; wheelbase?: number; front_center?: number; trail?: number; top_tube_effective?: number; standover?: number; bb_height?: number; seat_tube_ct?: number; head_tube?: number; stockCockpit?: { stem_length?: number; bar_width?: number; crank_length?: number; spacer_stack?: number; }; };
  viewOptions: { id: ViewKind; label: string; }[];
  view: "side" | "front" | "3d";
  setView: (value: React.SetStateAction<ViewKind>) => void;
  view3d: boolean;
  layersRef: React.MutableRefObject<HTMLDivElement | null>;
  layersOpen: boolean;
  setLayersOpen: (value: React.SetStateAction<boolean>) => void;
  setAllRiderVisibility: (value: boolean) => void;
  riderVisibility: RiderVisibility;
  toggleRiderVisibility: (part: RiderVisibilityPart) => void;
  showJointAngles: boolean;
  setShowJointAngles: (value: React.SetStateAction<boolean>) => void;
  showFitPositions: boolean;
  setShowFitPositions: (value: React.SetStateAction<boolean>) => void;
  showFrameGeometry: boolean;
  setShowFrameGeometry: (value: React.SetStateAction<boolean>) => void;
  setAllFrameMeasurements: (value: boolean) => void;
  frameMeasurementVisibility: { stack: boolean; reach: boolean; effectiveTopTube: boolean; headTubeLength: boolean; headTubeAngle: boolean; seatTubeAngle: boolean; seatTubeLength: boolean; bbDrop: boolean; chainstay: boolean; wheelbase: boolean; forkLength: boolean; forkOffset: boolean; };
  toggleFrameMeasurement: (measurement: FrameMeasurementId) => void;
  fullscreen: boolean;
  setFullscreen: (value: React.SetStateAction<boolean>) => void;
}

export const StageToolbar: React.FC<StageToolbarProps> = ({ model, sizeData, viewOptions, view, setView, view3d, layersRef, layersOpen, setLayersOpen, setAllRiderVisibility, riderVisibility, toggleRiderVisibility, showJointAngles, setShowJointAngles, showFitPositions, setShowFitPositions, showFrameGeometry, setShowFrameGeometry, setAllFrameMeasurements, frameMeasurementVisibility, toggleFrameMeasurement, fullscreen, setFullscreen }) => {
  return (
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
  );
};
