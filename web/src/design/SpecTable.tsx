import React from "react";

export interface SpecRow {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  /** e.g. "+3" */
  delta?: string;
}

export interface SpecSection {
  title?: string;
  rows: SpecRow[];
}

/** Spec-sheet rows: `label · value · unit · delta`, with optional section headers and an inverted summary bar. */
export const SpecTable: React.FC<{
  sections: SpecSection[];
  summary?: { label: React.ReactNode; value: React.ReactNode };
}> = ({ sections, summary }) => (
  <div className="ff-spec">
    {sections.map((s, i) => (
      <React.Fragment key={s.title ?? i}>
        {s.title && <div className="ff-spec__head">{s.title}</div>}
        {s.rows.map((r, j) => (
          <div className="ff-spec__row" key={j}>
            <span>{r.label}</span>
            <b>{r.value}</b>
            <em>{r.unit}</em>
            <i>{r.delta}</i>
          </div>
        ))}
      </React.Fragment>
    ))}
    {summary && (
      <div className="ff-spec__bar">
        <span>{summary.label}</span>
        <b>{summary.value}</b>
      </div>
    )}
  </div>
);
