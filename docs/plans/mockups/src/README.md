# Mock-up source (throwaway, reference only)

These files produced the PNGs in `../`. They are **not** app code. Do not import them into `web/`.
They exist so implementing agents can read the exact CSS values, layout measurements and mesh recipes behind
each image.

| File | What it is |
|---|---|
| `ff.css` | Light/dark token values + 3D overlay styles (readout, gauge, callouts, spec panel, Metric Rail) |
| `app.css`, `app.html` | Full-app screen: nav, 272/1fr/292 layout, controls column, 2D side view (SVG), results column |
| `geom.js` | Simplified pose maths **mirroring the app's rules**, including the elbow side rule. The app's `geometry.ts` remains the source of truth. |
| `scene3.js` | three.js scene: limb lathe builder, anatomical profiles, head ellipsoid + helmet recipe, bike shapes, stage lighting |
| `overlay.js`, `view3d.html` | DOM overlay for the 3D view |
| `brand.html` | The three brand directions |

To re-render:
1. In a scratch directory, run `npm i three@0.183.2 playwright-core`.
2. Copy these files into that directory.
3. Download Geist, Geist Mono, Doto, JetBrains Mono, Jost and VT323 woff2 files into `fonts/`, with `fonts/all.css` and `fonts/more.css` declaring them (or edit the `<link>` tags).
4. Run `python3 -m http.server 8765`.
5. Run `node shootp.mjs "view3d.html?theme=light" out.png`.
