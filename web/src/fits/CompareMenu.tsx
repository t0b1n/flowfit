import React, { useEffect, useRef, useState } from "react";
import { Pill } from "../design/Pill";
import type { CompareTarget } from "./capture";
import type { FitHistory } from "./useFitHistory";
import { ddmm, kneeMeta } from "./format";
import "./fits.css";

/** `COMPARE {fit} ▾`: pick the fit the readout deltas and ghost compare against. */
export const CompareMenu: React.FC<{
  history: FitHistory;
  /** In-memory snapshot (works signed out); shown as "Session snapshot". */
  sessionSnapshot: CompareTarget | null;
  onLoad: (id: string) => void;
  /** Freeze the current fit in memory as the comparison (works signed out). */
  onTakeSnapshot?: () => void;
}> = ({ history, sessionSnapshot, onLoad, onTakeSnapshot }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { fits, compareTo, compareWith, setCompareTo, remove } = history;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = async (id: string | null) => {
    await compareWith(id);
    setOpen(false);
  };

  return (
    <div className="fits-compare" ref={ref}>
      <Pill variant={compareTo ? "active" : "ghost"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Compare {compareTo ? compareTo.label : "—"} ▾
      </Pill>
      {open && (
        <div className="fits-popover" role="menu">
          <button type="button" className="fits-row" role="menuitem" onClick={() => pick(null)}>
            <span>None</span>
          </button>
          {onTakeSnapshot && (
            <button
              type="button"
              className="fits-row"
              role="menuitem"
              onClick={() => {
                onTakeSnapshot();
                setOpen(false);
              }}
            >
              <span>Snapshot current fit</span>
            </button>
          )}
          {sessionSnapshot && (
            <button
              type="button"
              className="fits-row"
              role="menuitem"
              onClick={() => {
                setCompareTo(sessionSnapshot);
                setOpen(false);
              }}
            >
              <span>Session snapshot</span>
            </button>
          )}
          {fits.map((f) => (
            <div key={f.id} className="fits-row fits-row--split">
              <button type="button" role="menuitem" className="fits-row__main" onClick={() => pick(f.id)}>
                <span>{f.name}</span>
                <em>
                  {ddmm(f.created_at)} {kneeMeta(f) && `· ${kneeMeta(f)}`}
                </em>
              </button>
              <button type="button" className="fits-link" onClick={() => onLoad(f.id)}>
                Load
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
          {!history.signedIn && <div className="fits-note">Sign in to save fits and compare them later.</div>}
        </div>
      )}
    </div>
  );
};
