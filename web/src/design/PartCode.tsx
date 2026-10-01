import React from "react";

/** Inverted part-code chip (J3, C2, …). `hot` = the focused metric (accent fill). */
export const PartCode: React.FC<{ children: React.ReactNode; hot?: boolean; className?: string }> = ({
  children,
  hot,
  className,
}) => <i className={`ff-code${hot ? " ff-code--hot" : ""}${className ? ` ${className}` : ""}`}>{children}</i>;
