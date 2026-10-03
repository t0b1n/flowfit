/**
 * AnimatedLegs.tsx — pedaling animation for the 3D mannequin.
 *
 * Owns everything that moves through the pedal stroke: thighs, calves, shoes, knee/ankle masses, crank
 * arms and pedals — plus the static crank axle and double chainrings. The declarative rider in
 * BikeScene3D excludes the leg points/edges when this component is mounted (LEG_POINT_NAMES /
 * LEG_EDGE_GROUPS in bike3d.ts).
 *
 * Limbs are the same calibrated lathe limbs as the static rider (riderMesh.limbMesh / design/riderBody),
 * so a paused animation is indistinguishable from the static render. Performance contract: geometries
 * are built once per fit (limb lengths are constant through the stroke); useFrame mutates only
 * positions / quaternions. The crank angle lives in a shared ref.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CHAINRING } from "./design/bikeProfiles";
import { useDbg } from "./debug";
import { PEDAL_BODY, shoeAxis, shoeRadius } from "./design/foot";
import { PROFILES, MASSES, bump, calAt, lerp } from "./design/riderBody";
import { legPoseAt, PedalStrokeLUT } from "./geometry";
import { limbGeometry, muscleLimbGeometry, resolveBulges, segScale, type P3 } from "./riderMesh";
import { withNormals } from "./scene3d/geometryCache";
import { useNeedsNormals } from "./scene3d/materials";
import { useMats } from "./scene3d/materials";

// Scratch objects reused every frame — zero per-frame allocations.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** Place a group at A with local +Y running A→B; Y-scaled to the actual length when baseLen is given. */
function setSegment(
  g: THREE.Group | null,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  baseLen?: number,
): void {
  if (!g) return;
  _a.set(ax, ay, az);
  _b.set(bx, by, bz);
  _dir.subVectors(_b, _a);
  const len = _dir.length();
  if (len < 1e-3) return;
  _dir.divideScalar(len);
  g.position.copy(_a);
  g.quaternion.setFromUnitVectors(_Y, _dir);
  if (baseLen && baseLen > 1) g.scale.setY(len / baseLen);
}

const dist3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
  Math.hypot(bx - ax, by - ay, bz - az);

interface AnimatedLegsProps {
  lut: PedalStrokeLUT;
  /** Hip joint world positions from the (overridden) mannequin point set. */
  hipR: [number, number, number];
  hipL: [number, number, number];
  bb: [number, number, number];
  halfStance: number;
  weightKg: number;
  /** rider height in mm (radii scale by height / 1800) */
  heightMm?: number;
  crankAngleRef: React.MutableRefObject<number>;
  playing: boolean;
  cadenceRpm: number;
  showLegs: boolean;
}

const CHAINRING_Z = 46;       // drive side = rider's right = +Z (x forward, y up ⇒ +Z is the right-hand side); crank arms sit outboard at 52
const CRANK_ROOT_Z = 52;      // crank arm root just outboard of the BB shell

/** Gear-toothed ring outline as a thin extrusion. */
function ringGeometry(teeth: number, outer: number, root: number, hole: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? root : outer;
    if (i === 0) shape.moveTo(r, 0);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
}

export function AnimatedLegs({
  lut, hipR, hipL, bb, halfStance, weightKg, heightMm = 1800,
  crankAngleRef, playing, cadenceRpm, showLegs,
}: AnimatedLegsProps) {
  const M = useMats();
  const dbg = useDbg();
  const thighRRef = useRef<THREE.Group>(null);
  const thighLRef = useRef<THREE.Group>(null);
  const calfRRef = useRef<THREE.Group>(null);
  const calfLRef = useRef<THREE.Group>(null);
  const footRRef = useRef<THREE.Group>(null);
  const footLRef = useRef<THREE.Group>(null);
  const kneeRRef = useRef<THREE.Group>(null);
  const kneeLRef = useRef<THREE.Group>(null);
  const ankleRRef = useRef<THREE.Group>(null);
  const ankleLRef = useRef<THREE.Group>(null);
  const crankRRef = useRef<THREE.Group>(null);
  const crankLRef = useRef<THREE.Group>(null);
  const pedalRRef = useRef<THREE.Group>(null);
  const pedalLRef = useRef<THREE.Group>(null);
  const spindleRRef = useRef<THREE.Group>(null);
  const spindleLRef = useRef<THREE.Group>(null);

  // Lengths are constant through the stroke: geometry is built once per fit change. `lut`, `hipR`, `hipL` and `bb` are new
  // objects on every slider tick even when their numbers are unchanged, so the memo is keyed on the numbers it reads.
  const p0 = lut.poses[0];
  const dimsKey = [
    p0.knee.x, p0.knee.y, p0.ankle.x, p0.ankle.y, p0.cleat.x, p0.cleat.y, p0.spindle.x, p0.spindle.y, lut.ankleSetbackMm,
    ...hipR, ...hipL, bb[0], bb[1], halfStance, weightKg, heightMm,
  ].map((n) => n.toFixed(2)).join("|");
  const needsNormals = useNeedsNormals();
  const dims = useMemo(() => withNormals(needsNormals, () => {
    const hs = heightMm / 1800;
    const drawnAnkleX = p0.ankle.x - lut.ankleSetbackMm;
    const thighLen = dist3(hipR[0], hipR[1], hipR[2], p0.knee.x, p0.knee.y, halfStance);
    const calfLen = dist3(p0.knee.x, p0.knee.y, 0, drawnAnkleX, p0.ankle.y, 0);
    const footLen = shoeAxis(p0.cleat, lut.ankleSetbackMm, hs).len;
    const crankLen = dist3(bb[0], bb[1], 0, p0.spindle.x, p0.spindle.y, 0);

    // Anterior = forward (+x) in the sagittal plane; resolved against each segment's rest orientation.
    // Rotation about Z keeps the local frame consistent, so one rest pose serves the whole stroke.
    const fwd = new THREE.Vector3(1, 0, 0);
    const mk = (seg: "thigh" | "calf", len: number, a: P3, b: P3, side: 1 | -1) => {
      const k = segScale(seg, weightKg, heightMm);
      const prof = PROFILES[seg];
      const bulges = resolveBulges(prof.bulges, a, b, fwd, side).map((u) => ({ ...u, amp: u.amp * k }));
      return muscleLimbGeometry(len, (t) => prof.radius(t) * k, bulges, (t) => calAt(seg, t), prof.scale);
    };
    const thighA: P3 = [hipR[0], hipR[1], halfStance];
    const kneeP: P3 = [p0.knee.x, p0.knee.y, halfStance];
    const ankP: P3 = [drawnAnkleX, p0.ankle.y, halfStance];
    // Shoe: heel→toe lathe, flattened laterally (mockup bike3.js)
    const shoe = limbGeometry(footLen, (t) => shoeRadius(t, hs), 20, 28);
    shoe.scale(1, 1, 0.82);
    return {
      thigh: { R: mk("thigh", thighLen, thighA, kneeP, 1), L: mk("thigh", thighLen, [hipL[0], hipL[1], -halfStance], [p0.knee.x, p0.knee.y, -halfStance], -1), len: thighLen },
      calf: { R: mk("calf", calfLen, kneeP, ankP, 1), L: mk("calf", calfLen, [p0.knee.x, p0.knee.y, -halfStance], [drawnAnkleX, p0.ankle.y, -halfStance], -1), len: calfLen },
      shoe,
      footLen,
      crankLen,
      kneeR: MASSES.knee.radius * hs,
      ankleR: MASSES.ankle.radius * hs,
    };
  }), [dimsKey, needsNormals]);
  useEffect(() => () => {
    dims.thigh.L.dispose(); dims.thigh.R.dispose(); dims.calf.L.dispose(); dims.calf.R.dispose(); dims.shoe.dispose();
  }, [dims]);

  // One crank-arm geometry for both cranks, per crank length (it used to be rebuilt, and leaked, on every render).
  const crankGeom = useMemo(
    () => withNormals(needsNormals, () => limbGeometry(dims.crankLen, (t) => lerp(CHAINRING.crankRadius[0], CHAINRING.crankRadius[1], t), 8, 16)),
    [dims.crankLen, needsNormals],
  );
  useEffect(() => () => crankGeom.dispose(), [crankGeom]);

  const rings = useMemo(() => {
    const { big, small } = CHAINRING;
    return { big: ringGeometry(big.teeth, big.outer, big.root, big.hole, big.depth), small: ringGeometry(small.teeth, small.outer, small.root, small.hole, small.depth) };
  }, []);
  useEffect(() => () => { rings.big.dispose(); rings.small.dispose(); }, [rings]);

  useFrame((state, dt) => {
    if (playing) {
      // cadence rpm → deg/s = rpm · 360 / 60 = rpm · 6
      crankAngleRef.current = (crankAngleRef.current + cadenceRpm * 6 * dt) % 360;
    }
    const theta = crankAngleRef.current;
    // Crank angle refers to the left crank (−Z); the right (drive-side, +Z) crank is +180°.
    const left = legPoseAt(lut, theta);
    const right = legPoseAt(lut, theta + 180);
    const zR = +halfStance;
    const zL = -halfStance;
    const setback = lut.ankleSetbackMm;
    const rAnkleX = right.ankle.x - setback;
    const lAnkleX = left.ankle.x - setback;

    setSegment(thighRRef.current, hipR[0], hipR[1], hipR[2], right.knee.x, right.knee.y, zR);
    setSegment(thighLRef.current, hipL[0], hipL[1], hipL[2], left.knee.x, left.knee.y, zL);
    setSegment(calfRRef.current, right.knee.x, right.knee.y, zR, rAnkleX, right.ankle.y, zR, dims.calf.len);
    setSegment(calfLRef.current, left.knee.x, left.knee.y, zL, lAnkleX, left.ankle.y, zL, dims.calf.len);
    // Shoes: flat, ball of the foot over the cleat point with the sole on the pedal body (design/foot.ts)
    const hsF = heightMm / 1800;
    const shR = shoeAxis(right.cleat, setback, hsF);
    const shL = shoeAxis(left.cleat, setback, hsF);
    setSegment(footRRef.current, shR.heel.x, shR.heel.y, zR, shR.toe.x, shR.toe.y, zR, dims.footLen);
    setSegment(footLRef.current, shL.heel.x, shL.heel.y, zL, shL.toe.x, shL.toe.y, zL, dims.footLen);

    kneeRRef.current?.position.set(right.knee.x, right.knee.y, zR);
    kneeLRef.current?.position.set(left.knee.x, left.knee.y, zL);
    ankleRRef.current?.position.set(rAnkleX, right.ankle.y, zR);
    ankleLRef.current?.position.set(lAnkleX, left.ankle.y, zL);

    // Crank arms stay in a plane parallel to the frame (offset from the BB); the pedal spindle runs outboard to the pedal under the shoe
    setSegment(crankRRef.current, bb[0], bb[1], +CRANK_ROOT_Z, right.spindle.x, right.spindle.y, +CRANK_ROOT_Z);
    setSegment(crankLRef.current, bb[0], bb[1], -CRANK_ROOT_Z, left.spindle.x, left.spindle.y, -CRANK_ROOT_Z);
    pedalRRef.current?.position.set(right.spindle.x, right.spindle.y, zR);
    pedalLRef.current?.position.set(left.spindle.x, left.spindle.y, zL);
    spindleRRef.current?.position.set(right.spindle.x, right.spindle.y, (CRANK_ROOT_Z + zR) / 2);
    spindleLRef.current?.position.set(left.spindle.x, left.spindle.y, (-CRANK_ROOT_Z + zL) / 2);
    if (playing) state.invalidate(); // frameloop="demand": keep the animation running
  });

  const crank = (ref: React.RefObject<THREE.Group>) => (
    <group ref={ref}>
      <mesh>
        <primitive object={crankGeom} attach="geometry" />
        {dbg("crank", M.carbon)}
      </mesh>
    </group>
  );
  const limb = (ref: React.RefObject<THREE.Group>, geometry: THREE.BufferGeometry, mat: React.ReactElement) => (
    <group ref={ref}>
      <mesh geometry={geometry}>{mat}</mesh>
    </group>
  );
  const mass = (ref: React.RefObject<THREE.Group>, r: number, sz = 1) => (
    <group ref={ref}>
      <mesh scale={[1, 1, sz]}>
        <sphereGeometry args={[r, 32, 24]} />
        {M.clay}
      </mesh>
    </group>
  );

  return (
    <group>
      {showLegs && (
        <group name="mannequin-legs">
          {limb(thighRRef, dims.thigh.R, dbg("leg", M.clay))}
          {limb(thighLRef, dims.thigh.L, dbg("leg", M.clay))}
          {limb(calfRRef, dims.calf.R, dbg("leg", M.clay))}
          {limb(calfLRef, dims.calf.L, dbg("leg", M.clay))}
          {limb(footRRef, dims.shoe, dbg("shoe", M.tape))}
          {limb(footLRef, dims.shoe, dbg("shoe", M.tape))}
          {mass(kneeRRef, dims.kneeR, MASSES.knee.depthScale)}
          {mass(kneeLRef, dims.kneeR, MASSES.knee.depthScale)}
          {mass(ankleRRef, dims.ankleR)}
          {mass(ankleLRef, dims.ankleR)}
        </group>
      )}

      {/* Crankset — always visible with the bike: BB axle, 52/36 rings, spider, cranks + pedals */}
      <mesh position={bb} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[12, 12, CRANK_ROOT_Z * 2 + 16, 16, 1]} />
        {M.carbon}
      </mesh>
      <group position={[bb[0], bb[1], CHAINRING_Z]}>
        <mesh geometry={rings.big} position={[0, 0, 2]}>{dbg("drivetrain", M.carbon)}</mesh>
        <mesh geometry={rings.small} position={[0, 0, -7]}>{dbg("drivetrain", M.carbon)}</mesh>
        {Array.from({ length: CHAINRING.spiderArms }, (_, i) => (
          <group key={i} rotation={[0, 0, (i / CHAINRING.spiderArms) * Math.PI * 2 + 0.5]}>
            <mesh position={[0, CHAINRING.spiderRadius / 2, 0]}>
              <boxGeometry args={[12, CHAINRING.spiderRadius, 5]} />
              {M.carbon}
            </mesh>
          </group>
        ))}
      </group>
      {crank(crankRRef)}
      {crank(crankLRef)}
      {/* pedal spindles: crank end → pedal body, along z */}
      {[spindleRRef, spindleLRef].map((r, i) => (
        <group key={i} ref={r}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[7, 7, Math.abs(halfStance - CRANK_ROOT_Z) + 2, 12]} />
            {dbg("pedal", M.carbon)}
          </mesh>
        </group>
      ))}
      <group ref={pedalRRef}>
        <mesh>
          <boxGeometry args={PEDAL_BODY} />
          {dbg("pedal", M.tape)}
        </mesh>
      </group>
      <group ref={pedalLRef}>
        <mesh>
          <boxGeometry args={PEDAL_BODY} />
          {dbg("pedal", M.tape)}
        </mesh>
      </group>
    </group>
  );
}
