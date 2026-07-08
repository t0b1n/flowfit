import React from "react";

export const MetricCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  color?: string;
  title?: string;
  labelStyle?: React.CSSProperties;
}> = ({ label, value, delta, color, title, labelStyle }) => (
  <div className="metric-card" title={title}>
    <div className="metric-card__label" style={labelStyle}>
      {label}
    </div>
    <div className="metric-card__compare" style={color ? { color } : undefined}>
      <strong>{value}</strong>
    </div>
    {delta != null && <div className="metric-card__delta">{delta}</div>}
  </div>
);
