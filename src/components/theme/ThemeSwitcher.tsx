"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, Palette } from "lucide-react";
import { THEMES, PREMIUM_THEME_COUNT } from "@/lib/themes";
import { useTheme } from "./ThemeProvider";

/**
 * Theme picker.
 *
 * Fourteen themes is too many for the vertical list this used to be — it ran
 * past the fold on a phone. A three-column grid of gradient swatches shows the
 * whole set at once and lets a student choose by colour rather than by reading
 * fourteen names.
 *
 * The swatch gradient is built from two hex values in the catalogue, not from
 * the theme's own custom properties: a `[data-theme]` block only applies to
 * the element it is set on, so a swatch cannot preview a theme that is not
 * currently active without duplicating every palette. Two literals per theme
 * is the cheap way to show a preview, and costs no CSS.
 *
 * Premium themes stay visible but locked — a student should be able to see
 * what a subscription would give them.
 */
export function ThemeSwitcher({ isPremium = false }: { isPremium?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const free = THEMES.filter((t) => !t.isPremium);
  const premium = THEMES.filter((t) => t.isPremium);

  function Swatch({ id }: { id: (typeof THEMES)[number]["id"] }) {
    const t = THEMES.find((x) => x.id === id)!;
    const locked = t.isPremium && !isPremium;
    const isActive = theme === t.id;

    return (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={isActive}
        disabled={locked}
        onClick={() => {
          setTheme(t.id);
          setOpen(false);
        }}
        title={locked ? `${t.name} — available with Premium` : t.name}
        className={`kl-press group flex flex-col items-center gap-1 rounded-xl p-1 transition-colors ${
          locked ? "cursor-not-allowed opacity-60" : "hover:bg-accent-soft"
        }`}
      >
        <span
          aria-hidden
          className={`relative flex h-11 w-full items-center justify-center rounded-lg ring-1 ring-inset ring-black/15 transition-transform duration-200 ${
            locked ? "" : "group-hover:scale-[1.06]"
          } ${isActive ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]" : ""}`}
          style={{ backgroundImage: `linear-gradient(135deg, ${t.swatch} 0%, ${t.swatchTo} 100%)` }}
        >
          {isActive && <Check size={16} strokeWidth={3} className="text-white drop-shadow" />}
          {locked && !isActive && <Lock size={13} className="text-white/90 drop-shadow" />}
        </span>
        <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-text-secondary">
          {t.name}
        </span>
      </button>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Change theme (currently ${active.name})`}
        className="kl-press flex h-9 items-center gap-2 rounded-full border border-kl-border px-3 text-sm font-medium text-text-secondary hover:bg-accent-soft hover:text-text-primary"
      >
        <Palette size={15} aria-hidden />
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
          style={{ backgroundImage: `linear-gradient(135deg, ${active.swatch} 0%, ${active.swatchTo} 100%)` }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Themes"
          className="kl-surface animate-kl-pop absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-2xl border p-3 shadow-kl-lift"
        >
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Themes
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {free.map((t) => (
              <Swatch key={t.id} id={t.id} />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 px-1 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Premium</p>
            <span className="h-px flex-1 bg-kl-border" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {premium.map((t) => (
              <Swatch key={t.id} id={t.id} />
            ))}
          </div>

          {!isPremium && (
            <p className="px-1 pt-3 text-[11px] leading-snug text-text-secondary">
              {PREMIUM_THEME_COUNT} more themes unlock with Premium.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
