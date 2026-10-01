import React from "react";

export interface SegmentedOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  title?: string;
}

/** Joined row of equal cells; the active cell is ink-filled. Used for Side/Front/3D, Contact/Saddle, theme. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T | null;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`ff-seg${className ? ` ${className}` : ""}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          title={o.title}
          className={`ff-seg__cell${value === o.id ? " ff-seg__cell--on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
