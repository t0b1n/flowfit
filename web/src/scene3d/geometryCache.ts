import type * as THREE from "three";

let skipNormals = false;
/** `g.computeVertexNormals()`, unless the cache building this geometry was created with `normals = false`. */
export function computeNormals(g: THREE.BufferGeometry) {
  if (!skipNormals) g.computeVertexNormals();
}

/** Whether geometry being built right now should carry normals (false inside an unlit `GeometryCache`). */
export const normalsWanted = () => !skipNormals;

/** Run `build` with normal computation switched off when `normals` is false (for geometry that is not cached). */
export function withNormals<T>(normals: boolean, build: () => T): T {
  const prev = skipNormals;
  skipNormals = !normals;
  try { return build(); } finally { skipNormals = prev; }
}

/**
 * Shape-keyed BufferGeometry cache with mark-and-sweep disposal. A build pass calls `begin()`, then `get(key, build)`
 * for every geometry it needs, then `end()`; geometries not requested since `begin()` are disposed. Keys must
 * encode every number the geometry depends on (round lengths to 0.1 mm, angles to 0.01°) and nothing about where it
 * is placed: placement is the mesh's transform.
 */
export class GeometryCache {
  private live = new Map<string, THREE.BufferGeometry>();
  private used = new Set<string>();
  /** false: geometry built through this cache keeps only the normals three.js itself produces (unlit renders never read them) */
  constructor(readonly normals = true) {}
  begin() { this.used.clear(); }
  get<G extends THREE.BufferGeometry>(key: string, build: () => G): G {
    this.used.add(key);
    let g = this.live.get(key);
    if (!g) {
      const prev = skipNormals;
      skipNormals = !this.normals;
      try { g = build(); } finally { skipNormals = prev; }
      this.live.set(key, g);
    }
    return g as G;
  }
  end() {
    for (const [k, g] of this.live) if (!this.used.has(k)) { g.dispose(); this.live.delete(k); }
  }
  disposeAll() { for (const g of this.live.values()) g.dispose(); this.live.clear(); }
}

/** Round for keys: 0.1 mm / 0.001 for unitless. */
export const k1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** Round a unitless factor (scales, weight/height multipliers) to 0.001. */
export const k3 = (x: number) => x.toFixed(3);
