# Mock-up source (throwaway, reference only)

These files produced the PNGs in `../`. They are **not** app code. Do not import them into `web/`.
They exist so implementing agents can read the exact CSS values, layout measurements and mesh recipes behind
each image.

| File | What it is |
|---|---|
| `ff.css` | Light/dark token values + 3D overlay styles (readout, gauge, callouts, spec panel, Metric Rail) |
| `app.css`, `app.html` | Full-app screen: nav, 272/1fr/292 layout, controls column, 2D side view (SVG), results column |
| `kit.js`, `rider3.js` | Lathe limb builder, calibrated clay mannequin (`muscleLimb`, `CAL`), plain head (`headDeform`) |
| `bike3.js` | Disc road bike (2× groupset, rotors/calipers, STI levers, dropped stays) |
| `draw2d.js` | 2D side view: bike layers, clay figure polygons, plain head |
| `rider-measure/index.html`, `mmodel.html`, `calib.mjs`, `mrun.mjs` | Width calibration: the Rider Proportion Gauge page (reference measuring), the model's matching measurement, and the iteration that fits `CAL` |
| `geom.js` | Simplified pose maths **mirroring the app's rules**, including the elbow side rule. The app's `geometry.ts` remains the source of truth. |
| `scene3.js` | three.js scene: stage lighting, analytics hairlines, ruler; assembles `bike3.js` + `rider3.js` |
| `overlay.js`, `view3d.html` | DOM overlay for the 3D view |
| `rider.html` | Bare rider render (used for the rider/head images) |
| `brand.html` | The brand directions sheet (01 "Contact" is the chosen one) |

To re-render:
1. In a scratch directory, run `npm i three@0.183.2 playwright-core`.
2. Copy these files into that directory.
3. Download Geist, Geist Mono, Doto and JetBrains Mono woff2 files into `fonts/`, with `fonts/all.css` and `fonts/more.css` declaring them (or edit the `<link>` tags).
4. Run `python3 -m http.server 8765`.
5. Run `node shootp.mjs "view3d.html?theme=light" out.png`.
