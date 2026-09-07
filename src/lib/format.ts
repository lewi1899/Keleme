/** Display helpers shared across the student and admin surfaces. */

/** `5400` -> `1h 30m`. Study time is always shown in whole minutes and up. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Compact form for tight spaces like leaderboard cells. */
export function formatDurationShort(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${Math.max(0, Math.floor(seconds / 60))}m`;
}

export function formatBirr(amount: number): string {
  return `${Number(amount).toLocaleString("en-ET", {
    minimumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
    maximumFractionDigits: 2,
  })} Birr`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "in 12 days" / "3 days ago" — used for entitlement expiry and streaks. */
export function formatRelativeDays(value: string | null | undefined): string {
  if (!value) return "—";
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "—";
  const days = Math.round((target - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

/** Ordinal suffix for leaderboard positions: 1st, 2nd, 3rd, 4th, 11th. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
