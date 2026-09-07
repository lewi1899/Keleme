export type ThemeId =
  | "ocean-blue"
  | "pure-white"
  | "amoled-black"
  | "rose-quartz"
  | "teal-lagoon"
  | "midnight-indigo"
  | "sunset-orange"
  | "forest-green"
  | "royal-purple"
  | "coffee-cream"
  | "highland-green"
  | "crimson-ember"
  | "golden-sand"
  | "cyber-mint";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  isDark: boolean;
  isPremium: boolean;
  /** Representative colour for the picker swatch. */
  swatch: string;
  /** Second stop, so the swatch reads as a palette rather than a dot. */
  swatchTo: string;
}

// The actual colour values live in globals.css as `[data-theme="..."]` blocks
// — kept there, not here, so switching a theme is one attribute write with
// zero React re-render cost and no JavaScript ships per theme. This file is
// only the catalogue used to render the picker and to validate a stored
// preference.
//
// Free themes come first so the picker's most-used half needs no scrolling.
// `tests/themes.test.ts` asserts that every id here has a matching block in
// globals.css and that all fourteen pass WCAG AA contrast.
export const THEMES: ThemeDefinition[] = [
  { id: "ocean-blue", name: "Ocean Blue", isDark: false, isPremium: false, swatch: "#2563eb", swatchTo: "#38bdf8" },
  { id: "pure-white", name: "Pure White", isDark: false, isPremium: false, swatch: "#64748b", swatchTo: "#cbd5e1" },
  { id: "amoled-black", name: "AMOLED Black", isDark: true, isPremium: false, swatch: "#18181b", swatchTo: "#60a5fa" },
  { id: "rose-quartz", name: "Rose Quartz", isDark: false, isPremium: false, swatch: "#db2777", swatchTo: "#f9a8d4" },
  { id: "teal-lagoon", name: "Teal Lagoon", isDark: false, isPremium: false, swatch: "#0f766e", swatchTo: "#5eead4" },
  { id: "midnight-indigo", name: "Midnight Indigo", isDark: true, isPremium: false, swatch: "#1e1b4b", swatchTo: "#818cf8" },
  { id: "sunset-orange", name: "Sunset Orange", isDark: false, isPremium: true, swatch: "#c2410c", swatchTo: "#fdba74" },
  { id: "forest-green", name: "Forest Green", isDark: true, isPremium: true, swatch: "#14532d", swatchTo: "#4ade80" },
  { id: "royal-purple", name: "Royal Purple", isDark: true, isPremium: true, swatch: "#4c1d95", swatchTo: "#c4b5fd" },
  { id: "coffee-cream", name: "Coffee Cream", isDark: false, isPremium: true, swatch: "#9a5b23", swatchTo: "#e7d8c6" },
  { id: "highland-green", name: "Highland Green", isDark: false, isPremium: true, swatch: "#15803d", swatchTo: "#86efac" },
  { id: "crimson-ember", name: "Crimson Ember", isDark: true, isPremium: true, swatch: "#4c0519", swatchTo: "#fb7185" },
  { id: "golden-sand", name: "Golden Sand", isDark: false, isPremium: true, swatch: "#b45309", swatchTo: "#fcd34d" },
  { id: "cyber-mint", name: "Cyber Mint", isDark: true, isPremium: true, swatch: "#0d2c23", swatchTo: "#2dd4bf" },
];

export const DEFAULT_THEME: ThemeId = "ocean-blue";

export const FREE_THEME_COUNT = THEMES.filter((t) => !t.isPremium).length;
export const PREMIUM_THEME_COUNT = THEMES.length - FREE_THEME_COUNT;

export function isValidTheme(value: string | null): value is ThemeId {
  return Boolean(value) && THEMES.some((t) => t.id === value);
}
