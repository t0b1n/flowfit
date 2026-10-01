/**
 * AeroTools.tsx — aero position tools for the 3D view.
 *
 * FrontalAreaProbe: on-demand orthographic silhouette render of the mannequin
 * (optionally + bike) from the front, pixel-counted into a frontal area in m².
 * Never runs per-frame — readRenderTargetPixels forces a GPU sync.
 *
 * GhostMannequin: translucent copy of a snapshotted position rendered
 * alongside the live mannequin for before/after comparison.
 */

import React, { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import { TOKENS, material3d, type Theme } from "./design/tokens";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Geometry3DPoint,
  Geometry3DEdge,
  MANNEQUIN_EDGE_SPEC,
  scaleRadius,
} from "./bike3d";

// Scene-graph group names the probe uses to decide what a "rider" is.
export const MANNEQUIN_GROUP_NAMES = new Set(["mannequin-root", "mannequin-legs"]);
// Never measured: analytics overlays, contact shadows, and the ghost itself.
export const NON_AERO_GROUP_NAMES = new Set(["analytics-root", "ghost-root", "stage-root"]);

const PROBE_RESOLUTION = 512;
/** Assumed drag coefficient for the CdA estimate (hoods position). */
export const ASSUMED_CD = 0.65;

export type MeasureFrontalArea = (includeBike: boolean) => Promise<number /* m² */>;

/**
 * Registers a measure function with the host component. The measurement:
 * 1. hides everything except the target meshes (skipping BackSide outline
 *    hulls, which would inflate the silhouette ~3%),
 * 2. renders the scene with a white override material on black from an
 *    orthographic camera looking along −X (the front/aero view),
 * 3. counts lit pixels and scales by the camera frustum area.
 */
export function FrontalAreaProbe({
  onReady,
}: {
  onReady: (fn: MeasureFrontalArea) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const measure: MeasureFrontalArea = async (includeBike: boolean) => {
      // Collect target meshes, carrying group context down the graph
      const targets: THREE.Mesh[] = [];
      const collect = (obj: THREE.Object3D, inMannequin: boolean, excluded: boolean) => {
        const nowMannequin = inMannequin || MANNEQUIN_GROUP_NAMES.has(obj.name);
        const nowExcluded = excluded || NON_AERO_GROUP_NAMES.has(obj.name);
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.Material | THREE.Material[];
          const isOutline = !Array.isArray(mat) && mat.side === THREE.BackSide;
          if (!nowExcluded && !isOutline && (nowMannequin || includeBike)) {
            targets.push(mesh);
          }
        }
        for (const child of obj.children) collect(child, nowMannequin, nowExcluded);
      };
      collect(scene, false, false);
      if (targets.length === 0) return 0;

      // Frustum from the target bounds (viewed along −X: width = Z, height = Y)
      const box = new THREE.Box3();
      for (const mesh of targets) box.expandByObject(mesh);
      const margin = 60; // mm
      const halfW = (box.max.z - box.min.z) / 2 + margin;
      const halfH = (box.max.y - box.min.y) / 2 + margin;
      const centre = box.getCenter(new THREE.Vector3());
      const camera = new THREE.OrthographicCamera(
        -halfW, halfW, halfH, -halfH,
        1, box.max.x - box.min.x + 2000
      );
      camera.position.set(box.max.x + 1000, centre.y, centre.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(centre.x, centre.y, centre.z);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // Hide everything that is not a target
      const hidden: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.visible && !targets.includes(obj as THREE.Mesh)) {
          obj.visible = false;
          hidden.push(obj);
        }
      });

      const prevBackground = scene.background;
      const prevFog = scene.fog;
      const prevOverride = scene.overrideMaterial;
      const prevTarget = gl.getRenderTarget();
      const rt = new THREE.WebGLRenderTarget(PROBE_RESOLUTION, PROBE_RESOLUTION);

      let litFraction = 0;
      try {
        scene.background = new THREE.Color(0x000000);
        scene.fog = null; // fog would darken the white silhouette and break the threshold
        scene.overrideMaterial = whiteMat;
        gl.setRenderTarget(rt);
        gl.clear();
        gl.render(scene, camera);

        const buf = new Uint8Array(PROBE_RESOLUTION * PROBE_RESOLUTION * 4);
        const reader = (gl as unknown as {
          readRenderTargetPixelsAsync?: (
            rt: THREE.WebGLRenderTarget, x: number, y: number,
            w: number, h: number, buffer: Uint8Array,
          ) => Promise<unknown>;
        }).readRenderTargetPixelsAsync;
        if (reader) {
          await reader.call(gl, rt, 0, 0, PROBE_RESOLUTION, PROBE_RESOLUTION, buf);
        } else {
          gl.readRenderTargetPixels(rt, 0, 0, PROBE_RESOLUTION, PROBE_RESOLUTION, buf);
        }
        let lit = 0;
        for (let i = 0; i < buf.length; i += 4) {
          if (buf[i] > 128) lit++;
        }
        litFraction = lit / (PROBE_RESOLUTION * PROBE_RESOLUTION);
      } finally {
        gl.setRenderTarget(prevTarget);
        scene.background = prevBackground;
        scene.fog = prevFog;
        scene.overrideMaterial = prevOverride;
        for (const obj of hidden) obj.visible = true;
        rt.dispose();
      }

      const frustumAreaMm2 = (halfW * 2) * (halfH * 2);
      return (litFraction * frustumAreaMm2) / 1e6; // mm² → m²
    };

    onReady(measure);
    return () => whiteMat.dispose();
  }, [gl, scene, onReady]);

  return null;
}

// ── Ghost mannequin ───────────────────────────────────────────────────────────

export interface GhostSnapshot {
  points: Geometry3DPoint[];
  edges: Geometry3DEdge[];
  trunkAngleDeg: number;
  dropMm: number;
  frontalAreaM2: number | null;
}

/** Parts whose endpoints all moved less than this are not drawn (otherwise the whole body tints). */
const GHOST_SAME_MM = 2;
/** If every displacement is below this, only hairlines are drawn: a 4 mm ghost is unreadable as volume. */
const GHOST_HAIRLINE_ONLY_MM = 6;

type P3 = [number, number, number];

function GhostPartMesh({ start, end, radius, sphere, material }: { start: P3; end: P3; radius: number; sphere?: boolean; material: THREE.Material }) {
  if (sphere) {
    return (
      <mesh position={start} material={material}>
        <sphereGeometry args={[radius, 20, 20]} />
      </mesh>
    );
  }
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(e, s);
  const length = dir.length();
  if (length < 1) return null;
  const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const bodyLength = Math.max(0, length - radius * 2);
  return (
    <mesh position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]} material={material}>
      <capsuleGeometry args={[radius, bodyLength, 8, 20]} />
    </mesh>
  );
}

const dist3 = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Comparison ghost: the previous fit in accent at 20% (light) / 22% (dark), drawn only where it differs from
 * the live rider, plus 1 px accent hairlines for its drive-side leg and torso. Lives under `ghost-root`
 * so the frontal-area probe ignores it.
 */
export function GhostMannequin({
  snapshot,
  weightKg,
  current,
  theme,
}: {
  snapshot: GhostSnapshot;
  weightKg: number;
  /** The live rider's points by name, to find where the ghost differs. */
  current: Map<string, P3>;
  theme: Theme;
}) {
  const tokens = TOKENS[theme];
  const opacity = material3d[theme].ghostOpacity;
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: tokens.accent, transparent: true, opacity, depthWrite: false }),
    [tokens.accent, opacity],
  );
  useEffect(() => () => material.dispose(), [material]);

  const P = useMemo(() => new Map(snapshot.points.map((p) => [p.name, p.pos as P3])), [snapshot]);
  const moved = (name: string) => {
    const g = P.get(name);
    const c = current.get(name);
    return g && c ? dist3(g, c) : 0;
  };
  const maxMove = useMemo(
    () => Math.max(0, ...snapshot.points.map((p) => (current.get(p.name) ? dist3(p.pos as P3, current.get(p.name)!) : 0))),
    [snapshot, current],
  );
  const hairlineOnly = maxMove < GHOST_HAIRLINE_ONLY_MM;

  const parts = useMemo(() => {
    if (hairlineOnly) return [];
    const out: Array<{ start: P3; end: P3; radius: number }> = [];
    for (const e of snapshot.edges) {
      const a = P.get(e.a);
      const b = P.get(e.b);
      if (!a || !b) continue;
      if (moved(e.a) < GHOST_SAME_MM && moved(e.b) < GHOST_SAME_MM) continue;
      const spec = MANNEQUIN_EDGE_SPEC[e.group];
      if (!spec) continue;
      out.push({ start: a, end: b, radius: scaleRadius(spec.baseRadius, weightKg, spec.sensitivity) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, current, weightKg, hairlineOnly]);

  const chain = (names: string[]) => names.map((n) => P.get(n)).filter((p): p is P3 => !!p);
  const leg = chain(["hip_r", "knee_r", "ankle_r", "cleat_r"]);
  const torso = chain(["hip_center", "spine_joint", "shoulder_center", "neck_base_center", "head_center"]);

  return (
    <group name="ghost-root">
      {parts.map((p, i) => (
        <GhostPartMesh key={i} start={p.start} end={p.end} radius={p.radius} material={material} />
      ))}
      {leg.length > 1 && <Line points={leg} color={tokens.accent} lineWidth={1} depthTest={false} renderOrder={9} />}
      {torso.length > 1 && <Line points={torso} color={tokens.accent} lineWidth={1} depthTest={false} renderOrder={9} />}
    </group>
  );
}
