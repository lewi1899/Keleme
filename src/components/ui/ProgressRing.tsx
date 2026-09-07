"use client";

import { useEffect, useState } from "react";

/**
 * Circular progress used for streaks, daily goals and quiz results.
 *
 * Animates from zero on mount by rendering the empty state first and letting a
 * CSS transition carry the stroke to its real value — so the number a student
 * earned visibly fills in rather than appearing fully formed. Users who ask for
 * reduced motion get the final value immediately, via the global rule in
 * globals.css.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 72,
  strokeWidth = 7,
  label,
  sublabel,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: React.ReactNode;
  sublabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const offset = mounted ? circumference * (1 - ratio) : circumference;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={sublabel ? `${Math.round(ratio * 100)}% — ${sublabel}` : `${Math.round(ratio * 100)}%`}
        className="-rotate-90"
      >
        <circle
          className="kl-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="kl-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {label}
      </div>
    </div>
  );
}
