# Photo outline extraction

Edge-extracts part outlines from product photos on a plain light background. Shared helpers live in
`outline.py` (silhouette, polygon masks, smoothed/simplified contours, through-holes); each part type
has its own script. Photos are not committed (product imagery). Requires `numpy`,
`opencv-python-headless` (install into the project venv: `uv pip install --python .venv/bin/python opencv-python-headless`).
Run the scripts from the folder holding the photos with `PYTHONPATH=tools/photo_trace`.

`crop.py <img> x0 y0 x1 y1 out.png 4` makes gridded zoom crops for marking internal boundaries.

## Hoods → `web/src/hoodModels.ts`

Side-on photo, bike pointing right, outside face of the right-hand lever.

1. `seg.py` — silhouette: per-row background estimate (handles grey gradients),
   threshold, largest component, holes filled.
2. Mark the internal boundaries on 4× crops: hood body vs lever, the pad/paddle, and the
   bar-clamp tab to remove. Put them in `CFG` in `parts.py` as generous polygons that are only
   precise along the internal boundary — the outer edge always comes from the photo.
3. `parts.py` — splits the silhouette, smooths each contour (5 px circular moving
   average), simplifies it, and writes `parts.json` plus overlay/zoom images for
   checking every edge against the photo.
4. Convert to mm with the bar centre (60% down the rear opening) and a px/mm
   scale, and paste into `hoodModels.ts`. The photos carry no scale: confirm the
   absolute size against the maker's dimension drawing.

## Saddles → `web/src/saddleModels.ts`

A side photo and a top photo, nose pointing right in both.

1. In `CFG` in `saddle.py`, mark the shell/rail boundary as a polygon (only precise where the
   rails run into the base) and the x-range of the straight clamp section (sets y = 0). Scale comes
   from the maker's length × width.
2. `saddle.py` — writes `saddle.json` (side shell + rail outlines, per-x top/underside/rail
   centreline, symmetrised plan half-width and hole half-width) and `saddle_*_parts.png` overlays.
3. Paste into `saddleModels.ts`; trim the rail centreline ends into the base by hand. Crown and rail
   splay are not visible in either photo and are set by hand there.
