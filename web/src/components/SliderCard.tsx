import React from "react";

const roundToStep = (value: number, step: number) => {
  const decimals = step % 1 === 0 ? 0 : String(step).split(".")[1]?.length ?? 1;
  return Number(value.toFixed(decimals));
};

// "1760 mm" / "10°" → number + muted unit. Anything else is rendered as-is.
const renderValue = (value: React.ReactNode, unit?: string) => {
  if (unit != null) {
    return (
      <>
        {value}
        <small>{unit}</small>
      </>
    );
  }
  if (typeof value === "string") {
    const m = /^(-?[\d.,]+)\s*(\S.*)$/.exec(value);
    if (m) {
      return (
        <>
          {m[1]}
          <small>{m[2]}</small>
        </>
      );
    }
  }
  return value;
};

// Compact labelled range control with −/+ fine-adjust steppers.
// `value` is the formatted display string; `sliderValue` drives the input.
// `ticks` are optional values (in slider units) marked on the track, e.g. band edges.
export const SliderCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  min: number;
  max: number;
  step: number;
  sliderValue: number;
  onChange: (v: number) => void;
  variant?: "frame" | "target";
  disabled?: boolean;
  onReset?: () => void;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  unit?: string;
  ticks?: number[];
}> = ({
  label,
  value,
  min,
  max,
  step,
  sliderValue,
  onChange,
  variant = "frame",
  disabled,
  onReset,
  trailing,
  children,
  unit,
  ticks,
}) => {
  const nudge = (dir: 1 | -1) =>
    onChange(roundToStep(Math.min(max, Math.max(min, sliderValue + dir * step)), step));
  const span = max - min;
  const pct = (v: number) => `${span > 0 ? Math.min(100, Math.max(0, ((v - min) / span) * 100)) : 0}%`;
  return (
    <label
      className={`slider-card${variant === "target" ? " slider-card--target" : ""}${
        disabled ? " slider-card--disabled" : ""
      }`}
    >
      <div className="slider-card__header">
        <span>{label}</span>
        <span className="slider-card__value">
          <strong
            onDoubleClick={onReset}
            title={onReset ? "Double-click to reset" : undefined}
          >
            {renderValue(value, unit)}
          </strong>
          {trailing}
        </span>
      </div>
      {children}
      <div className="slider-card__row">
        <button
          type="button"
          className="slider-card__step"
          tabIndex={-1}
          disabled={disabled || sliderValue <= min}
          onClick={(e) => {
            e.preventDefault();
            nudge(-1);
          }}
        >
          −
        </button>
        <div className="slider-card__track">
          {ticks && (
            <div className="slider-card__ticks" aria-hidden>
              {ticks.map((t) => (
                <i key={t} style={{ left: pct(t) }} />
              ))}
            </div>
          )}
          <input
            className={`slider-card__input slider-card__input--${variant}`}
            style={{ "--pct": pct(sliderValue) } as React.CSSProperties}
            type="range"
            min={min}
            max={max}
            step={step}
            value={sliderValue}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="slider-card__step"
          tabIndex={-1}
          disabled={disabled || sliderValue >= max}
          onClick={(e) => {
            e.preventDefault();
            nudge(1);
          }}
        >
          +
        </button>
      </div>
    </label>
  );
};
