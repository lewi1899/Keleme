import { ScrollText } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader, AdminTable } from "@/components/admin/AdminPage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/lib/database.types";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Colour by consequence, so destructive events stand out when scanning. */
function toneFor(action: string): "danger" | "warning" | "success" | "neutral" {
  if (action.includes("deleted") || action.includes("suspended") || action.includes("revoked")) return "danger";
  if (action.includes("role") || action.includes("plan") || action.includes("settings")) return "warning";
  if (action.includes("granted") || action.includes("confirmed") || action.includes("published")) return "success";
  return "neutral";
}

export default async function AdminAuditPage({ searchParams }: { searchParams: { page?: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const { data, count } = await supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as AuditLog[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every administrative action, with who did it and when. Written by the database itself, so the actor cannot be forged, and readable by administrators only."
      />

      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={20} />} title="Nothing logged yet" description="Administrative actions appear here as they happen." />
      ) : (
        <>
          <AdminTable headers={["When", "Who", "Action", "Target", "Details"]}>
            {rows.map((entry) => (
              <tr key={entry.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                  {formatDateTime(entry.created_at)}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-text-secondary">
                  {entry.actor_email ?? "system"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                </td>
                <td className="max-w-[160px] truncate px-4 py-3 text-xs text-text-secondary">
                  {entry.target_table ?? "—"}
                </td>
                <td className="max-w-[280px] px-4 py-3">
                  <span className="line-clamp-2 font-mono text-[11px] text-text-secondary">
                    {Object.keys(entry.metadata ?? {}).length === 0 ? "—" : JSON.stringify(entry.metadata)}
                  </span>
                </td>
              </tr>
            ))}
          </AdminTable>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              Showing {from + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <a href={`/admin/audit?page=${page - 1}`} aria-disabled={page <= 1}>
                <Button size="sm" variant="secondary" disabled={page <= 1}>Previous</Button>
              </a>
              <a href={`/admin/audit?page=${page + 1}`} aria-disabled={page >= totalPages}>
                <Button size="sm" variant="secondary" disabled={page >= totalPages}>Next</Button>
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
