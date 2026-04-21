# Adding New Frame Catalog Entries

This guide explains how to scrape geometry data and add a new bike model to
`web/src/frameCatalog.ts`.

## Prerequisites

Install the scraper's dependencies once:

```bash
pip install playwright beautifulsoup4
playwright install chromium
```

## Step 1 — Find the geometrygeeks.bike URL

Use a web search to locate the model's page:

```
site:geometrygeeks.bike <brand> <model> <year>
```

The top result gives the URL, e.g. `https://geometrygeeks.bike/bike/canyon-aeroad-cfr-2021/`.

## Step 2 — Scrape the geometry table

```bash
python tools/scrape_geometrygeeks.py <url> -o /tmp/<model-id>.json
```

The scraper launches a headed Chromium window (required to pass the invisible
reCAPTCHA) and writes a JSON file shaped like:

```json
{
  "url": "https://geometrygeeks.bike/...",
  "bike": "canyon-aeroad-cfr-2021",
  "sizes": ["XS", "S", "M", "L", "XL"],
  "geometry": {
    "Stack": { "XS": 498, "S": 520, ... },
    "Reach": { "XS": 372, "S": 378, ... },
    "Head Tube Angle": { ... },
    "Seat Tube Angle": { ... },
    "BB Drop": { ... },
    "Chain Stay": { ... },
    "Fork Length": { ... },
    "Fork Offset": { ... },
    "Wheelbase": { ... },
    "Front Center": { ... },
    "Trail": { ... },
    "Top Tube (effective)": { ... },
    "Standover": { ... },
    "BB Height": { ... },
    "Seat Tube C-T": { ... },
    "Head Tube": { ... }
  }
}
```

Missing cells → `null`. Values are ints, floats, or strings as appropriate.

## Step 3 — Map scraped fields to `FrameGeometry`

| geometrygeeks row | `frameCatalog.ts` field |
|---|---|
| Stack | `geometry.stack` |
| Reach | `geometry.reach` |
| Head Tube Angle | `geometry.head_angle_deg` |
| Seat Tube Angle | `geometry.seat_angle_deg` |
| BB Drop | `geometry.bb_drop` |
| Chain Stay | `geometry.chainstay_length` |
| Fork Length | `geometry.fork_length` |
| Fork Offset | `geometry.fork_offset` |
| Seat Tube C-T | `geometry.seat_tube_ct` |
| Head Tube | `geometry.head_tube` |
| Wheelbase | `SizeData.wheelbase` |
| Front Center | `SizeData.front_center` |
| Trail | `SizeData.trail` |
| Top Tube (effective) | `SizeData.top_tube_effective` |
| Standover | `SizeData.standover` |
| BB Height | `SizeData.bb_height` |

All values are **mm**. If a source reports cm, multiply by 10.

`wheel_radius` is not on geometrygeeks — use `340` (700c default) unless the
bike ships with 650b wheels (use `325`).

## Step 4 — Add the entry to `frameCatalog.ts`

Append a new object to `FRAME_CATALOG` in [web/src/frameCatalog.ts](../web/src/frameCatalog.ts).
Follow the shape of existing entries exactly. Required fields in `geometry`:
`stack`, `reach`, `head_angle_deg`, `seat_angle_deg`, `bb_drop`,
`chainstay_length`, `fork_length`, `fork_offset`, `wheel_radius`.

```ts
{
  id: "brand-model-slug",          // kebab-case, unique
  brand: "Brand",
  model: "Full Model Name",
  launch_year: 2024,
  category: "Aero race",           // e.g. All-round race / Aero race / Gravel / Endurance road
  popularity: "One sentence on pro usage or why this model was added.",
  sources: [
    "https://geometrygeeks.bike/bike/<slug>/",
    "https://www.brand.com/..."     // manufacturer page if available
  ],
  sizes: [
    {
      size: "S",
      geometry: {
        stack: 530, reach: 378, head_angle_deg: 72.2, seat_angle_deg: 73.8,
        bb_drop: 72, chainstay_length: 410, fork_length: 370, fork_offset: 45,
        wheel_radius: defaultWheelRadius,
        seat_tube_ct: 440, head_tube: 121          // omit if unavailable
      },
      wheelbase: 976, front_center: 572, trail: 62,
      top_tube_effective: 532, standover: 734, bb_height: 268,  // omit if unavailable
      stockCockpit: { stem_length: 90, bar_width: 400, crank_length: 170 }  // omit if unknown
    },
    // ... one object per size
  ]
}
```

### Size label conventions

Use the labels exactly as geometrygeeks and the manufacturer publish them
(e.g. `"XS"`, `"54"`, `"2XL"`, `"ML"`). Do not normalise.

### Seat tube note

Prefer **C-T** (centre-to-top) values. If only C-C is published, add ~15 mm
and note the source. If a model uses an integrated seatmast the published
frame ST length is still correct to use.

## Step 5 — Verify

```bash
cd web && npx tsc --noEmit
```

`validateFrameCatalog` runs at module load time and will throw immediately on
any missing required field, duplicate id, or non-finite number. TypeScript
will catch structural mistakes.

Cross-check two or three scraped values against the manufacturer's own
geometry page (already linked in `sources[]`). If they disagree by more than
1–2 mm, trust the manufacturer.

## Fallback sources

If the model isn't on geometrygeeks or the page is incomplete:
- Manufacturer geometry page (linked in `sources[]`)
- `bikeinsights.com` or `99spokes.com` as secondary aggregators
- Manual read of a PDF geometry chart (user-supplied)
