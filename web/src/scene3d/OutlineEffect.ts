import { Effect, EffectAttribute } from "postprocessing";
import { Color, Uniform } from "three";

const fragment = /* glsl */ `
uniform vec3 lineColor;
uniform float lineAlpha;
uniform float thickness;
uniform float thresholdMm;
uniform float depthRangeMm;

// A pixel is on the outline when a neighbour is farther from the camera than it by more than thresholdMm. Only the
// nearer side of an edge is marked, so the line is one pixel wide; it follows silhouettes and the edges where one part
// passes in front of another, even when both have the same flat colour.
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 o = texelSize * thickness;
  float m = 0.0;
  m = max(m, readDepth(uv + vec2( o.x, 0.0)) - depth);
  m = max(m, readDepth(uv + vec2(-o.x, 0.0)) - depth);
  m = max(m, readDepth(uv + vec2(0.0,  o.y)) - depth);
  m = max(m, readDepth(uv + vec2(0.0, -o.y)) - depth);
  float edge = step(thresholdMm, m * depthRangeMm) * lineAlpha;
  outputColor = vec4(mix(inputColor.rgb, lineColor, edge), max(inputColor.a, edge));
}
`;

export interface OutlineOptions {
  /** CSS colour of the line */
  color?: string;
  /** 0–1 */
  alpha?: number;
  /** line width in render-buffer pixels */
  thickness?: number;
  /** depth step (mm along the view direction) that counts as an edge */
  thresholdMm?: number;
  /** far − near of the camera (mm): depth buffer values are fractions of it */
  depthRangeMm?: number;
}

export class OutlineEffect extends Effect {
  constructor({ color = "#1a1a1a", alpha = 0.7, thickness = 1, thresholdMm = 12, depthRangeMm = 2e5 }: OutlineOptions = {}) {
    super("OutlineEffect", fragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ["lineColor", new Uniform(new Color(color))],
        ["lineAlpha", new Uniform(alpha)],
        ["thickness", new Uniform(thickness)],
        ["thresholdMm", new Uniform(thresholdMm)],
        ["depthRangeMm", new Uniform(depthRangeMm)],
      ]),
    });
  }

  setLine({ color, alpha, thickness }: Pick<OutlineOptions, "color" | "alpha" | "thickness">) {
    if (color != null) (this.uniforms.get("lineColor")!.value as Color).set(color);
    if (alpha != null) this.uniforms.get("lineAlpha")!.value = alpha;
    if (thickness != null) this.uniforms.get("thickness")!.value = thickness;
  }
}
