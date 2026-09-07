import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("kl-skeleton", className)} aria-hidden />;
}

/**
 * Skeletons mirror the real card's shape and count, so content does not jump
 * when it arrives. A generic grey box that is the wrong size is worse than no
 * skeleton at all.
 */
export function CardSkeleton() {
  return (
    <div className="kl-surface rounded-2xl border p-5 shadow-kl-card">
      <div className="mb-4 flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="kl-surface flex items-center gap-3 rounded-xl border p-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
