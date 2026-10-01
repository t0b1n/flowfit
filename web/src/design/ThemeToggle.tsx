import React from "react";
import { useTheme } from "./useTheme";

/** The `◐ LIGHT` / `◑ DARK` pill. Toggles the site-wide theme. */
export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      className="ff-pill ff-pill--ghost"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "light" ? "◐ LIGHT" : "◑ DARK"}
    </button>
  );
};
