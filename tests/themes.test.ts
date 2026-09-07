import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES } from "../src/lib/themes";

/**
 * The theme catalogue in TS and the palettes in CSS are two halves of one
 * thing, and nothing at build time ties them together: a theme listed here
 * with no matching `[data-theme]` block renders as the default palette with
 * the wrong name on its swatch, and a block with no catalogue entry is
 * unreachable. Both are silent failures in the browser, so they are asserted
 * here instead.
 *
 * The contrast check is the more important half. A palette is easy to add and
 * easy to get wrong — the original `sunset-orange` shipped white button text
 * on #f97316 at 2.80:1, which is below AA and genuinely hard to read on a
 * phone in daylight, the exact condition most KELEME students are in.
 */

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

type Palette = Record<string, string>;

function palettes(): Map<string, Palette> {
  const found = new Map<string, Palette>();
  for (const block of css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)) {
    const vars: Palette = {};
    for (const decl of block[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[decl[1]] = decl[2].trim();
    found.set(block[1], vars);
  }
  return found;
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Custom properties every palette must define for the UI to render correctly. */
const REQUIRED = [
  "--bg", "--surface", "--surface-elevated", "--border",
  "--text-primary", "--text-secondary", "--accent", "--accent-soft",
  "--glass-bg", "--accent-contrast", "--bg-mesh-a", "--bg-mesh-b",
];

test("every catalogued theme has a palette in globals.css", () => {
  const found = palettes();
  for (const theme of THEMES) {
    assert.ok(found.has(theme.id), `${theme.id} is in THEMES but has no [data-theme] block`);
  }
});

test("every palette in globals.css is catalogued", () => {
  const ids = new Set(THEMES.map((t) => t.id));
  for (const id of palettes().keys()) {
    assert.ok(ids.has(id as never), `[data-theme="${id}"] exists in CSS but is not in THEMES`);
  }
});

test("every palette defines every required custom property", () => {
  for (const [id, vars] of palettes()) {
    for (const key of REQUIRED) {
      assert.ok(vars[key], `${id} is missing ${key}`);
    }
  }
});

test("every theme meets WCAG AA contrast on the pairs that carry meaning", () => {
  for (const [id, v] of palettes()) {
    // 4.5:1 is the AA floor for body text. `--accent-contrast` on `--accent`
    // is the filled-button case, which is body-sized text in this app.
    const text: [string, string, string][] = [
      ["text-primary on bg", v["--text-primary"], v["--bg"]],
      ["text-primary on surface", v["--text-primary"], v["--surface"]],
      ["text-secondary on bg", v["--text-secondary"], v["--bg"]],
      ["text-secondary on surface", v["--text-secondary"], v["--surface"]],
      ["accent-contrast on accent", v["--accent-contrast"], v["--accent"]],
    ];
    for (const [label, fg, bg] of text) {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${id}: ${label} is ${ratio.toFixed(2)}:1, below the 4.5:1 AA floor`);
    }

    // 3:1 is the AA floor for a UI component boundary — this is `--accent`
    // used as an icon, a border or a focus ring against the card behind it.
    const ui = contrast(v["--accent"], v["--surface"]);
    assert.ok(ui >= 3, `${id}: accent on surface is ${ui.toFixed(2)}:1, below the 3:1 AA floor`);
  }
});

test("theme ids are unique and swatches are six-digit hex", () => {
  const seen = new Set<string>();
  for (const theme of THEMES) {
    assert.ok(!seen.has(theme.id), `duplicate theme id ${theme.id}`);
    seen.add(theme.id);
    for (const value of [theme.swatch, theme.swatchTo]) {
      assert.match(value, /^#[0-9a-f]{6}$/, `${theme.id} swatch ${value} must be six-digit lowercase hex`);
    }
  }
});
