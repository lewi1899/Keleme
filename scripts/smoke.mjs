/**
 * Browser smoke test.
 *
 *   npm run build && npm start &   # or: npm run dev
 *   npm run smoke
 *
 * Loads the public pages in a real browser across several themes, fails on any
 * console error or non-OK response, and writes screenshots to /tmp/keleme-smoke
 * so the rendering can be eyeballed.
 *
 * This exists because a passing build proves the code compiles, not that a page
 * renders. Every bug this has caught — a missing icon route, a hydration
 * mismatch — was invisible to `next build` and obvious here.
 *
 * Only public routes are covered: anything behind `requireUser` needs a real
 * Supabase project and a seeded account, which belongs in the manual checklist
 * in docs/DEPLOYMENT.md rather than in an unattended script.
 */

import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? "/tmp/keleme-smoke";

/**
 * Playwright-core does not download browsers, so use whatever the environment
 * already provides.
 *
 * The headless_shell build is preferred over the full chrome binary, and the
 * order matters: recent Chromium removed the old headless mode that this
 * Playwright version launches with, so pointing at `chrome` fails immediately
 * with "Old Headless mode has been removed". The headless shell IS that mode
 * as a standalone binary, so it works regardless of the pairing.
 */
const EXECUTABLE =
  process.env.CHROMIUM_PATH ??
  [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => fs.existsSync(candidate));

const PAGES = [
  { name: "landing-desktop", path: "/", width: 1280, height: 1400 },
  { name: "landing-mobile", path: "/", width: 390, height: 1200 },
  { name: "login-desktop", path: "/login", width: 1280, height: 900 },
  { name: "login-mobile", path: "/login", width: 390, height: 900 },
  { name: "register-mobile", path: "/register", width: 390, height: 900 },
  // One page per dark theme: a dark palette is where a hard-coded colour shows
  // up as unreadable text, and a build will never tell you. 0019-era work took
  // the palette count from six to fourteen, six of them dark — all six are
  // listed here, because an untested palette is an unshipped one.
  { name: "landing-amoled", path: "/", width: 1280, height: 1000, theme: "amoled-black" },
  { name: "landing-forest", path: "/", width: 1280, height: 1000, theme: "forest-green" },
  { name: "landing-purple", path: "/", width: 1280, height: 1000, theme: "royal-purple" },
  { name: "landing-midnight", path: "/", width: 1280, height: 1000, theme: "midnight-indigo" },
  { name: "landing-crimson", path: "/", width: 1280, height: 1000, theme: "crimson-ember" },
  { name: "landing-mint", path: "/", width: 1280, height: 1000, theme: "cyber-mint" },
  // And one light page per newly added light palette, on the form-heavy routes
  // where a low-contrast border or placeholder is easiest to miss.
  { name: "login-sunset", path: "/login", width: 1280, height: 900, theme: "sunset-orange" },
  { name: "login-rose", path: "/login", width: 1280, height: 900, theme: "rose-quartz" },
  { name: "login-teal", path: "/login", width: 1280, height: 900, theme: "teal-lagoon" },
  { name: "register-coffee", path: "/register", width: 390, height: 900, theme: "coffee-cream" },
  { name: "register-highland", path: "/register", width: 390, height: 900, theme: "highland-green" },
  { name: "register-sand", path: "/register", width: 390, height: 900, theme: "golden-sand" },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
  args: ["--no-sandbox"],
});

const failures = [];

for (const spec of PAGES) {
  const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height } });

  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${spec.name}: console error — ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`${spec.name}: uncaught — ${error.message}`));
  page.on("requestfailed", (request) => {
    // Next.js prefetches the React Server Component payload for links in the
    // viewport. Closing the page cancels any still in flight, which surfaces
    // here as ERR_ABORTED — a consequence of the test ending, not a fault in
    // the page. Anything else is a genuine failed request.
    const reason = request.failure()?.errorText ?? "";
    if (reason.includes("ERR_ABORTED")) return;
    failures.push(`${spec.name}: request failed (${reason}) — ${request.url()}`);
  });

  if (spec.theme) {
    await page.addInitScript((theme) => {
      try {
        window.localStorage.setItem("keleme-theme", theme);
      } catch {
        // Private browsing; the page falls back to the default theme.
      }
    }, spec.theme);
  }

  const response = await page.goto(`${BASE}${spec.path}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  if (!response || !response.ok()) {
    failures.push(`${spec.name}: ${spec.path} returned ${response?.status() ?? "no response"}`);
  }

  // Let entrance animations settle so the screenshot shows the resting state.
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${spec.name}.png` });
  await page.close();

  console.log(`  ✓ ${spec.name}`);
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}

console.log(`\nAll ${PAGES.length} pages rendered cleanly. Screenshots in ${OUT}`);
