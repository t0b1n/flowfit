/**
 * FitAnalytics3D.tsx — in-scene fit analytics for the 3D view.
 *
 * - Joint angle arcs (hip / shoulder / elbow static, knee animated) drawn as
 *   ring sectors in the sagittal plane, color-coded against the posture
 *   preset bands.
 * - Dimension lines: saddle height, setback, saddle→hood reach and drop.
 * - KOPS plumb line following the animated near-side (left) knee.
 *
 * All text labels use drei <Html> (troika <Text> would fetch its font from a
 * CDN, which the CSP blocks). The animated knee arc mutates a pre-allocated
 * fixed-vertex-count geometry per frame; labels refresh at 10 Hz.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  AngleBand,
  BandStatus,
  PedalStrokeLUT,
  angleAtPoint,
  bandStatus,
  legPoseAt,
} from "./geometry";
import type { ContactPoint } from "./types";

export const BAND_COLORS: Record<BandStatus, string> = {
  in: "#2ecc71",
  near: "#e6a817",
  out: "#e74c3c",
};

const DIM_COLOR = "#9ecbff";
const KOPS_COLOR = "#ff9e6b";

// ── Arc geometry (fixed vertex count, positions rewritten in place) ──────────

const ARC_SEGMENTS = 32;

function makeArcGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array((ARC_SEGMENTS + 1) * 2 * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const idx: number[] = [];
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(idx);
  return geo;
}

function updateArcGeometry(
  geo: THREE.BufferGeometry,
  start: number,
  length: number,
  rInner: number,
  rOuter: number,
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const ang = start + (i / ARC_SEGMENTS) * length;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    pos.setXYZ(i * 2, cos * rInner, sin * rInner, 0);
    pos.setXYZ(i * 2 + 1, cos * rOuter, sin * rOuter, 0);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
}

/** Interior-angle arc parameters at vertex v between rays to a and c. */
function arcParams(v: ContactPoint, a: ContactPoint, c: ContactPoint) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(c.y - v.y, c.x - v.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d >= 0 ? { start: a1, length: d } : { start: a2, length: -d };
}

const labelChipStyle = (color: string): React.CSSProperties => ({
  background: "rgba(13, 17, 23, 0.85)",
  border: `1px solid ${color}`,
  color: "#e8edf4",
  borderRadius: 4,
  padding: "2px 7px",
  fontSize: 12,
  fontFamily: "system-ui, sans-serif",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

// ── Static joint arc ──────────────────────────────────────────────────────────

export function JointArc({
  vertex, rayA, rayC, z, label, value, band, radius = 90,
}: {
  vertex: ContactPoint;
  rayA: ContactPoint;
  rayC: ContactPoint;
  z: number;
  label: string;
  /** Displayed value (may differ from the interior angle, e.g. elbow flexion). */
  value: number;
  band: AngleBand;
  radius?: number;
}) {
  const geo = useMemo(makeArcGeometry, []);
  const { start, length } = arcParams(vertex, rayA, rayC);
  useMemo(
    () => updateArcGeometry(geo, start, length, radius - 6, radius),
    [geo, start, length, radius]
  );
  useEffect(() => () => geo.dispose(), [geo]);

  const color = BAND_COLORS[bandStatus(value, band)];
  const mid = start + length / 2;
  const labelR = radius + 42;

  return (
    <group position={[vertex.x, vertex.y, z]}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
      <Html
        position={[Math.cos(mid) * labelR, Math.sin(mid) * labelR, 0]}
        center
        zIndexRange={[10, 0]}
      >
        <div style={labelChipStyle(color)}>
          {label} {value.toFixed(0)}°
        </div>
      </Html>
    </group>
  );
}

// ── Animated knee arc (follows the near-side / left leg) ─────────────────────

export function KneeArcAnimated({
  lut, crankAngleRef, hip, z, band, radius = 80,
}: {
  lut: PedalStrokeLUT;
  crankAngleRef: React.MutableRefObject<number>;
  hip: ContactPoint;
  z: number;
  band: AngleBand;
  radius?: number;
}) {
  const geo = useMemo(makeArcGeometry, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const [labelState, setLabelState] = useState({ x: 0, y: 0, deg: 0, color: BAND_COLORS.in });

  // Label + color at 10 Hz; geometry every frame.
  useEffect(() => {
    const id = setInterval(() => {
      const pose = legPoseAt(lut, crankAngleRef.current + 180);
      const ext = angleAtPoint(hip, pose.knee, pose.ankle);
      const { start, length } = arcParams(pose.knee, hip, pose.ankle);
      const mid = start + length / 2;
      setLabelState({
        x: pose.knee.x + Math.cos(mid) * (radius + 42),
        y: pose.knee.y + Math.sin(mid) * (radius + 42),
        deg: ext,
        color: BAND_COLORS[bandStatus(ext, band)],
      });
    }, 100);
    return () => clearInterval(id);
  }, [lut, crankAngleRef, hip, band, radius]);

  useFrame(() => {
    const pose = legPoseAt(lut, crankAngleRef.current + 180);
    const { start, length } = arcParams(pose.knee, hip, pose.ankle);
    updateArcGeometry(geo, start, length, radius - 6, radius);
    groupRef.current?.position.set(pose.knee.x, pose.knee.y, z);
    matRef.current?.color.set(labelState.color);
  });

  return (
    <>
      <group ref={groupRef}>
        <mesh geometry={geo}>
          <meshBasicMaterial ref={matRef} side={THREE.DoubleSide} transparent opacity={0.9} />
        </mesh>
      </group>
      <Html position={[labelState.x, labelState.y, z]} center zIndexRange={[10, 0]}>
        <div style={labelChipStyle(labelState.color)}>
          Knee {labelState.deg.toFixed(0)}°
        </div>
      </Html>
    </>
  );
}

// ── KOPS plumb line ───────────────────────────────────────────────────────────

export function KopsIndicator({
  lut, crankAngleRef, z,
}: {
  lut: PedalStrokeLUT;
  crankAngleRef: React.MutableRefObject<number>;
  z: number;
}) {
  const plumbRef = useRef<THREE.Mesh>(null);
  const offsetRef = useRef<THREE.Mesh>(null);
  const spindleRef = useRef<THREE.Mesh>(null);
  const [label, setLabel] = useState({ x: 0, y: 0, mm: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const pose = legPoseAt(lut, crankAngleRef.current + 180);
      setLabel({
        x: pose.knee.x + 30,
        y: pose.spindle.y - 90,
        mm: pose.knee.x - pose.spindle.x,
      });
    }, 100);
    return () => clearInterval(id);
  }, [lut, crankAngleRef]);

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
      // Horizontal offset bar at spindle height: knee plumb → spindle
      const w = pose.knee.x - pose.spindle.x;
      offset.position.set((pose.knee.x + pose.spindle.x) / 2, pose.spindle.y, z);
      offset.scale.set(Math.max(Math.abs(w), 1), 1, 1);
    }
    spindleRef.current?.position.set(pose.spindle.x, pose.spindle.y, z);
  });

  return (
    <>
      {/* Vertical plumb line (unit-height cylinder scaled per frame) */}
      <mesh ref={plumbRef}>
        <cylinderGeometry args={[2.2, 2.2, 1, 8, 1]} />
        <meshBasicMaterial color={KOPS_COLOR} transparent opacity={0.9} />
      </mesh>
      {/* Horizontal knee→spindle offset bar (unit-width box scaled per frame) */}
      <mesh ref={offsetRef}>
        <boxGeometry args={[1, 5, 5]} />
        <meshBasicMaterial color={KOPS_COLOR} />
      </mesh>
      {/* Pedal spindle marker */}
      <mesh ref={spindleRef}>
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial color={KOPS_COLOR} />
      </mesh>
      <Html position={[label.x, label.y, z]} center zIndexRange={[10, 0]}>
        <div style={labelChipStyle(KOPS_COLOR)}>
          KOPS {label.mm >= 0 ? "+" : ""}{label.mm.toFixed(0)} mm
        </div>
      </Html>
    </>
  );
}

// ── Dimension lines ───────────────────────────────────────────────────────────

function DimLine({
  from, to, label,
}: {
  from: [number, number, number];
  to: [number, number, number];
  label?: string;
}) {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  return (
    <>
      <Line points={[from, to]} color={DIM_COLOR} lineWidth={1.5} />
      <mesh position={from}>
        <sphereGeometry args={[4, 8, 8]} />
        <meshBasicMaterial color={DIM_COLOR} />
      </mesh>
      <mesh position={to}>
        <sphereGeometry args={[4, 8, 8]} />
        <meshBasicMaterial color={DIM_COLOR} />
      </mesh>
      {label && (
        <Html position={mid} center zIndexRange={[10, 0]}>
          <div style={labelChipStyle(DIM_COLOR)}>{label}</div>
        </Html>
      )}
    </>
  );
}

export function DimensionLines3D({
  saddle, hoods, z,
}: {
  saddle: [number, number, number];
  hoods: [number, number, number]; // cockpit midpoint
  z: number;
}) {
  const [sx, sy] = saddle;
  const [hx, hy] = hoods;
  return (
    <>
      {/* BB vertical reference (faint) */}
      <Line
        points={[[0, 0, z], [0, sy, z]]}
        color={DIM_COLOR}
        lineWidth={1}
        dashed
        dashSize={14}
        gapSize={10}
        transparent
        opacity={0.4}
      />
      <DimLine from={[sx, 0, z]} to={[sx, sy, z]} label={`Saddle height ${Math.round(sy)} mm`} />
      <DimLine from={[0, sy, z]} to={[sx, sy, z]} label={`Setback ${Math.round(-sx)} mm`} />
      <DimLine from={[sx, sy, z]} to={[hx, sy, z]} label={`Reach ${Math.round(hx - sx)} mm`} />
      <DimLine from={[hx, sy, z]} to={[hx, hy, z]} label={`Drop ${Math.round(sy - hy)} mm`} />
    </>
  );
}
