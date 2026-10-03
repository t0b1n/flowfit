/**
 * OrthoScene.tsx — the bike and rider drawn through an orthographic camera in flat colours (docs/plans/ortho-views.md).
 *
 * It renders only the model: the same mesh builders as the 3D view, no stage, lights (except `flatLit`), analytics,
 * callouts or controls. The camera frustum is derived from the SVG overlay's viewBox, so the canvas sits exactly under
 * the 2D annotations. Coordinates: X forward, Y up, +Z the rider's right (drive side, nearest the side camera).
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import type { Geometry3DResponse } from "../bike3d";
import type { PedalStrokeLUT } from "../geometry";
import type { Theme } from "../design/tokens";
import { DebugProvider } from "../debug";
import { AnimatedLegs } from "../AnimatedLegs";
import { BikeStatic, Drivetrain3D, RiderStatic, SaddleMesh, frameTubesFor, type SaddleType } from "../BikeScene3D";
import { MatsProvider, type Look } from "./materials";
import { useContextRestore } from "./contextLoss";
import { viewBoxToFrustum } from "./ortho";

export interface OrthoSceneProps {
  geo: Geometry3DResponse;
  strokeLUT?: PedalStrokeLUT;
  weightKg: number;
  stanceWidth: number;
  view: "side" | "front";
  /** SVG viewBox string of the overlay this canvas sits under: the camera frustum is derived from it */
  viewBox: string;
  look: Look;
  theme: Theme;
  debug?: boolean;
  /** rear disc wheel (the 3D view's DISC toggle) */
  discRear?: boolean;
  /** saddle model (the 3D view's default is the traced "power") */
  saddleType?: SaddleType;
  /** the 2D Layers toggles: hide body parts (default: all shown) */
  visibility?: Partial<Record<"legs" | "torso" | "arms" | "head" | "feet", boolean>>;
}

const PART_KEY = { leg: "legs", torso: "torso", arm: "arms", head: "head", shoe: "feet" } as const;

const FAR_BLEND = 0.45;
/** a part is on the far side when its centre is at least this far (mm) behind the centreline */
const FAR_MIN_Z = 8;

/** Frustum from the viewBox and the canvas size; side looks down −Z, front down −X (camera x = world −Z). */
function OrthoCamera({ view, viewBox }: { view: "side" | "front"; viewBox: string }) {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const f = useMemo(() => viewBoxToFrustum(viewBox, size.width, size.height), [viewBox, size.width, size.height]);
  useLayoutEffect(() => invalidate(), [f, view, invalidate]);
  return (
    <OrthographicCamera
      makeDefault
      manual
      left={f.left}
      right={f.right}
      top={f.top}
      bottom={f.bottom}
      near={-1e5}
      far={1e5}
      position={view === "side" ? [0, 0, 5000] : [5000, 0, 0]}
      rotation={view === "side" ? [0, 0, 0] : [0, Math.PI / 2, 0]}
    />
  );
}

/**
 * Side view: parts wholly on the rider's far (−Z) side get an opaque variant blended toward the page background.
 * Runs in a frame (after AnimatedLegs has placed the legs) whenever the content changed; no transparency, so no
 * sorting artefacts.
 */
function FarSide({ enabled, styleKey, dirtyKey, visibility }: { enabled: boolean; styleKey: unknown; dirtyKey: unknown; visibility: OrthoSceneProps["visibility"] }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const dirty = useRef(true);
  const far = useRef(new Map<THREE.Material, THREE.Material>());
  const farSet = useRef(new WeakSet<THREE.Material>());
  // the near material of each mesh (not userData: R3F re-assigns that prop on re-render)
  const nearOf = useRef(new WeakMap<THREE.Object3D, THREE.Material>());
  const bg = useRef(new THREE.Color());

  // The blend target and the variants built from it change only with the theme / look: not on every slider tick.
  useLayoutEffect(() => {
    const el = gl.domElement.parentElement;
    // the page colour behind the figure: the stage surface, else the page background
    const cs = el ? getComputedStyle(el) : null;
    const css = (cs?.getPropertyValue("--surface").trim() || cs?.getPropertyValue("--bg").trim()) ?? "";
    bg.current.set(css || "#e6e1d8");
    far.current.forEach((m) => m.dispose());
    far.current.clear();
    dirty.current = true;
    invalidate();
  }, [styleKey, gl, invalidate]);
  useLayoutEffect(() => {
    dirty.current = true;
    invalidate();
  }, [dirtyKey, enabled, invalidate]);
  useEffect(() => () => far.current.forEach((m) => m.dispose()), []);

  const box = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    if (!dirty.current) return;
    dirty.current = false;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const part = m.userData.part as keyof typeof PART_KEY | undefined;
      if (part) m.visible = visibility?.[PART_KEY[part]] !== false;
      const cur = m.material as THREE.Material;
      const near: THREE.Material = farSet.current.has(cur) ? (nearOf.current.get(m) ?? cur) : cur;
      nearOf.current.set(m, near);
      if (!enabled) {
        m.material = near;
        return;
      }
      box.setFromObject(m);
      // far side = centred behind the centreline (a limb's radius reaches a few mm past z = 0, so max.z is too strict)
      if (box.isEmpty() || (box.min.z + box.max.z) / 2 >= -FAR_MIN_Z) {
        m.material = near;
        return;
      }
      let v = far.current.get(near);
      if (!v) {
        v = near.clone();
        const c = (v as THREE.MeshBasicMaterial).color;
        if (c) c.lerp(bg.current, FAR_BLEND);
        v.transparent = false;
        v.opacity = 1;
        far.current.set(near, v);
        farSet.current.add(v);
      }
      m.material = v;
    });
  });
  return null;
}

/** DEV: handles for the alignment check (`window.__ortho`). */
function DevHandles() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __ortho?: unknown }).__ortho = { scene, camera, gl };
  }, [scene, camera, gl]);
  return null;
}

function OrthoContent({ geo, strokeLUT, weightKg, stanceWidth, view, viewBox, look, theme, debug = false, discRear = false, visibility, saddleType = "power" }: OrthoSceneProps) {
  const restoreKey = useContextRestore();
  const invalidate = useThree((s) => s.invalidate);
  const crankAngleRef = useRef(0);
  const { frameTubes } = useMemo(() => frameTubesFor(geo), [geo]);
  const wheelRadius = geo.frame.wheel_radius ?? 311;
  const pt = (n: string) => geo.points.find((p) => p.name === n)?.pos;
  const hipR = pt("hip_r");
  const hipL = pt("hip_l");
  const bb = pt("bb") ?? ([0, 0, 0] as [number, number, number]);
  useEffect(() => {
    invalidate();
  }, [invalidate, geo, strokeLUT, weightKg, stanceWidth, look, theme, debug, discRear]);

  const styleKey = useMemo(() => ({}), [look, theme, debug, restoreKey]);
  const visKey = visibility ? Object.values(visibility).join() : "";
  const dirtyKey = useMemo(() => ({}), [geo, strokeLUT, weightKg, discRear, styleKey, visKey]);
  const lit = look === "flatLit";
  return (
    <DebugProvider key={restoreKey} value={debug}>
      <MatsProvider theme={theme} look={look}>
        <OrthoCamera view={view} viewBox={viewBox} />
        {lit ? (
          <>
            <hemisphereLight args={["#ffffff", "#8a8478", 1.6]} />
            <directionalLight position={view === "front" ? [1, 1, 0.3] : [0.4, 1, 1]} intensity={1.4} />
          </>
        ) : (
          // debug part colours are lit materials: a flat ambient keeps them at their authored colour
          debug && <ambientLight intensity={Math.PI} />
        )}
        <BikeStatic geo={geo} tubes={frameTubes} wheelRadius={wheelRadius} discRear={discRear} />
        <SaddleMesh geo={geo} saddleType={saddleType} />
        <RiderStatic geo={geo} weightKg={weightKg} includeLegs={!strokeLUT} />
        {strokeLUT && hipR && hipL ? (
          <AnimatedLegs
            lut={strokeLUT}
            hipR={hipR}
            hipL={hipL}
            bb={bb}
            halfStance={stanceWidth / 2}
            weightKg={weightKg}
            heightMm={geo.rider?.height ?? 1800}
            crankAngleRef={crankAngleRef}
            playing={false}
            cadenceRpm={0}
            showLegs
          />
        ) : (
          <Drivetrain3D points={geo.points} />
        )}
        <DevHandles />
        <FarSide enabled={view === "side"} styleKey={styleKey} dirtyKey={dirtyKey} visibility={visibility} />
      </MatsProvider>
    </DebugProvider>
  );
}

export function OrthoScene(props: OrthoSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
      style={{ position: "absolute", inset: 0 }}
    >
      <OrthoContent {...props} />
    </Canvas>
  );
}
