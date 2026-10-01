import React from "react";
import { useNavigate } from "react-router-dom";
import { Pill } from "../design/Pill";
import { ddmm } from "./format";
import { formatMetric } from "../fitMetrics";
import { useFitHistory } from "./useFitHistory";
import "./fits.css";

/** Profile → "My fits": saved fits with Load (opens the builder with `?fit=`) and Delete. Rendered only when signed in. */
export const MyFitsSection: React.FC = () => {
  const history = useFitHistory();
  const navigate = useNavigate();
  const { fits, loading, error, remove, signedIn } = history;
  if (!signedIn) return null;

  const key = (f: (typeof fits)[number]) =>
    [
      f.metrics.saddle_height != null && `saddle ${formatMetric("saddle_height", f.metrics.saddle_height)} mm`,
      f.metrics.knee_ext_bdc != null && `knee ${formatMetric("knee_ext_bdc", f.metrics.knee_ext_bdc)}°`,
      f.metrics.drop != null && `drop ${formatMetric("drop", f.metrics.drop)} mm`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <section className="profile-section">
      <div className="ff-eyebrow">My fits</div>
      {loading && <div className="fits-note">Loading…</div>}
      {error && <div className="fits-note fits-note--error">{error}</div>}
      {!loading && fits.length === 0 && <div className="fits-note">No saved fits yet. Save one from the Fit Builder.</div>}
      <div className="fits-list">
        {fits.map((f) => (
          <div key={f.id} className="fits-row fits-row--split fits-row--wide">
            <div className="fits-row__main">
              <span>{f.name}</span>
              <em>
                {ddmm(f.created_at)} {f.frame_label && `· ${f.frame_label}`} {key(f) && `· ${key(f)}`}
              </em>
            </div>
            <Pill onClick={() => navigate(`/?fit=${encodeURIComponent(f.id)}`)}>Load</Pill>
            <Pill
              onClick={() => {
                if (window.confirm(`Delete "${f.name}"?`)) void remove(f.id);
              }}
            >
              Delete
            </Pill>
          </div>
        ))}
      </div>
    </section>
  );
};
