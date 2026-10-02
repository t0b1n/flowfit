import { HOOD_MODELS } from "../hoodModels";

/** Hood presets = the hood models (shape + default reach offset). */
export const HOOD_PRESETS = HOOD_MODELS.map((m) => ({ id: m.id, label: m.label, hoodReachOffset: m.hoodReachOffset }));

export type HoodPresetId = (typeof HOOD_PRESETS)[number]["id"];
