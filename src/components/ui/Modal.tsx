"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Dialog with the accessibility behaviours that are easy to skip and painful
 * to omit: Escape closes it, focus moves into it on open and returns to the
 * trigger on close, focus is trapped while it is open, and the page behind it
 * cannot scroll.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the first control, or the panel itself when there is none.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? panelRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-kl-fade-in absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`kl-surface animate-kl-pop relative flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl border shadow-kl-lift sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-kl-border p-4">
          <div className="min-w-0">
            <h2 className="kl-display text-base font-bold text-text-primary">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-kl-border p-4">{footer}</div>}
      </div>
    </div>
  );
}
