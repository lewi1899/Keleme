"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, Palette } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { useTheme } from "./ThemeProvider";

/**
 * Theme picker. Six swatches behind a popover rather than always-on, because
 * the original inline row consumed most of the header width on a phone.
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
          className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
          style={{ backgroundColor: active.swatch }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Themes"
          className="kl-surface animate-kl-pop absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-2xl border p-2 shadow-kl-lift"
        >
          {THEMES.map((t) => {
            const locked = t.isPremium && !isPremium;
            const isActive = theme === t.id;

            return (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                disabled={locked}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                title={locked ? `${t.name} — available with Premium` : t.name}
                className={`kl-press flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                  locked
                    ? "cursor-not-allowed opacity-55"
                    : "hover:bg-accent-soft"
                } ${isActive ? "bg-accent-soft" : ""}`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: t.swatch }}
                />
                <span className="flex-1 font-medium text-text-primary">{t.name}</span>
                {isActive && <Check size={15} className="text-accent" aria-hidden />}
                {locked && <Lock size={13} className="text-text-secondary" aria-hidden />}
              </button>
            );
          })}

          {!isPremium && (
            <p className="px-2.5 pb-1 pt-2 text-[11px] leading-snug text-text-secondary">
              Three more themes unlock with Premium.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
