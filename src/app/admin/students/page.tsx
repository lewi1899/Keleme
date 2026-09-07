import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { StudentsTable } from "@/components/admin/StudentsTable";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export interface StudentRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  grade: number;
  school_name: string | null;
  current_streak: number;
  total_seconds: number;
  is_suspended: boolean;
  created_at: string;
  last_activity_date: string | null;
  is_premium: boolean;
  is_matric: boolean;
  leaderboard_opt_in: boolean;
}

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: { q?: string; grade?: string; filter?: string; page?: string };
}) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const page = Math.max(1, Number(searchParams.page) || 1);

  // Search, filter, page and total in one call. The alternative — a select
  // plus a separate count plus a per-row entitlement lookup — is three round
  // trips and an N+1 that would fall over at a few thousand students.
  const { data } = await supabase.rpc("admin_search_students", {
    p_query: searchParams.q ?? null,
    p_grade: searchParams.grade ? Number(searchParams.grade) : null,
    p_filter: searchParams.filter ?? "all",
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  const result = (data ?? { total: 0, rows: [] }) as { total: number; rows: StudentRow[] };

  return (
    <>
      <AdminPageHeader
        title="Students"
        description="Everyone registered on KELEME. Grant or revoke access, suspend accounts, and see who is actually studying."
      />
      <StudentsTable
        rows={result.rows}
        total={result.total}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{
          q: searchParams.q ?? "",
          grade: searchParams.grade ?? "",
          filter: searchParams.filter ?? "all",
        }}
      />
    </>
  );
}
