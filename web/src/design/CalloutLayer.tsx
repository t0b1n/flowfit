import React, { useMemo } from "react";
import { PartCode } from "./PartCode";
import { METRIC_BY_ID, formatMetric, type MetricId } from "../fitMetrics";

export interface CalloutAnchor {
  id: MetricId;
  /** Screen px, relative to the layer's top-left. */
  x: number;
  y: number;
  hot?: boolean;
}

export interface CalloutLayerProps {
  anchors: CalloutAnchor[];
  width: number;
  height: number;
  /** Preferred direction (dx, dy in px) of the diagonal leader segment, per id. */
  prefer?: Partial<Record<MetricId, [number, number]>>;
  /** Metric values for the label text (`J3 KNEE EXT 150°`). Without a value only code + short name show. */
  values?: Partial<Record<MetricId, number>>;
}

export interface CalloutPlacement {
  id: MetricId;
  /** anchor */
  x: number;
  y: number;
  /** end of the diagonal segment = start of the horizontal one */
  ex: number;
  ey: number;
  /** end of the horizontal segment */
  hx: number;
  dir: 1 | -1;
  /** label box (top-left) */
  lx: number;
  ly: number;
}

export const LEADER_H = 140;
export const LABEL_W = 140;
export const LABEL_H = 22;
const INSET = 24;
const GAP = 6;
const DEFAULT_PREFER: [number, number] = [90, -60];

/**
 * Pure layout: diagonal then horizontal leaders, then an overlap-avoidance pass
 * (sort by y, push down by the overlap + 6 px, clamp to the container with a 24 px inset).
 */
export function layoutCallouts(
  anchors: Pick<CalloutAnchor, "id" | "x" | "y">[],
  width: number,
  height: number,
  prefer: Partial<Record<MetricId, [number, number]>> = {},
): CalloutPlacement[] {
  const placed: CalloutPlacement[] = anchors.map((a) => {
    const [dx, dy] = prefer[a.id] ?? DEFAULT_PREFER;
    const dir: 1 | -1 = dx >= 0 ? 1 : -1;
    const ex = a.x + dx;
    const ey = a.y + dy;
    const hx = ex + dir * LEADER_H;
    return { id: a.id, x: a.x, y: a.y, ex, ey, hx, dir, lx: dir > 0 ? ex + 4 : hx, ly: ey - LABEL_H };
  });
  const clampY = (y: number) => Math.min(Math.max(y, INSET), Math.max(INSET, height - INSET - LABEL_H));
  const clampX = (x: number) => Math.min(Math.max(x, INSET), Math.max(INSET, width - INSET - LABEL_W));
  for (const p of placed) {
    p.lx = clampX(p.lx);
    p.ly = clampY(p.ly);
  }
  const order = [...placed].sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < order.length; i++) {
    const cur = order[i];
    for (let j = 0; j < i; j++) {
      const prev = order[j];
      const xOverlap = cur.lx < prev.lx + LABEL_W && prev.lx < cur.lx + LABEL_W;
      const overlap = prev.ly + LABEL_H - cur.ly;
      if (xOverlap && overlap > 0 && cur.ly < prev.ly + LABEL_H) cur.ly += overlap + GAP;
    }
    if (cur.ly > height - INSET - LABEL_H) {
      // No room below: clamp, accepting the overlap rather than leaving the container.
      cur.ly = clampY(cur.ly);
    }
  }
  for (const p of placed) {
    // The label sits just above the horizontal run; re-derive the run from the (clamped) label box.
    p.ey = p.ly + LABEL_H;
    p.ex = p.dir > 0 ? p.lx - 4 : p.lx + LABEL_W;
    p.hx = p.ex + p.dir * LEADER_H;
  }
  return placed;
}

/**
 * DOM overlay shared by the 2D and 3D views. Anchors are in screen px; draws a dot, a leader
 * (diagonal then horizontal) and a `PartCode` label per anchor. Pointer events pass through.
 */
export const CalloutLayer: React.FC<CalloutLayerProps> = ({ anchors, width, height, prefer, values }) => {
  const placements = useMemo(() => layoutCallouts(anchors, width, height, prefer), [anchors, width, height, prefer]);
  const byId = new Map(anchors.map((a) => [a.id, a]));
  return (
    <div className="ff-callouts" style={{ width, height }}>
      <svg className="ff-callouts__svg" width={width} height={height} aria-hidden>
        {placements.map((p) => {
          const hot = byId.get(p.id)?.hot;
          return (
            <g key={p.id} className={hot ? "ff-callouts__hot" : undefined}>
              <polyline points={`${p.x},${p.y} ${p.ex},${p.ey} ${p.hx},${p.ey}`} />
              <circle cx={p.x} cy={p.y} r={3.5} />
            </g>
          );
        })}
      </svg>
      {placements.map((p) => {
        const a = byId.get(p.id)!;
        const def = METRIC_BY_ID[a.id];
        const v = values?.[a.id];
        return (
          <div
            key={p.id}
            className={`ff-callout${a.hot ? " ff-callout--hot" : ""}${p.dir < 0 ? " ff-callout--left" : ""}`}
            style={{ left: p.lx, top: p.ly, width: LABEL_W }}
          >
            <PartCode hot={a.hot}>{def.code}</PartCode>
            <span>
              {def.short}
              {v != null && (
                <>
                  {" "}
                  <b>{formatMetric(a.id, v)}</b>
                  <span className="ff-callout__unit">{def.unit === "mm" ? " mm" : def.unit}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};
