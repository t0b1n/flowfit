import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Survive a lost WebGL context (mobile browsers drop it when a tab is backgrounded): `preventDefault()` on loss lets
 * the browser restore it, and on restore the returned number changes, so a `key` on the scene content rebuilds every
 * GPU resource. Must be used inside a <Canvas>.
 */
export function useContextRestore(): number {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => e.preventDefault();
    const restored = () => {
      setN((k) => k + 1);
      invalidate();
    };
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", restored);
    return () => {
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, invalidate]);
  return n;
}
