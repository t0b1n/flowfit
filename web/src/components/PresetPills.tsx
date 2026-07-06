import React from "react";

// Preset → fine-tune pattern: a row of pills sets a value, a slider elsewhere
// allows override (which usually clears the active pill).
export const PresetPills: React.FC<{
  options: ReadonlyArray<{ id: string; label: string; title?: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  small?: boolean;
  inline?: boolean;
}> = ({ options, activeId, onSelect, small, inline }) => (
  <div className={`preset-row${inline ? " preset-row--inline" : ""}`}>
    {options.map((opt) => (
      <button
        key={opt.id}
        type="button"
        title={opt.title}
        className={`preset-pill${small ? " preset-pill--sm" : ""}${
          activeId === opt.id ? " preset-pill--active" : ""
        }`}
        onClick={() => onSelect(opt.id)}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
