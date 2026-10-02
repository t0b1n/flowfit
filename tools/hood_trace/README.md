# Hood outline extraction

Produces the hood/lever/paddle outlines in `web/src/hoodModels.ts` from a side-on
product photo (bike pointing right, outside face of the right-hand lever, plain
light background).

1. `seg.py` — silhouette: per-row background estimate (handles grey gradients),
   threshold, largest component, holes filled.
2. Mark the internal boundaries on 4× crops (`crop.py <img> x0 y0 x1 y1 out.png 4`):
   hood body vs lever, the pad/paddle, and the bar-clamp tab to remove. Put them in
   `CFG` in `parts.py` as generous polygons that are only precise along the
   internal boundary — the outer edge always comes from the photo.
3. `parts.py` — splits the silhouette, smooths each contour (5 px circular moving
   average), simplifies it, and writes `parts.json` plus overlay/zoom images for
   checking every edge against the photo.
4. Convert to mm with the bar centre (60% down the rear opening) and a px/mm
   scale, and paste into `hoodModels.ts`. The photos carry no scale: confirm the
   absolute size against the maker's dimension drawing.

Requires `numpy`, `opencv-python-headless`. Photos are not committed (product imagery).
