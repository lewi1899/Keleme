import { Shield, UserCog } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { Card } from "@/components/ui/Card";
import { TeamManager } from "@/components/admin/TeamManager";
import type { Profile } from "@/lib/database.types";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, is_suspended, created_at")
    .in("role", ["admin", "content_editor"])
    .order("role")
    .order("full_name");

  return (
    <>
      <AdminPageHeader
        title="Team"
        description="Who can administer KELEME. Roles are enforced by the database, not by hiding buttons."
      />

      <Card className="mb-4 flex gap-3 p-4">
        <Shield size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="text-sm leading-relaxed text-text-secondary">
          <p className="font-semibold text-text-primary">Two roles, deliberately different.</p>
          <p className="mt-1">
            <span className="font-medium text-text-primary">Administrators</span> can do everything —
            students, prices, rewards, settings and the audit log.{" "}
            <span className="font-medium text-text-primary">Content editors</span> manage the
            catalogue and matric questions but cannot see student records, change prices, or read
            the audit log. Give someone the smaller role unless they genuinely need the larger one.
          </p>
        </div>
      </Card>

      <TeamManager
        members={(data ?? []) as Pick<Profile, "id" | "full_name" | "email" | "phone" | "role" | "is_suspended" | "created_at">[]}
        currentUserId={session.profile.id}
      />
    </>
  );
}
