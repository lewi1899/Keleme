import clsx from "clsx";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "premium" | "matric";

const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--surface-elevated)] text-text-secondary border-kl-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-emerald-500/12 text-emerald-600 border-emerald-500/25",
  warning: "bg-amber-500/12 text-amber-600 border-amber-500/25",
  danger: "bg-red-500/12 text-red-600 border-red-500/25",
  premium: "bg-amber-400/15 text-amber-600 border-amber-400/30",
  matric: "bg-violet-500/12 text-violet-600 border-violet-500/25",
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Consistent labelling of an item's tier everywhere it appears. */
export function TierBadge({ tier }: { tier: "free" | "premium" | "matric" }) {
  if (tier === "free") return <Badge tone="success">Free</Badge>;
  if (tier === "matric") return <Badge tone="matric">Matric</Badge>;
  return <Badge tone="premium">Premium</Badge>;
}
