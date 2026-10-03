import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GeometryCache, k1 } from "./geometryCache";

describe("GeometryCache", () => {
  it("returns the same object for the same key and builds once", () => {
    const c = new GeometryCache();
    const build = vi.fn(() => new THREE.BoxGeometry(1, 1, 1));
    c.begin();
    const a = c.get("box", build);
    const b = c.get("box", build);
    c.end();
    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("reuses a geometry across passes", () => {
    const c = new GeometryCache();
    c.begin();
    const a = c.get("box", () => new THREE.BoxGeometry(1, 1, 1));
    c.end();
    c.begin();
    const b = c.get("box", () => new THREE.BoxGeometry(2, 2, 2));
    c.end();
    expect(b).toBe(a);
  });

  it("disposes a key that was not requested in the last pass", () => {
    const c = new GeometryCache();
    c.begin();
    const keep = c.get("keep", () => new THREE.BoxGeometry(1, 1, 1));
    const drop = c.get("drop", () => new THREE.BoxGeometry(1, 1, 1));
    c.end();
    const keepSpy = vi.spyOn(keep, "dispose");
    const dropSpy = vi.spyOn(drop, "dispose");
    c.begin();
    c.get("keep", () => new THREE.BoxGeometry(1, 1, 1));
    c.end();
    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(keepSpy).not.toHaveBeenCalled();
  });

  it("disposeAll disposes everything", () => {
    const c = new GeometryCache();
    c.begin();
    const g = c.get("a", () => new THREE.BoxGeometry(1, 1, 1));
    c.end();
    const spy = vi.spyOn(g, "dispose");
    c.disposeAll();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("k1 rounds to 0.1", () => {
    expect(k1(12.34)).toBe("12.3");
    expect(k1(12.36)).toBe("12.4");
  });
});
