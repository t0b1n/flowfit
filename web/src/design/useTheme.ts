import { useCallback, useSyncExternalStore } from "react";
import type { Theme } from "./tokens";

const STORAGE_KEY = "flowfit.theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage blocked: fall through to the default */
  }
  return "light";
}

let current: Theme = readStored();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Call once before first render so the correct theme paints immediately. */
export function initTheme() {
  current = readStored();
  apply(current);
}

function setCurrent(theme: Theme) {
  if (theme === current) return;
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Site-wide theme. Light is the brand default; the OS preference is deliberately ignored. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => current, () => "light" as Theme);
  const set = useCallback((t: Theme) => setCurrent(t), []);
  return [theme, set];
}
