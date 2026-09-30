// Tonal Fresnel rim for MeshPhysical/Standard materials (not neon: low power, tinted toward the stage light).
import * as THREE from 'three';
export function withFresnel(mat, { color = 0xffffff, strength = .35, power = 3, alphaOnly = false } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.fresCol = { value: new THREE.Color(color) }; sh.uniforms.fresK = { value: strength }; sh.uniforms.fresP = { value: power };
    sh.fragmentShader = 'uniform vec3 fresCol; uniform float fresK; uniform float fresP;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
      float fr = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), fresP);
      ${alphaOnly ? 'gl_FragColor = vec4(fresCol, clamp(fr * fresK, 0.0, 1.0));' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, fresCol, clamp(fr * fresK, 0.0, 1.0));'}
      #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => `fres${color}${strength}${power}${alphaOnly}`;
  return mat;
}
