import React, { useState } from "react";

export const CollapsibleSection: React.FC<{
  eyebrow: string;
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ eyebrow, title, defaultOpen = true, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="subpanel">
      <button
        className="subpanel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h3>{title}</h3>
        <span className="subpanel-toggle__aside">
          {badge}
          <span>{eyebrow}</span>
          <span className={`subpanel-chevron${open ? "" : " subpanel-chevron--closed"}`} />
        </span>
      </button>
      {open && <div className="subpanel-body">{children}</div>}
    </div>
  );
};
