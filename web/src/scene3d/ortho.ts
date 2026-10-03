export interface Frustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Orthographic frustum (camera units = mm) that shows what an SVG with this `viewBox` shows in a `pxW` × `pxH` box under
 * `preserveAspectRatio="xMidYMid meet"`. SVG y points down and bike y up, so the centre's y is negated.
 */
export function viewBoxToFrustum(viewBox: string, pxW: number, pxH: number): Frustum {
  const [minX, minY, w, h] = viewBox.trim().split(/[\s,]+/).map(Number);
  const s = Math.min(pxW / w, pxH / h);
  const W = pxW / s;
  const H = pxH / s;
  const cx = minX + w / 2;
  const cy = -(minY + h / 2);
  return { left: cx - W / 2, right: cx + W / 2, top: cy + H / 2, bottom: cy - H / 2 };
}
