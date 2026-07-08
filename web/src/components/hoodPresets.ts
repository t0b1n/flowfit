export const HOOD_PRESETS = [
  { id: "shimano", label: "Shimano DA", hoodReachOffset: 24 },
  { id: "sram-red", label: "SRAM Red E1", hoodReachOffset: 28 },
  { id: "sram-force", label: "SRAM Force E1", hoodReachOffset: 28 },
] as const;

export type HoodPresetId = (typeof HOOD_PRESETS)[number]["id"];
