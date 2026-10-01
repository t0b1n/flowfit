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
    bottle: THREE.Material;
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
  const bottle = new THREE.MeshStandardMaterial({ color: t.bottle, roughness: 0.6, metalness: 0 });
  return {
    frame: el(frame), carbon: el(carbon), clay: el(clay), tyre: el(tyre), spoke: el(spoke), tape: el(tape),
    m: { frame, carbon, clay, tyre, spoke, tape, alloy, rotor, bottle },
    raw: [frame, carbon, clay, tyre, spoke, tape, alloy, rotor, bottle],
  };
}

const MatsContext = createContext<Mats | null>(null);

export const MatsProvider: React.FC<{ theme: Theme; children: React.ReactNode }> = ({ theme, children }) => {
  const mats = useMemo(() => buildMats(theme), [theme]);
  useEffect(() => () => mats.raw.forEach((x) => x.dispose()), [mats]);
  return <MatsContext.Provider value={mats}>{children}</MatsContext.Provider>;
};

export function useMats(): Mats {
  const m = useContext(MatsContext);
  if (!m) throw new Error("useMats must be used inside <MatsProvider>");
  return m;
}
