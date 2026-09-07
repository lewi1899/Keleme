import { Card } from "@/components/ui/Card";

/** Consistent page header across every admin screen. */
export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
  index?: number;
}) {
  const toneClass =
    tone === "accent"
      ? "bg-accent-soft text-accent"
      : tone === "success"
      ? "bg-emerald-500/12 text-emerald-600"
      : tone === "warning"
      ? "bg-amber-500/12 text-amber-600"
      : "bg-[var(--surface-elevated)] text-text-secondary";

  return (
    <Card className="p-4" style={{ ["--kl-i" as string]: index }}>
      <div className="flex items-center gap-2">
        {icon && <span className={`grid h-8 w-8 place-items-center rounded-lg ${toneClass}`}>{icon}</span>}
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <p className="kl-display mt-2.5 text-2xl font-bold tabular-nums text-text-primary">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </Card>
  );
}

/**
 * Table shell. Wraps the table in its own horizontal scroller so a wide admin
 * table scrolls inside the card instead of making the whole page scroll
 * sideways on a phone.
 */
export function AdminTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-kl-border bg-[var(--surface-elevated)]">
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
        </table>
      </div>
      {empty}
    </Card>
  );
}
