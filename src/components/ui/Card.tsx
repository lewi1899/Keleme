import clsx from "clsx";

/**
 * The card shell from the original build — `kl-surface`, rounded-2xl, subtle
 * border and shadow — with the hover/press motion factored in behind an
 * `interactive` flag so every clickable card in the app moves the same way.
 */
export function Card({
  className,
  interactive = false,
  as: Component = "div",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  as?: React.ElementType;
}) {
  return (
    <Component
      className={clsx(
        "kl-surface rounded-2xl border shadow-kl-card",
        interactive && "kl-interactive cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  action,
  description,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="kl-display truncate font-semibold text-text-primary">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
