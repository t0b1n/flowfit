/**
 * FitAnalytics3D.tsx — in-scene fit analytics for the 3D view ("Instrument" look).
 *
 * Everything here is hairlines drawn over the rider (depthTest off, renderOrder 9) and lives under
 * `analytics-root`, so the frontal-area probe ignores it. Text is not drawn in the scene: values and
 * labels are DOM callouts (see scene3d/Callouts3D.tsx), except the small mono dimension labels.
 *
 * - ArcHairline: interior-angle arc (+ optional rays) for a registry metric.
 * - KneeArcLive: the knee arc that follows the pedalling near-side leg.
 * - KopsIndicator: KOPS plumb line following the animated near-side knee.
 * - DimensionLines3D: saddle height, setback, reach, drop with end ticks.
 * - GroundRuler: mm ruler on the floor with accent ticks at the axles and BB.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { PedalStrokeLUT, angleAtPoint, legPoseAt } from "./geometry";
import { TOKENS, type Theme } from "./design/tokens";
import type { ContactPoint } from "./types";

const OVER = { depthTest: false, renderOrder: 9 } as const;
const ARC_SEGMENTS = 32;

/** Interior-angle arc parameters at vertex v between rays to a and c. */
function arcParams(v: ContactPoint, a: ContactPoint, c: ContactPoint) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(c.y - v.y, c.x - v.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d >= 0 ? { start: a1, length: d } : { start: a2, length: -d };
}

function arcPoints(start: number, length: number, r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const ang = start + (i / ARC_SEGMENTS) * length;
    out.push([Math.cos(ang) * r, Math.sin(ang) * r, 0]);
  }
  return out;
}

export type ArcKind = "hot" | "pin" | "dim";

/** Focused: accent with rays. Pinned: ink 60%. Others (with ANGLES): ink 35%. */
export function ArcHairline({
  vertex, rayA, rayC, z, kind, theme, radius = 90,
}: {
  vertex: ContactPoint;
  rayA: ContactPoint;
  rayC: ContactPoint;
  z: number;
  kind: ArcKind;
  theme: Theme;
  radius?: number;
}) {
  const t = TOKENS[theme];
  const { start, length } = arcParams(vertex, rayA, rayC);
  const pts = useMemo(() => arcPoints(start, length, radius), [start, length, radius]);
  const color = kind === "hot" ? t.accent : t.ink;
  const opacity = kind === "hot" ? 1 : kind === "pin" ? 0.6 : 0.35;
  const ray = (target: ContactPoint): [number, number, number][] => {
    const d = new THREE.Vector2(target.x - vertex.x, target.y - vertex.y).normalize().multiplyScalar(170);
    return [[0, 0, 0], [d.x, d.y, 0]];
  };
  return (
    <group position={[vertex.x, vertex.y, z]}>
      <Line points={pts} color={color} lineWidth={1} transparent opacity={opacity} {...OVER} />
      {kind === "hot" && (
        <>
          <Line points={ray(rayA)} color={color} lineWidth={1} {...OVER} />
          <Line points={ray(rayC)} color={color} lineWidth={1} {...OVER} />
        </>
      )}
    </group>
  );
}

/** Knee arc that follows the pedalling near-side (right, +Z) leg. Hairline, ink 35%. */
export function KneeArcLive({
  lut, crankAngleRef, hip, z, theme, radius = 80,
}: {
  lut: PedalStrokeLUT;
  crankAngleRef: React.MutableRefObject<number>;
  hip: ContactPoint;
  z: number;
  theme: Theme;
  radius?: number;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: TOKENS[theme].ink, transparent: true, opacity: 0.35, depthTest: false }),
    [theme],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const pose = legPoseAt(lut, crankAngleRef.current + 180);
    const { start, length } = arcParams(pose.knee, hip, pose.ankle);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const ang = start + (i / ARC_SEGMENTS) * length;
      pos.setXYZ(i, pose.knee.x + Math.cos(ang) * radius, pose.knee.y + Math.sin(ang) * radius, z);
    }
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
    // keep the angle readable in dev tools / tests
    if (lineRef.current) lineRef.current.userData.kneeExtensionDeg = angleAtPoint(hip, pose.knee, pose.ankle);
  });
  return <primitive object={new THREE.Line(geometry, material)} ref={lineRef} renderOrder={9} />;
}

// ── KOPS plumb line ───────────────────────────────────────────────────────────

export function KopsIndicator({
  lut, crankAngleRef, z, theme,
}: {
  lut: PedalStrokeLUT;
  crankAngleRef: React.MutableRefObject<number>;
  z: number;
  theme: Theme;
}) {
  const color = TOKENS[theme].muted;
  const plumbRef = useRef<THREE.Mesh>(null);
  const offsetRef = useRef<THREE.Mesh>(null);
  const spindleRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const pose = legPoseAt(lut, crankAngleRef.current + 180);
    const topY = pose.knee.y;
    const botY = pose.spindle.y - 60;
    const plumb = plumbRef.current;
    if (plumb) {
      plumb.position.set(pose.knee.x, (topY + botY) / 2, z);
      plumb.scale.set(1, Math.max(topY - botY, 1), 1);
    }
    const offset = offsetRef.current;
    if (offset) {
      const w = pose.knee.x - pose.spindle.x;
      offset.position.set((pose.knee.x + pose.spindle.x) / 2, pose.spindle.y, z);
      offset.scale.set(Math.max(Math.abs(w), 1), 1, 1);
    }
    spindleRef.current?.position.set(pose.spindle.x, pose.spindle.y, z);
  });

  return (
    <>
      <mesh ref={plumbRef} renderOrder={9}>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh ref={offsetRef} renderOrder={9}>
        <boxGeometry args={[1, 1.2, 1.2]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh ref={spindleRef} renderOrder={9}>
        <sphereGeometry args={[4, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </>
  );
}

// ── Dimension lines ───────────────────────────────────────────────────────────

const DIM_LABEL: React.CSSProperties = {
  font: "400 10px 'Geist Mono', ui-monospace, monospace",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

function DimLine({
  from, to, label, color, labelColor,
}: {
  from: [number, number, number];
  to: [number, number, number];
  label?: string;
  color: string;
  labelColor: string;
}) {
  const mid: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  // 2 mm end ticks perpendicular to the line, in the sagittal plane
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 14;
  const ny = (dx / len) * 14;
  const tick = (p: [number, number, number]): [number, number, number][] => [
    [p[0] - nx / 2, p[1] - ny / 2, p[2]],
    [p[0] + nx / 2, p[1] + ny / 2, p[2]],
  ];
  return (
    <>
      <Line points={[from, to]} color={color} lineWidth={1} transparent opacity={0.7} {...OVER} />
      <Line points={tick(from)} color={color} lineWidth={1} transparent opacity={0.7} {...OVER} />
      <Line points={tick(to)} color={color} lineWidth={1} transparent opacity={0.7} {...OVER} />
      {label && (
        <Html position={mid} center zIndexRange={[10, 0]}>
          <div style={{ ...DIM_LABEL, color: labelColor }}>{label}</div>
        </Html>
      )}
    </>
  );
}

export function DimensionLines3D({
  saddle, hoods, z, theme,
}: {
  saddle: [number, number, number];
  hoods: [number, number, number];
  z: number;
  theme: Theme;
}) {
  const t = TOKENS[theme];
  const [sx, sy] = saddle;
  const [hx, hy] = hoods;
  const d = { color: t.ink, labelColor: t.muted };
  return (
    <>
      <Line points={[[0, 0, z], [0, sy, z]]} color={t.ink} lineWidth={1} dashed dashSize={14} gapSize={10} transparent opacity={0.35} {...OVER} />
      <DimLine from={[sx, 0, z]} to={[sx, sy, z]} label={`Saddle height ${Math.round(sy)}`} {...d} />
      <DimLine from={[0, sy, z]} to={[sx, sy, z]} label={`Setback ${Math.round(-sx)}`} {...d} />
      <DimLine from={[sx, sy, z]} to={[hx, sy, z]} label={`Reach ${Math.round(hx - sx)}`} {...d} />
      <DimLine from={[hx, sy, z]} to={[hx, hy, z]} label={`Drop ${Math.round(sy - hy)}`} {...d} />
    </>
  );
}

// ── Ground ruler ──────────────────────────────────────────────────────────────

/** Anchors for the ruler's DOM labels, in world mm (projected by Callouts3D). */
export interface RulerLabel {
  text: string;
  pos: [number, number, number];
}

export function rulerLayout(rearX: number, frontX: number, groundY: number, stanceWidth: number) {
  const z = -(stanceWidth / 2 + 260);
  const y = groundY + 1;
  const x0 = Math.floor(rearX / 50) * 50;
  const x1 = Math.ceil(frontX / 50) * 50;
  const labels: RulerLabel[] = [
    { text: "R.AXLE", pos: [rearX, y, z + 150] },
    { text: "BB 0", pos: [0, y, z + 150] },
    { text: `F.AXLE · WB ${Math.round(frontX - rearX)}`, pos: [frontX, y, z + 150] },
  ];
  return { z, y, x0, x1, labels };
}

export function GroundRuler({
  rearX, frontX, groundY, stanceWidth, theme,
}: {
  rearX: number;
  frontX: number;
  groundY: number;
  stanceWidth: number;
  theme: Theme;
}) {
  const t = TOKENS[theme];
  const { z, y, x0, x1 } = rulerLayout(rearX, frontX, groundY, stanceWidth);
  const { minor, major, hot } = useMemo(() => {
    const minor: [number, number, number][] = [];
    const major: [number, number, number][] = [];
    for (let x = x0; x <= x1; x += 25) {
      const isMajor = x % 100 === 0;
      (isMajor ? major : minor).push([x, y, z], [x, y, z + (isMajor ? 70 : 30)]);
    }
    const hot: [number, number, number][] = [];
    for (const x of [rearX, 0, frontX]) hot.push([x, y, z], [x, y, z + 160]);
    return { minor, major, hot };
  }, [x0, x1, y, z, rearX, frontX]);
  return (
    <group>
      <Line points={[[x0, y, z], [x1, y, z]]} color={t.ink} lineWidth={1} transparent opacity={0.7} {...OVER} />
      <Line points={minor} segments color={t.ink} lineWidth={1} transparent opacity={0.22} {...OVER} />
      <Line points={major} segments color={t.ink} lineWidth={1} transparent opacity={0.7} {...OVER} />
      <Line points={hot} segments color={t.accent} lineWidth={1} {...OVER} />
    </group>
  );
}
