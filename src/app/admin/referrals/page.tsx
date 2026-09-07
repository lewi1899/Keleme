import { AlertTriangle, Users } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader, AdminTable, StatTile } from "@/components/admin/AdminPage";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

interface ReferralRow {
  id: string;
  status: string;
  referral_code: string;
  created_at: string;
  confirmed_at: string | null;
  review_reason: string | null;
  referrer: { full_name: string; phone: string } | null;
  referred: { full_name: string; phone: string; created_at: string } | null;
}

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const status = searchParams.status ?? "all";

  // Two FKs to the same table, so each join is aliased by its constraint name
  // — without the disambiguation PostgREST cannot tell referrer from referred.
  let query = supabase
    .from("referrals")
    .select(
      "id, status, referral_code, created_at, confirmed_at, review_reason, " +
        "referrer:profiles!referrals_referrer_id_fkey(full_name, phone), " +
        "referred:profiles!referrals_referred_id_fkey(full_name, phone, created_at)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status !== "all") query = query.eq("status", status);

  const [{ data }, { count: confirmedCount }, { count: pendingCount }, { count: rewardCount }] =
    await Promise.all([
      query,
      supabase.from("referrals").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabase.from("referrals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("referral_rewards").select("id", { count: "exact", head: true }),
    ]);

  const rows = (data ?? []) as unknown as ReferralRow[];
  const flagged = rows.filter((r) => r.review_reason && r.status === "pending");

  return (
    <>
      <AdminPageHeader
        title="Referrals"
        description="A referral counts only once the invited student registers AND signs in — a registration that is never used pays nothing."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile index={0} icon={<Users size={16} />} tone="success" label="Confirmed" value={(confirmedCount ?? 0).toLocaleString()} />
        <StatTile index={1} icon={<Users size={16} />} label="Waiting for first sign-in" value={(pendingCount ?? 0).toLocaleString()} />
        <StatTile index={2} icon={<Users size={16} />} tone="accent" label="Rewards paid" value={(rewardCount ?? 0).toLocaleString()} />
      </div>

      {flagged.length > 0 && (
        <Card className="mb-4 flex gap-3 border-amber-500/40 p-4">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-text-secondary">
            <p className="font-semibold text-text-primary">
              {flagged.length} referral{flagged.length === 1 ? "" : "s"} held for review
            </p>
            <p className="mt-1">
              These referrers brought in accounts faster than the configured hourly limit, so the
              rewards were withheld rather than paid automatically. Genuinely popular students can
              be confirmed manually; obvious farming should be left as-is.
            </p>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: "all", label: "All" },
          { id: "confirmed", label: "Confirmed" },
          { id: "pending", label: "Pending" },
        ].map((f) => (
          <a
            key={f.id}
            href={`/admin/referrals?status=${f.id}`}
            className={`kl-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              status === f.id
                ? "border-accent bg-accent text-[var(--accent-contrast)]"
                : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title="No referrals yet" description="They appear here as students share their codes." />
      ) : (
        <AdminTable headers={["Referrer", "Invited student", "Code", "Registered", "Status", "Note"]}>
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
              <td className="max-w-[180px] px-4 py-3">
                <p className="truncate font-medium text-text-primary">{row.referrer?.full_name ?? "—"}</p>
                <p className="truncate text-xs text-text-secondary">{row.referrer?.phone}</p>
              </td>
              <td className="max-w-[180px] px-4 py-3">
                <p className="truncate font-medium text-text-primary">{row.referred?.full_name ?? "—"}</p>
                <p className="truncate text-xs text-text-secondary">{row.referred?.phone}</p>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="font-mono text-xs tracking-wider text-text-secondary">{row.referral_code}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                {formatDateTime(row.created_at)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={row.status === "confirmed" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                  {row.status === "pending" ? "Not signed in yet" : row.status}
                </Badge>
              </td>
              <td className="max-w-[160px] truncate px-4 py-3 text-xs text-text-secondary">
                {row.review_reason === "burst_rate_exceeded" ? "Held: unusual rate" : row.review_reason ?? "—"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
