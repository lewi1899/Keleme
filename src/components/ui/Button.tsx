"use client";

import { forwardRef } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // `--accent-contrast` rather than a hard-coded white: three of the six themes
  // have a light accent, and white-on-light was unreadable in the original.
  primary:
    "bg-accent text-[var(--accent-contrast)] hover:brightness-110 shadow-kl-card disabled:hover:brightness-100",
  secondary:
    "border border-kl-border bg-surface text-text-primary hover:bg-accent-soft hover:border-accent",
  ghost: "text-text-secondary hover:bg-accent-soft hover:text-text-primary",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-kl-card",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-kl-card",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, fullWidth, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // A loading button stays mounted and keeps its width; swapping it for a
      // spinner makes the layout jump under the user's thumb mid-tap.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "kl-press inline-flex items-center justify-center font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
