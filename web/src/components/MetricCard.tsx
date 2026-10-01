import React from "react";

export const MetricCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  /** Status colour, shown as a small dot beside the value (never as text colour). */
  color?: string;
  title?: string;
  labelStyle?: React.CSSProperties;
}> = ({ label, value, delta, color, title, labelStyle }) => (
  <div className="metric-card" title={title}>
    <div className="metric-card__label" style={labelStyle}>
      {label}
    </div>
    <div className="metric-card__compare">
      {color && <span className="metric-card__dot" style={{ background: color }} />}
      <strong>{value}</strong>
    </div>
    {delta != null && <div className="metric-card__delta">{delta}</div>}
  </div>
);
