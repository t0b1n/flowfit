import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Pill } from "../design/Pill";
import type { FitHistory } from "./useFitHistory";
import { ddmm, kneeMeta } from "./format";
import "./fits.css";

/** FIT HISTORY: saved fits (newest first) and a primary SAVE FIT pill. Plugs into ResultsColumn's `historySlot`. */
export const FitHistoryPanel: React.FC<{
  history: FitHistory;
  /** Suggested name for the next fit, e.g. "Fit 3 · Endurance". */
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onLoad: (id: string) => void;
}> = ({ history, defaultName, onSave, onLoad }) => {
  const { fits, signedIn, loading, error, compareTo, remove } = history;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await onSave((name || defaultName).trim());
      setNaming(false);
      setName("");
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fits-panel" aria-label="Fit history">
      <div className="fits-panel__head">
        <div className="ff-eyebrow">Fit history</div>
        {loading && <span className="fits-note">Loading…</span>}
      </div>

      {fits.map((f) => (
        <div key={f.id} className={`fits-row fits-row--split${compareTo?.label === f.name ? " fits-row--on" : ""}`}>
          <button type="button" className="fits-row__main" onClick={() => onLoad(f.id)} title="Load this fit">
            <span>{f.name}</span>
            <em>
              {ddmm(f.created_at)} {kneeMeta(f) && `· ${kneeMeta(f)}`}
            </em>
          </button>
          <button
            type="button"
            className="fits-link"
            onClick={() => {
              if (window.confirm(`Delete "${f.name}"?`)) void remove(f.id);
            }}
          >
            Delete
          </button>
        </div>
      ))}
      {signedIn && fits.length === 0 && !loading && <div className="fits-note">No saved fits yet.</div>}
      {error && <div className="fits-note fits-note--error">{error}</div>}

      {signedIn ? (
        naming ? (
          <form className="fits-form" onSubmit={submit}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              maxLength={120}
              aria-label="Fit name"
            />
            <Pill variant="primary" type="submit" disabled={busy}>
              Save
            </Pill>
            <Pill type="button" onClick={() => setNaming(false)}>
              Cancel
            </Pill>
            {saveError && <div className="fits-note fits-note--error">{saveError}</div>}
          </form>
        ) : (
          <Pill variant="primary" className="fits-save" onClick={() => setNaming(true)}>
            Save fit
          </Pill>
        )
      ) : (
        <Link to="/login" className="ff-pill ff-pill--ghost fits-save">
          Sign in to save fits
        </Link>
      )}
    </section>
  );
};
