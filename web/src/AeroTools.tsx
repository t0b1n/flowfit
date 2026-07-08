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
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Geometry3DPoint,
  Geometry3DEdge,
  buildMannequinParts,
} from "./bike3d";

// Scene-graph group names the probe uses to decide what a "rider" is.
export const MANNEQUIN_GROUP_NAMES = new Set(["mannequin-root", "mannequin-legs"]);
// Never measured: analytics overlays, contact shadows, and the ghost itself.
export const NON_AERO_GROUP_NAMES = new Set(["analytics-root", "ghost-root"]);

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
      const prevOverride = scene.overrideMaterial;
      const prevTarget = gl.getRenderTarget();
      const rt = new THREE.WebGLRenderTarget(PROBE_RESOLUTION, PROBE_RESOLUTION);

      let litFraction = 0;
      try {
        scene.background = new THREE.Color(0x000000);
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

const GHOST_MATERIAL = (
  <meshStandardMaterial
    color="#4aa3ff"
    transparent
    opacity={0.25}
    depthWrite={false}
    roughness={0.6}
  />
);

function GhostPartMesh({
  type, start, end, radiusStart, radiusEnd,
}: {
  type: string;
  start: [number, number, number];
  end: [number, number, number];
  radiusStart: number;
  radiusEnd: number;
}) {
  if (type === "sphere") {
    return (
      <mesh position={start}>
        <sphereGeometry args={[radiusStart, 20, 20]} />
        {GHOST_MATERIAL}
      </mesh>
    );
  }
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(e, s);
  const length = dir.length();
  if (length < 1) return null;
  const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize()
  );
  const radius = (radiusStart + radiusEnd) / 2;
  const bodyLength = Math.max(0, length - radius * 2);
  return (
    <mesh position={mid.toArray()} quaternion={quat.toArray() as [number, number, number, number]}>
      <capsuleGeometry args={[radius, bodyLength, 8, 20]} />
      {GHOST_MATERIAL}
    </mesh>
  );
}

export function GhostMannequin({
  snapshot,
  weightKg,
}: {
  snapshot: GhostSnapshot;
  weightKg: number;
}) {
  const parts = useMemo(
    () => buildMannequinParts(snapshot.points, snapshot.edges, weightKg),
    [snapshot, weightKg]
  );
  return (
    <group name="ghost-root">
      {parts.map((p, i) => (
        <GhostPartMesh
          key={i}
          type={p.type}
          start={p.start}
          end={p.end}
          radiusStart={p.radiusStart}
          radiusEnd={p.radiusEnd}
        />
      ))}
    </group>
  );
}
