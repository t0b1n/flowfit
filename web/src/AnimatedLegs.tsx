/**
 * AnimatedLegs.tsx — pedaling animation for the 3D mannequin.
 *
 * Owns everything that moves through the pedal stroke: thighs, shins, feet,
 * knee/ankle joint spheres, crank arms and pedals — plus the static crank
 * axle and chainring. The declarative mannequin in BikeScene3D excludes the
 * leg points/edges when this component is mounted (see LEG_POINT_NAMES /
 * LEG_EDGE_GROUPS in bike3d.ts).
 *
 * Performance contract: geometries are created once (limb lengths are
 * constant through the stroke); useFrame mutates only positions/quaternions.
 * The crank angle lives in a shared ref so the toolbar scrub and the
 * analytics overlays can read/write it without re-rendering per frame.
 */

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  GAP_FRACTION,
  MANNEQUIN_EDGE_SPEC,
  MANNEQUIN_JOINT_SPEC,
  scaleRadius,
} from "./bike3d";
import { legPoseAt, PedalStrokeLUT } from "./geometry";

// Materials — match the declarative mannequin/frame materials in BikeScene3D
// so paused animation is indistinguishable from the static render.
const BODY_MATERIAL = (
  <meshStandardMaterial color="#7a8fa6" roughness={0.55} metalness={0.05} />
);
const JOINT_MATERIAL = (
  <meshStandardMaterial color="#5c6e82" roughness={0.4} metalness={0.1} />
);
const OUTLINE_MATERIAL = (
  <meshBasicMaterial color="#2a3540" side={THREE.BackSide} />
);
const CRANK_MATERIAL = (
  <meshStandardMaterial color="#26262b" roughness={0.35} metalness={0.7} />
);
const CHAINRING_MATERIAL = (
  <meshStandardMaterial color="#3d3d44" roughness={0.3} metalness={0.8} />
);
const PEDAL_MATERIAL = (
  <meshStandardMaterial color="#141416" roughness={0.6} metalness={0.3} />
);

const OUTLINE_SCALE = 1.015;

// Scratch objects reused every frame — zero per-frame allocations.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** Orient a group like a Y-axis capsule spanning A→B (midpoint + rotation). */
function setSegment(
  g: THREE.Group | null,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): void {
  if (!g) return;
  _a.set(ax, ay, az);
  _b.set(bx, by, bz);
  _dir.subVectors(_b, _a);
  const len = _dir.length();
  if (len < 1e-3) return;
  _dir.divideScalar(len);
  _mid.addVectors(_a, _b).multiplyScalar(0.5);
  g.position.copy(_mid);
  g.quaternion.setFromUnitVectors(_Y, _dir);
}

const dist3 = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
) => Math.hypot(bx - ax, by - ay, bz - az);

/** Capsule limb with inverted-hull outline; transform mutated per frame. */
const LimbCapsule = React.forwardRef<THREE.Group, { radius: number; bodyLength: number }>(
  ({ radius, bodyLength }, ref) => (
    <group ref={ref}>
      <mesh>
        <capsuleGeometry args={[radius, bodyLength, 16, 32]} />
        {BODY_MATERIAL}
      </mesh>
      <mesh scale={[OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE]}>
        <capsuleGeometry args={[radius, bodyLength, 16, 32]} />
        {OUTLINE_MATERIAL}
      </mesh>
    </group>
  )
);

const JointSphere = React.forwardRef<THREE.Group, { radius: number }>(
  ({ radius }, ref) => (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        {JOINT_MATERIAL}
      </mesh>
      <mesh scale={[OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE]}>
        <sphereGeometry args={[radius, 32, 32]} />
        {OUTLINE_MATERIAL}
      </mesh>
    </group>
  )
);

interface AnimatedLegsProps {
  lut: PedalStrokeLUT;
  /** Hip joint world positions from the (overridden) mannequin point set. */
  hipL: [number, number, number];
  hipR: [number, number, number];
  bb: [number, number, number];
  halfStance: number;
  weightKg: number;
  crankAngleRef: React.MutableRefObject<number>;
  playing: boolean;
  cadenceRpm: number;
  showLegs: boolean;
}

const CHAINRING_RADIUS = 100; // ~50T
const CHAINRING_Z = -58;      // drive side = rider's right = −Z
const CRANK_ROOT_Z = 52;      // crank arm root just outboard of the BB shell
const CRANK_RADIUS = 13;
const PEDAL_BODY: [number, number, number] = [92, 14, 58];

export function AnimatedLegs({
  lut, hipL, hipR, bb, halfStance, weightKg,
  crankAngleRef, playing, cadenceRpm, showLegs,
}: AnimatedLegsProps) {
  const thighLRef = useRef<THREE.Group>(null);
  const thighRRef = useRef<THREE.Group>(null);
  const shinLRef = useRef<THREE.Group>(null);
  const shinRRef = useRef<THREE.Group>(null);
  const footLRef = useRef<THREE.Group>(null);
  const footRRef = useRef<THREE.Group>(null);
  const kneeLRef = useRef<THREE.Group>(null);
  const kneeRRef = useRef<THREE.Group>(null);
  const ankleLRef = useRef<THREE.Group>(null);
  const ankleRRef = useRef<THREE.Group>(null);
  const crankLRef = useRef<THREE.Group>(null);
  const crankRRef = useRef<THREE.Group>(null);
  const pedalLRef = useRef<THREE.Group>(null);
  const pedalRRef = useRef<THREE.Group>(null);

  // Segment lengths are constant through the stroke (2-link IK preserves limb
  // lengths; lateral offsets are fixed) — geometry is built once per fit change.
  const dims = useMemo(() => {
    const p0 = lut.poses[0];
    const r = (group: string) => {
      const spec = MANNEQUIN_EDGE_SPEC[group];
      return scaleRadius(spec.baseRadius, weightKg, spec.sensitivity);
    };
    const jr = (name: string) => {
      const spec = MANNEQUIN_JOINT_SPEC[name];
      return scaleRadius(spec.baseRadius, weightKg, spec.sensitivity);
    };
    // Foot spec is tapered — static path renders it as a capsule of avg radius
    const footSpec = MANNEQUIN_EDGE_SPEC.mannequin_foot;
    const footR = (
      scaleRadius(footSpec.baseRadius, weightKg, footSpec.sensitivity) +
      scaleRadius(footSpec.baseRadiusEnd ?? footSpec.baseRadius, weightKg, footSpec.sensitivity)
    ) / 2;

    const thighLen = dist3(hipL[0], hipL[1], hipL[2], p0.knee.x, p0.knee.y, halfStance);
    const shinLen = dist3(p0.knee.x, p0.knee.y, 0, p0.ankle.x, p0.ankle.y, 0);
    const footLen = dist3(p0.cleat.x, p0.cleat.y, 0, p0.ankle.x, p0.ankle.y, 0);
    const crankLen = dist3(bb[0], bb[1], CRANK_ROOT_Z, p0.spindle.x, p0.spindle.y, halfStance);

    const body = (len: number, radius: number) =>
      Math.max(0, len * (1 - 2 * GAP_FRACTION) - radius * 2);

    return {
      thighR: r("mannequin_thigh"),
      thighBody: body(thighLen, r("mannequin_thigh")),
      shinR: r("mannequin_shin"),
      shinBody: body(shinLen, r("mannequin_shin")),
      footR,
      footBody: body(footLen, footR),
      kneeJr: jr("knee_l"),
      ankleJr: jr("ankle_l"),
      crankBody: Math.max(0, crankLen - CRANK_RADIUS * 2),
    };
  }, [lut, hipL, bb, halfStance, weightKg]);

  useFrame((_, dt) => {
    if (playing) {
      // cadence rpm → deg/s = rpm · 360 / 60 = rpm · 6
      crankAngleRef.current = (crankAngleRef.current + cadenceRpm * 6 * dt) % 360;
    }
    const theta = crankAngleRef.current;
    // Crank angle refers to the right (drive-side, −Z) crank; left is +180°.
    const right = legPoseAt(lut, theta);
    const left = legPoseAt(lut, theta + 180);
    const zL = +halfStance;
    const zR = -halfStance;

    setSegment(thighLRef.current, hipL[0], hipL[1], hipL[2], left.knee.x, left.knee.y, zL);
    setSegment(thighRRef.current, hipR[0], hipR[1], hipR[2], right.knee.x, right.knee.y, zR);
    setSegment(shinLRef.current, left.knee.x, left.knee.y, zL, left.ankle.x, left.ankle.y, zL);
    setSegment(shinRRef.current, right.knee.x, right.knee.y, zR, right.ankle.x, right.ankle.y, zR);
    setSegment(footLRef.current, left.cleat.x, left.cleat.y, zL, left.ankle.x, left.ankle.y, zL);
    setSegment(footRRef.current, right.cleat.x, right.cleat.y, zR, right.ankle.x, right.ankle.y, zR);

    kneeLRef.current?.position.set(left.knee.x, left.knee.y, zL);
    kneeRRef.current?.position.set(right.knee.x, right.knee.y, zR);
    ankleLRef.current?.position.set(left.ankle.x, left.ankle.y, zL);
    ankleRRef.current?.position.set(right.ankle.x, right.ankle.y, zR);

    setSegment(crankLRef.current, bb[0], bb[1], +CRANK_ROOT_Z, left.spindle.x, left.spindle.y, zL);
    setSegment(crankRRef.current, bb[0], bb[1], -CRANK_ROOT_Z, right.spindle.x, right.spindle.y, zR);
    // Pedal bodies stay level; positioned just outboard of the spindle tip
    pedalLRef.current?.position.set(left.spindle.x, left.spindle.y, zL + 20);
    pedalRRef.current?.position.set(right.spindle.x, right.spindle.y, zR - 20);
  });

  return (
    <group>
      {showLegs && (
        <group name="mannequin-legs">
          <LimbCapsule ref={thighLRef} radius={dims.thighR} bodyLength={dims.thighBody} />
          <LimbCapsule ref={thighRRef} radius={dims.thighR} bodyLength={dims.thighBody} />
          <LimbCapsule ref={shinLRef} radius={dims.shinR} bodyLength={dims.shinBody} />
          <LimbCapsule ref={shinRRef} radius={dims.shinR} bodyLength={dims.shinBody} />
          <LimbCapsule ref={footLRef} radius={dims.footR} bodyLength={dims.footBody} />
          <LimbCapsule ref={footRRef} radius={dims.footR} bodyLength={dims.footBody} />
          <JointSphere ref={kneeLRef} radius={dims.kneeJr} />
          <JointSphere ref={kneeRRef} radius={dims.kneeJr} />
          <JointSphere ref={ankleLRef} radius={dims.ankleJr} />
          <JointSphere ref={ankleRRef} radius={dims.ankleJr} />
        </group>
      )}

      {/* Crankset — always visible with the bike */}
      {/* BB axle across the shell */}
      <mesh position={bb} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[12, 12, CRANK_ROOT_Z * 2 + 16, 16, 1]} />
        {CRANK_MATERIAL}
      </mesh>
      {/* Chainring: ring + five spokes, drive side */}
      <group position={[bb[0], bb[1], CHAINRING_Z]}>
        <mesh>
          <torusGeometry args={[CHAINRING_RADIUS, 4, 8, 64]} />
          {CHAINRING_MATERIAL}
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} rotation={[0, 0, (i / 5) * Math.PI * 2]}>
            <mesh position={[0, (CHAINRING_RADIUS - 8) / 2, 0]}>
              <boxGeometry args={[14, CHAINRING_RADIUS - 8, 5]} />
              {CHAINRING_MATERIAL}
            </mesh>
          </group>
        ))}
      </group>
      {/* Crank arms + pedals (animated) */}
      <group ref={crankLRef}>
        <mesh>
          <capsuleGeometry args={[CRANK_RADIUS, dims.crankBody, 8, 16]} />
          {CRANK_MATERIAL}
        </mesh>
      </group>
      <group ref={crankRRef}>
        <mesh>
          <capsuleGeometry args={[CRANK_RADIUS, dims.crankBody, 8, 16]} />
          {CRANK_MATERIAL}
        </mesh>
      </group>
      <group ref={pedalLRef}>
        <mesh>
          <boxGeometry args={PEDAL_BODY} />
          {PEDAL_MATERIAL}
        </mesh>
      </group>
      <group ref={pedalRRef}>
        <mesh>
          <boxGeometry args={PEDAL_BODY} />
          {PEDAL_MATERIAL}
        </mesh>
      </group>
    </group>
  );
}
