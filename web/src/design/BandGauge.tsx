import React from "react";

/**
 * Track with the target band filled in ink, a `now` marker (accent) and an optional `was` marker
 * (accent at 40%). The track spans band ± 1.5 × band width unless `scale` is given.
 */
export const BandGauge: React.FC<{
  value: number;
  band: [number, number];
  was?: number | null;
  scale?: [number, number];
  /** Compact (4 px) gauge for pinned readouts. */
  mini?: boolean;
  showScale?: boolean;
}> = ({ value, band, was, scale, mini, showScale = true }) => {
  const w = band[1] - band[0];
  const [lo, hi] = scale ?? [band[0] - w * 1.5, band[1] + w * 1.5];
  const pc = (x: number) => `${Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  return (
    <div className={`ff-gauge${mini ? " ff-gauge--mini" : ""}`}>
      <div className="ff-gauge__track">
        <div className="ff-gauge__band" style={{ left: pc(band[0]), width: `calc(${pc(band[1])} - ${pc(band[0])})` }} />
        {was != null && <div className="ff-gauge__was" style={{ left: pc(was) }} />}
        <div className="ff-gauge__now" style={{ left: pc(value) }} />
      </div>
      {showScale && !mini && (
        <div className="ff-gauge__scale">
          <span>{Math.round(lo)}</span>
          <span style={{ left: pc(band[0]) }}>{band[0]}</span>
          <span style={{ left: pc(band[1]) }}>{band[1]}</span>
          <span>{Math.round(hi)}</span>
        </div>
      )}
    </div>
  );
};
