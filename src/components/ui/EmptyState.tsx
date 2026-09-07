import { Card } from "./Card";

/**
 * Empty states name the thing that is missing and offer the next step. "No
 * data" tells a student nothing; "No notes in this unit yet — your teacher
 * adds them as the term goes on" tells them whether to wait or to look
 * elsewhere.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "p-6 text-center" : "p-10 text-center"}>
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          {icon}
        </div>
      )}
      <p className="kl-display font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
