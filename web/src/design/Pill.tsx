import React from "react";

export type PillVariant = "ghost" | "active" | "primary";

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
}

/** Mono uppercase button. `ghost` = hairline border, `active` = ink fill, `primary` = accent fill. */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  ({ variant = "ghost", className, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`ff-pill ff-pill--${variant}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  ),
);
Pill.displayName = "Pill";

/** Alias: the plan lists "Pill / Button" as one primitive. */
export const Button = Pill;
