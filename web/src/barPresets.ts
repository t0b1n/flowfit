import type { Components } from "./types";

/** Generic bar presets (preset → fine-tune). Named real bars can be added later in the same shape. */
export interface BarPreset {
  id: string;
  label: string;
  title: string;
  values: Pick<Components, "bar_rise" | "hood_width" | "bar_drop_width" | "bar_reach" | "bar_drop_depth" | "bar_backsweep_deg" | "cockpit_build">;
}

export const BAR_PRESETS: BarPreset[] = [
  {
    id: "classic",
    label: "Classic",
    title: "Round-top alloy/carbon bar on a separate stem: no rise, light flare",
    values: { bar_rise: 0, hood_width: 380, bar_drop_width: 400, bar_reach: 80, bar_drop_depth: 125, bar_backsweep_deg: 0, cockpit_build: "two_piece" },
  },
  {
    id: "riser20",
    label: "Road riser 20",
    title: "Integrated one-piece riser cockpit (Tavelo Rise style): 20 mm rise, aero tops",
    values: { bar_rise: 20, hood_width: 370, bar_drop_width: 400, bar_reach: 80, bar_drop_depth: 120, bar_backsweep_deg: 0, cockpit_build: "integrated" },
  },
  {
    id: "pro",
    label: "Pro narrow",
    title: "Narrow hoods with flared drops to meet the UCI 400 mm minimum",
    values: { bar_rise: 0, hood_width: 320, bar_drop_width: 378, bar_reach: 80, bar_drop_depth: 125, bar_backsweep_deg: 0, cockpit_build: "integrated" },
  },
  {
    id: "gravel",
    label: "Gravel riser 50",
    title: "Big-rise flared gravel bar (Redshift Top Shelf style)",
    values: { bar_rise: 50, hood_width: 400, bar_drop_width: 500, bar_reach: 75, bar_drop_depth: 105, bar_backsweep_deg: 5, cockpit_build: "two_piece" },
  },
];

/** The preset whose values all match the components, if any. */
export function activeBarPreset(c: Components): string | null {
  const hit = BAR_PRESETS.find((p) =>
    (Object.keys(p.values) as Array<keyof BarPreset["values"]>).every((k) => {
      const want = p.values[k];
      const have = c[k] ?? (k === "bar_rise" || k === "bar_backsweep_deg" ? 0 : k === "bar_drop_depth" ? 125 : k === "cockpit_build" ? "two_piece" : null);
      return want === have;
    }),
  );
  return hit?.id ?? null;
}
