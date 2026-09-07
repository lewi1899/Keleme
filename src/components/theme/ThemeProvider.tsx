"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_THEME, isValidTheme, THEMES, type ThemeId } from "@/lib/themes";

const STORAGE_KEY = "keleme-theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Adopt whatever the inline anti-flash script already wrote to
  // <html data-theme>, so React state and the DOM never disagree on the first
  // paint.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (isValidTheme(current)) setThemeState(current);
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);

    // Themes carry their own browser-chrome colour so the phone's status bar
    // matches the app rather than staying stuck on the default blue.
    const meta = document.querySelector('meta[name="theme-color"]');
    const swatch = THEMES.find((t) => t.id === next)?.swatch;
    if (meta && swatch) meta.setAttribute("content", swatch);

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can throw. The theme still applies for this session
      // via the DOM attribute above; only the memory of it is lost.
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

/**
 * Injected as a raw <script> in the root layout so it runs before hydration.
 * Without it, every returning user sees a flash of the default blue theme
 * while React boots — which on a slow phone is a noticeable, ugly half-second.
 */
export const themeAntiFlashScript = `
(function() {
  try {
    var saved = window.localStorage.getItem('${STORAGE_KEY}');
    var valid = ${JSON.stringify(THEMES.map((t) => t.id))};
    document.documentElement.setAttribute('data-theme', valid.indexOf(saved) !== -1 ? saved : '${DEFAULT_THEME}');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
  }
})();
`;
