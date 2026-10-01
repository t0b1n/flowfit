/**
 * JS mirror of tokens.css, for three.js and SVG. Keep the two in sync.
 * CSS `--accent-text` is `accentText` here, `--band-in` is `bandIn`, and so on.
 */

export type Theme = "light" | "dark";

export interface Tokens {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  faint: string;
  faint2: string;
  accent: string;
  accentText: string;
  onAccent: string;
  bandIn: string;
  bandNear: string;
  bandOut: string;
  frame: string;
  carbon: string;
  alloy: string;
  rotor: string;
  tyre: string;
  clay: string;
  bottle: string;
}

export const TOKENS: Record<Theme, Tokens> = {
  light: {
    bg: "#E6E1D8",
    surface: "#EDE9E2",
    surface2: "#F4F1EC",
    ink: "#161616",
    muted: "#6B655D",
    faint: "rgba(22,22,22,.16)",
    faint2: "rgba(22,22,22,.08)",
    accent: "#FF4F00",
    accentText: "#D94300",
    onAccent: "#FFFFFF",
    bandIn: "#1E7D43",
    bandNear: "#B8860B",
    bandOut: "#C02828",
    frame: "#4A5240",
    carbon: "#141516",
    alloy: "#2A2C2F",
    rotor: "#9A9FA6",
    tyre: "#1A1A1A",
    clay: "#8C8276",
    bottle: "#D6CFC2",
  },
  dark: {
    bg: "#111213",
    surface: "#18191B",
    surface2: "#1F2022",
    ink: "#E8E6E1",
    muted: "#8B8984",
    faint: "rgba(232,230,225,.16)",
    faint2: "rgba(232,230,225,.07)",
    accent: "#FF5A1F",
    accentText: "#FF6A33",
    onAccent: "#FFFFFF",
    bandIn: "#3FB67A",
    bandNear: "#E0B341",
    bandOut: "#FF6B6B",
    frame: "#8E9A7C",
    carbon: "#141516",
    alloy: "#2A2C2F",
    rotor: "#9A9FA6",
    tyre: "#1A1A1A",
    clay: "#7D8085",
    bottle: "#4B4D50",
  },
};

/** 3D-only material parameters (3D plan §2). Colours that exist as tokens come from TOKENS. */
export interface Material3D {
  floor: string;
  frame: { roughness: number; clearcoat: number; clearcoatRoughness: number; metalness: number };
  alloy: { roughness: number; metalness: number };
  rubber: { color: string; roughness: number };
  spoke: { color: string; roughness: number; metalness: number };
  clay: { roughness: number };
  shoe: { color: string; roughness: number; clearcoat: number };
  /** Opacity of the previous-fit ghost (accent colour). */
  ghostOpacity: number;
}

export const material3d: Record<Theme, Material3D> = {
  light: {
    floor: "#E0DBD1",
    frame: { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, metalness: 0.1 },
    alloy: { roughness: 0.42, metalness: 0.7 },
    rubber: { color: "#1B1B1B", roughness: 0.95 },
    spoke: { color: "#2A2D31", roughness: 0.4, metalness: 0.8 },
    clay: { roughness: 0.88 },
    shoe: { color: "#1A1B1C", roughness: 0.35, clearcoat: 0.6 },
    ghostOpacity: 0.2,
  },
  dark: {
    floor: "#060607",
    frame: { roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, metalness: 0.1 },
    alloy: { roughness: 0.38, metalness: 0.75 },
    rubber: { color: "#151515", roughness: 0.95 },
    spoke: { color: "#2C2E31", roughness: 0.35, metalness: 0.8 },
    clay: { roughness: 0.72 },
    shoe: { color: "#1A1B1C", roughness: 0.35, clearcoat: 0.6 },
    ghostOpacity: 0.22,
  },
};
