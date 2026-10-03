/**
 * Debug mode: colours every bike component differently (2D side/front and 3D) so overlaps and mis-placed parts
 * are easy to spot. Dev builds only: `DEBUG_ENABLED` is `import.meta.env.DEV`, so production builds never show the
 * toggle, the legend or the palette. Colours come from the `--debug-N` tokens in design/tokens.css.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as THREE from "three";

export const DEBUG_ENABLED: boolean = import.meta.env.DEV;

/** Part id → palette slot (`--debug-N`). Ids are used as `data-part` in the 2D SVG and as 3D tube names. */
export const DEBUG_PARTS = [
  ["chainstay", "Chainstay"],
  ["seatstay", "Seatstay"],
  ["seat_tube", "Seat tube"],
  ["top_tube", "Top tube"],
  ["down_tube", "Down tube"],
  ["head_tube", "Head tube"],
  ["fork", "Fork"],
  ["bb_shell", "BB shell / seat cluster"],
  ["spacers", "Spacers"],
  ["stem", "Stem"],
  ["bar", "Handlebar"],
  ["hood", "Hood"],
  ["lever", "Brake lever"],
  ["seatpost", "Seatpost"],
  ["saddle", "Saddle"],
  ["bottle", "Bottle"],
  ["wheel", "Wheel"],
  ["brakes", "Disc brakes (left)"],
  ["drivetrain", "Drivetrain (right)"],
  ["crank", "Crank"],
  ["pedal", "Pedal / spindle"],
  ["shoe", "Shoe"],
  ["leg", "Leg"],
  ["torso", "Torso / head"],
  ["arm", "Arm"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

export type DebugPart = (typeof DEBUG_PARTS)[number][0];

const slot = (part: string) => DEBUG_PARTS.findIndex(([id]) => id === part) + 1;
export const debugVar = (part: string) => `var(--debug-${slot(part) || 1})`;

/** `tube.name` values from bike3d that differ from the part ids. */
const TUBE_PART: Record<string, DebugPart> = { stem_clamp: "stem", steerer: "spacers", bar_ramp: "bar", bar_drop: "bar" };
export const partForTube = (name: string): string => TUBE_PART[name] ?? name;

const matCache = new Map<string, THREE.Material>();
/** Flat 3D material for a part, coloured from the `--debug-N` token. */
export function debugMaterial(part: string): THREE.Material {
  let m = matCache.get(part);
  if (!m) {
    const css = getComputedStyle(document.documentElement).getPropertyValue(`--debug-${slot(part) || 1}`).trim();
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(css || "#ff00ff"), roughness: 0.6, metalness: 0 });
    matCache.set(part, m);
  }
  return m;
}

/** Debug on/off, persisted; always false outside dev builds. */
export function useDebugParts(): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(() => {
    if (!DEBUG_ENABLED) return false;
    try {
      // On by default in dev builds until switched off ("0" is stored when toggled off)
      return localStorage.getItem("flowfit.debug") !== "0";
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem("flowfit.debug", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }, []);
  return [DEBUG_ENABLED && on, toggle];
}

/** Rules colouring `[data-part]` elements inside `.s2d-debug` (fill for shapes, stroke for lines and rings; `data-fill` marks filled circles/paths). */
export const DebugStyle: React.FC = () => (
  <style>
    {DEBUG_PARTS.map(([id]) => {
      const c = debugVar(id);
      const P = `.s2d-debug [data-part="${id}"]`;
      return (
        `${P}:is(polygon,rect,ellipse),${P} :is(polygon,rect,ellipse){fill:${c}!important;stroke:${c}!important}` +
        `${P}:is(line,polyline,path,circle),${P} :is(line,polyline,path,circle){stroke:${c}!important}` +
        // filled circles/paths (stem boss, traced hoods, levers) opt in with data-fill
        `${P}[data-fill],${P} [data-fill]{fill:${c}!important}` +
        (id === "saddle" ? `${P} path{fill:${c}!important}` : "")
      );
    }).join("\n")}
  </style>
);

export const DebugLegend: React.FC = () => (
  <div className="debug-legend" aria-hidden>
    {DEBUG_PARTS.map(([id, label]) => (
      <span key={id} className="debug-legend__item">
        <i style={{ background: debugVar(id) }} />
        {label}
      </span>
    ))}
  </div>
);

/** 3D: true inside a debug scene so leaf components can swap their material for the part colour. */
const DebugCtx = createContext(false);
export const DebugProvider = DebugCtx.Provider;
/** Material element for `part` in debug mode, else `fallback`. */
export function useDbg(): (part: string, fallback: React.ReactElement) => React.ReactElement {
  const on = useContext(DebugCtx);
  return useCallback(
    // distinct keys: R3F does not re-attach a <primitive attach> whose `object` merely changes, which left debug
    // materials on some meshes after switching DEBUG off
    (part, fallback) => (on ? <primitive key="dbg" object={debugMaterial(part)} attach="material" /> : React.cloneElement(fallback, { key: "mat" })),
    [on],
  );
}


/** Whether the enclosing 3D scene is in debug mode. */
export const useDebugOn = () => useContext(DebugCtx);
