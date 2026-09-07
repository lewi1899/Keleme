export type ThemeId =
  | "ocean-blue"
  | "pure-white"
  | "amoled-black"
  | "sunset-orange"
  | "forest-green"
  | "royal-purple";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  isDark: boolean;
  isPremium: boolean;
  /** Representative colour for the picker swatch. */
  swatch: string;
}

// Ported unchanged from the original KELEME build. The actual colour values
// live in globals.css as `[data-theme="..."]` blocks — kept there, not here,
// so switching a theme is one attribute write with zero React re-render cost.
// This file is the catalogue used to render the picker and to validate a
// stored preference.
export const THEMES: ThemeDefinition[] = [
  { id: "ocean-blue", name: "Ocean Blue", isDark: false, isPremium: false, swatch: "#2563eb" },
  { id: "pure-white", name: "Pure White", isDark: false, isPremium: false, swatch: "#64748b" },
  { id: "amoled-black", name: "AMOLED Black", isDark: true, isPremium: false, swatch: "#18181b" },
  { id: "sunset-orange", name: "Sunset Orange", isDark: false, isPremium: true, swatch: "#f97316" },
  { id: "forest-green", name: "Forest Green", isDark: true, isPremium: true, swatch: "#15803d" },
  { id: "royal-purple", name: "Royal Purple", isDark: true, isPremium: true, swatch: "#7c3aed" },
];

export const DEFAULT_THEME: ThemeId = "ocean-blue";

export function isValidTheme(value: string | null): value is ThemeId {
  return Boolean(value) && THEMES.some((t) => t.id === value);
}
