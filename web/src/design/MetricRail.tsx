import React, { useEffect } from "react";
import { StatusDot, type BandStatus } from "./StatusDot";

export interface MetricChipProps {
  code: string;
  label: string;
  value: string;
  unit?: string;
  /** e.g. "▲ 3°" (formatDelta) */
  delta?: string;
  status?: BandStatus | null;
  /** keyboard hint, e.g. "1" */
  hint?: string;
  focused?: boolean;
  pinned?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const MetricChip: React.FC<MetricChipProps> = ({
  code,
  label,
  value,
  unit,
  delta,
  status,
  hint,
  focused,
  pinned,
  onClick,
}) => (
  <button
    type="button"
    aria-pressed={!!focused || !!pinned}
    className={`ff-chip${focused ? " ff-chip--focused" : ""}${pinned ? " ff-chip--pinned" : ""}`}
    onClick={onClick}
  >
    <i className="ff-chip__code">{code}</i>
    <span className="ff-chip__label">{label}</span>
    <b className="ff-chip__value">
      {value}
      {unit && <small>{unit}</small>}
    </b>
    {delta && <u className="ff-chip__delta">{delta}</u>}
    {hint && <kbd className="ff-chip__hint">{hint}</kbd>}
    {status && <StatusDot status={status} className="ff-chip__status" />}
  </button>
);

export interface RailItem extends Omit<MetricChipProps, "focused" | "pinned" | "onClick" | "hint"> {
  id: string;
}

/**
 * Row of MetricChips. Click = focus, Shift/⌘/Ctrl-click = pin. With `keyboard`, 1–9 focuses the Nth chip,
 * Shift+1–9 pins it, Esc resets (wired on window; hosts decide when to enable it).
 */
export const MetricRail: React.FC<{
  items: RailItem[];
  focused: string;
  pinned: string[];
  onFocus: (id: string) => void;
  onTogglePin: (id: string) => void;
  onReset?: () => void;
  keyboard?: boolean;
}> = ({ items, focused, pinned, onFocus, onTogglePin, onReset, keyboard }) => {
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") return onReset?.();
      const n = Number(e.code.startsWith("Digit") ? e.code.slice(5) : e.key);
      if (n >= 1 && n <= 9 && items[n - 1]) (e.shiftKey ? onTogglePin : onFocus)(items[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, items, onFocus, onTogglePin, onReset]);

  return (
    <div className="ff-rail" role="toolbar" aria-label="Fit metrics">
      {items.map(({ id, ...chip }, i) => (
        <MetricChip
          key={id}
          {...chip}
          hint={i < 9 ? String(i + 1) : undefined}
          focused={id === focused}
          pinned={pinned.includes(id)}
          onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? onTogglePin(id) : onFocus(id))}
        />
      ))}
    </div>
  );
};
