import React from "react";

/** The contact-triangle mark (3 contact dots, pedal dot in accent) + wordmark. The only place brand lives. */
export const BrandMark: React.FC<{ size?: number; wordmark?: boolean }> = ({ size = 26, wordmark = true }) => (
  <span className="ff-brand">
    <svg width={size} height={size} viewBox="0 0 46 46" role="img" aria-label="FlowFit">
      <path d="M6 12 L40 8 L20 40 Z" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="4.8" fill="var(--ink)" />
      <circle cx="40" cy="8" r="4.8" fill="var(--ink)" />
      <circle cx="20" cy="40" r="4.8" fill="var(--accent)" />
    </svg>
    {wordmark && <b className="ff-brand__word">FLOWFIT</b>}
  </span>
);
