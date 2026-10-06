/**
 * Callouts3D.tsx — thin adapter between the 3D scene and the shared DS CalloutLayer.
 *
 * <ScreenProjector/> runs inside the Canvas: at ~15 Hz it projects world-space anchors to screen px and
 * reports them. <Callouts3D/> (DOM, outside the Canvas) feeds the px anchors to CalloutLayer.
 */

import React, { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CalloutLayer } from "./design/CalloutLayer";
import type { MetricId, Vec3 } from "./fitMetrics";

export interface ProjectTarget<K extends string = string> {
  key: K;
  pos: Vec3;
}

export type ProjectedMap<K extends string = string> = Partial<Record<K, { x: number; y: number }>>;

const HZ = 15;

/** In-canvas: projects `targets` to canvas px and calls `onProject`. Anchors behind the camera are omitted. */
export function ScreenProjector<K extends string>({
  targets,
  onProject,
}: {
  targets: ProjectTarget<K>[];
  onProject: (px: ProjectedMap<K>) => void;
}) {
  const { camera, size } = useThree();
  const last = useRef(0);
  const v = useRef(new THREE.Vector3());
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (t - last.current < 1 / HZ) return;
    last.current = t;
    const out: ProjectedMap<K> = {};
    for (const tg of targets) {
      v.current.set(tg.pos[0], tg.pos[1], tg.pos[2]).project(camera);
      if (v.current.z > 1) continue;
      out[tg.key] = { x: ((v.current.x + 1) / 2) * size.width, y: ((1 - v.current.y) / 2) * size.height };
    }
    onProject(out);
  });
  return null;
}

/** Preferred leader directions (screen px) for the 3D ¾ view. Back joints go up-right, arms up-left. */
export const PREFER_3D: Partial<Record<MetricId, [number, number]>> = {
  trunk: [90, -70],
  hip: [100, -40],
  knee_ext_bdc: [100, 70],
  knee_flex_tdc: [-110, 50],
  shoulder: [-90, -70],
  elbow_flex: [-100, -40],
  kops: [100, 100],
  saddle_height: [110, 0],
  setback: [110, 40],
  setback_nose: [110, 80],
  drop: [-100, -60],
  reach: [-100, -90],
};

export const Callouts3D: React.FC<{
  px: ProjectedMap<MetricId>;
  focused: MetricId;
  show: MetricId[];
  width: number;
  height: number;
  values: Partial<Record<MetricId, number>>;
}> = ({ px, focused, show, width, height, values }) => {
  const anchors = show.flatMap((id) => (px[id] ? [{ id, x: px[id]!.x, y: px[id]!.y, hot: id === focused }] : []));
  return <CalloutLayer anchors={anchors} width={width} height={height} prefer={PREFER_3D} values={values} />;
};
