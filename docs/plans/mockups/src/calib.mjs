// iterate: measure model → CAL *= target/measured
import fs from 'fs'; import { execSync } from 'child_process';
const T = { thigh: [193, 178.1, 141], calf: [132, 128.4, 96.3], upperArm: [110.4, 93.5, 79.4], forearm: [87, 76.3, 54.7], torso: [242.1, 258, 275.2], neck: [114.1] };
for (let it = 0; it < 4; it++) {
  const out = execSync('node mrun.mjs mmodel.html mm.png').toString(); const m = JSON.parse(out.trim().split('\n').at(-1));
  let src = fs.readFileSync('rider3.js', 'utf8'); const calLine = src.match(/export const CAL = (\{.*\});/)[1];
  const CAL = eval('(' + calLine + ')'); let worst = 0;
  for (const k in T) T[k].forEach((t, i) => { const r = t / m[k][i]; worst = Math.max(worst, Math.abs(r - 1)); CAL[k][i][1] = +(CAL[k][i][1] * r).toFixed(3); });
  console.log('iter', it, 'worst', (worst * 100).toFixed(1) + '%', JSON.stringify(m));
  src = src.replace(calLine, JSON.stringify(CAL).replace(/"(\w+)":/g, '$1: ')); fs.writeFileSync('rider3.js', src);
  if (worst < .02) break;
}
