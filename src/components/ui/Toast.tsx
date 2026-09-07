"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (tone: ToastTone, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TONE_META: Record<ToastTone, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 size={18} />, ring: "text-emerald-500" },
  error: { icon: <XCircle size={18} />, ring: "text-red-500" },
  warning: { icon: <AlertTriangle size={18} />, ring: "text-amber-500" },
  info: { icon: <Info size={18} />, ring: "text-accent" },
};

let nextId = 1;

/**
 * Replaces the original build's silent saves. Every mutation the admin or a
 * student performs gets an acknowledgement — the single most common complaint
 * about admin tools is not knowing whether the save worked.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast("success", title, description),
      error: (title, description) => toast("error", title, description),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // aria-live so a screen reader announces the result of an action that
        // otherwise produces no visible focus change.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // Errors linger; successes get out of the way.
    const ms = toast.tone === "error" ? 7000 : 4000;
    const timer = window.setTimeout(() => onDismiss(toast.id), ms);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const meta = TONE_META[toast.tone];

  return (
    <div
      role="status"
      className="kl-surface animate-kl-slide-in-right pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3 shadow-kl-lift"
    >
      <span className={`mt-0.5 shrink-0 ${meta.ring}`} aria-hidden>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="kl-press shrink-0 rounded-lg p-1 text-text-secondary hover:bg-accent-soft"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
