import React, { createContext, useContext, useEffect, useMemo } from "react";
import * as THREE from "three";
import { TOKENS, material3d, type Theme } from "../design/tokens";

type MatEl = React.ReactElement;

/** Shared, theme-keyed materials. Built once per theme; never create a material per mesh. */
export interface Mats {
  frame: MatEl;
  /** stem, bar, seatpost, rims, cranks, hub shells */
  carbon: MatEl;
  clay: MatEl;
  tyre: MatEl;
  spoke: MatEl;
  /** bar tape / hoods */
  tape: MatEl;
  /** The same materials as plain three.js objects, for the mesh builders (riderMesh / bike3d). */
  m: {
    frame: THREE.Material;
    carbon: THREE.Material;
    clay: THREE.Material;
    tyre: THREE.Material;
    spoke: THREE.Material;
    tape: THREE.Material;
    alloy: THREE.Material;
    rotor: THREE.Material;
    /** silver small cogs, darker titanium big cogs, and the dark back-face shell that outlines each cylinder cog */
    cassette: THREE.Material;
    cassetteBig: THREE.Material;
    cassetteEdge: THREE.Material;
    /** matte rubber hood covers */
    hood: THREE.Material;
    /** gloss carbon brake blades */
    lever: THREE.Material;
    /** saddle shell and its rails (SaddleMesh) */
    saddle: THREE.Material;
    rail: THREE.Material;
    /** the traced saddle's carbon rails */
    saddleRail: THREE.Material;
  };
  raw: THREE.Material[];
}

const el = (m: THREE.Material): MatEl => <primitive object={m} attach="material" />;

export function buildMats(theme: Theme): Mats {
  const t = TOKENS[theme];
  const m = material3d[theme];
  const frame = new THREE.MeshPhysicalMaterial({ color: t.frame, ...m.frame });
  const carbon = new THREE.MeshPhysicalMaterial({ color: t.carbon, ...m.alloy });
  const clay = new THREE.MeshStandardMaterial({ color: t.clay, roughness: m.clay.roughness, metalness: 0 });
  const tyre = new THREE.MeshStandardMaterial({ ...m.rubber, color: t.tyre });
  const spoke = new THREE.MeshStandardMaterial({ color: m.spoke.color, roughness: m.spoke.roughness, metalness: m.spoke.metalness });
  const tape = new THREE.MeshStandardMaterial({ color: t.tyre, roughness: 0.85, metalness: 0.05 });
  const alloy = new THREE.MeshStandardMaterial({ color: t.alloy, roughness: m.alloy.roughness, metalness: m.alloy.metalness });
  const rotor = new THREE.MeshStandardMaterial({ color: t.rotor, roughness: 0.4, metalness: 0.8 });
  // Hood rubber: lifted slightly toward clay so the traced shape reads against the black bar.
  const hood = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.tyre).lerp(new THREE.Color(t.clay), 0.18), roughness: 0.88, metalness: 0 });
  const lever = new THREE.MeshPhysicalMaterial({ color: t.carbon, roughness: 0.28, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const saddle = new THREE.MeshStandardMaterial({ color: "#0f0f0f", roughness: 0.88, metalness: 0.04 });
  const rail = new THREE.MeshStandardMaterial({ color: "#c8c8c8", roughness: 0.18, metalness: 0.82 });
  const saddleRail = new THREE.MeshStandardMaterial({ color: "#1c1c1c", roughness: 0.45, metalness: 0.3 });
  const cassette = new THREE.MeshStandardMaterial({ color: "#d8d4c8", roughness: 0.3, metalness: 0.8 });
  const cassetteBig = new THREE.MeshStandardMaterial({ color: "#8e9094", roughness: 0.4, metalness: 0.8 });
  const cassetteEdge = new THREE.MeshBasicMaterial({ color: "#1a1a1a", side: THREE.BackSide });
  return {
    frame: el(frame), carbon: el(carbon), clay: el(clay), tyre: el(tyre), spoke: el(spoke), tape: el(tape),
    m: { frame, carbon, clay, tyre, spoke, tape, alloy, rotor, cassette, cassetteBig, cassetteEdge, hood, lever, saddle, rail, saddleRail },
    raw: [frame, carbon, clay, tyre, spoke, tape, alloy, rotor, cassette, cassetteBig, cassetteEdge, hood, lever, saddle, rail, saddleRail],
  };
}

/** "flat": unlit token colours (side view); "flatLit": the same colours under a soft light (front view). */
export type Look = "flat" | "flatLit";

/** Any CSS colour string (incl. `color-mix()` results) → THREE.Color, via a 1×1 canvas. */
function cssColor(css: string): THREE.Color {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#ff00ff";
  g.fillStyle = css;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
}

/** Fills the 2D side view uses, read from the real stylesheet so the two renderers cannot drift apart. */
function readS2dColors(theme: Theme): Record<"frame" | "carbon" | "clay" | "tyre" | "alloy" | "rotor" | "saddle", THREE.Color> {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "s2d");
  svg.setAttribute("data-theme", theme);
  svg.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
  const parts: Array<[string, string, "fill" | "stroke"]> = [
    ["frame", "s2d-frame", "fill"], ["carbon", "s2d-carbon", "fill"], ["clay", "s2d-clay", "fill"], ["tyre", "s2d-bar", "stroke"],
    ["alloy", "s2d-hub", "fill"], ["rotor", "s2d-rotor", "stroke"], ["saddle", "s2d-saddle-body", "fill"],
  ];
  const els = parts.map(([, cls]) => {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    // the saddle body is styled as `.s2d-saddle .geometry-saddle-body`
    if (cls === "s2d-saddle-body") {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "s2d-saddle");
      r.setAttribute("class", "geometry-saddle-body");
      g.appendChild(r);
      svg.appendChild(g);
    } else {
      r.setAttribute("class", cls);
      svg.appendChild(r);
    }
    return r;
  });
  document.body.appendChild(svg);
  const out = {} as Record<string, THREE.Color>;
  parts.forEach(([key, , prop], i) => {
    out[key] = cssColor(getComputedStyle(els[i])[prop]);
  });
  svg.remove();
  return out as ReturnType<typeof readS2dColors>;
}

/** Same keys as `buildMats`, in flat colours taken from the 2D stylesheet (`.s2d-*`). Re-read when the theme changes. */
export function buildFlatMats(theme: Theme, lit: boolean): Mats {
  const c = readS2dColors(theme);
  const mk = (color: THREE.Color) => (lit ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshBasicMaterial({ color }));
  const frame = mk(c.frame);
  const carbon = mk(c.carbon);
  const clay = mk(c.clay);
  const tyre = mk(c.tyre);
  const alloy = mk(c.alloy);
  const rotor = mk(c.rotor);
  const saddle = mk(c.saddle);
  // spokes, tape, hoods and levers are drawn in carbon in 2D
  const spoke = mk(c.carbon);
  const tape = mk(c.carbon);
  const hood = mk(c.carbon);
  const lever = mk(c.carbon);
  const rail = mk(c.carbon);
  const saddleRail = mk(c.carbon);
  // silver cogs with a dark edge shell (the depth-edge pass can't see steps this small)
  const cassette = mk(new THREE.Color().setRGB(0.85, 0.83, 0.78, THREE.SRGBColorSpace));
  const cassetteBig = mk(new THREE.Color().setRGB(0.56, 0.57, 0.58, THREE.SRGBColorSpace));
  const cassetteEdge = new THREE.MeshBasicMaterial({ color: "#1a1a1a", side: THREE.BackSide });
  return {
    frame: el(frame), carbon: el(carbon), clay: el(clay), tyre: el(tyre), spoke: el(spoke), tape: el(tape),
    m: { frame, carbon, clay, tyre, spoke, tape, alloy, rotor, cassette, cassetteBig, cassetteEdge, hood, lever, saddle, rail, saddleRail },
    raw: [frame, carbon, clay, tyre, spoke, tape, alloy, rotor, cassette, cassetteBig, cassetteEdge, hood, lever, saddle, rail, saddleRail],
  };
}

const MatsContext = createContext<Mats | null>(null);

export const MatsProvider: React.FC<{ theme: Theme; look?: Look; children: React.ReactNode }> = ({ theme, look, children }) => {
  const mats = useMemo(() => (look ? buildFlatMats(theme, look === "flatLit") : buildMats(theme)), [theme, look]);
  useEffect(() => () => mats.raw.forEach((x) => x.dispose()), [mats]);
  return <MatsContext.Provider value={mats}>{children}</MatsContext.Provider>;
};

/** Normals are only read by lit materials; the unlit flat look lets the mesh builders skip computing them. */
export function useNeedsNormals(): boolean {
  const m = useMats();
  return !(m.m.clay instanceof THREE.MeshBasicMaterial);
}

export function useMats(): Mats {
  const m = useContext(MatsContext);
  if (!m) throw new Error("useMats must be used inside <MatsProvider>");
  return m;
}
