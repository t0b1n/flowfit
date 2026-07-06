import React from "react";

const roundToStep = (value: number, step: number) => {
  const decimals = step % 1 === 0 ? 0 : String(step).split(".")[1]?.length ?? 1;
  return Number(value.toFixed(decimals));
};

// Compact labelled range control with −/+ fine-adjust steppers.
// `value` is the formatted display string; `sliderValue` drives the input.
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
}) => {
  const nudge = (dir: 1 | -1) =>
    onChange(roundToStep(Math.min(max, Math.max(min, sliderValue + dir * step)), step));
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
            {value}
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
        <input
          className={`slider-card__input slider-card__input--${variant}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
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
