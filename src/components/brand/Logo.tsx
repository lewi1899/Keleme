import clsx from "clsx";

/**
 * The KELEME mark. Kept as a component rather than an image asset so it
 * inherits the active theme's accent colour — the logo changes with the theme
 * instead of sitting on a mismatched blue square in the five non-blue themes.
 */
export function Logo({
  size = "md",
  showWordmark = true,
  subtitle,
  className,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
}) {
  const box = size === "sm" ? "h-8 w-8 text-sm" : size === "lg" ? "h-12 w-12 text-xl" : "h-10 w-10 text-base";
  const word = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-lg";

  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <span
        className={clsx(
          "kl-display grid shrink-0 place-items-center rounded-xl bg-accent font-extrabold text-[var(--accent-contrast)] shadow-kl-card",
          box
        )}
        aria-hidden
      >
        K
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className={clsx("kl-display font-extrabold tracking-tight text-text-primary", word)}>KELEME</span>
          {subtitle && <span className="mt-1 text-[11px] font-medium leading-none text-text-secondary">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
