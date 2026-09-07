import { requireStaff } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Gate for the entire admin area. Content editors get in; students do not.
 * Screens that need full administrator rights call `requireAdmin` themselves
 * on top of this, and every one of them is backed by an RLS policy or a
 * SECURITY DEFINER function that checks again — the nav filtering above is
 * cosmetic, this and the database are the actual controls.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();

  return (
    <AdminShell
      role={session.profile.role}
      fullName={session.profile.full_name}
      email={session.profile.email}
      isPremium={session.is_premium}
    >
      {children}
    </AdminShell>
  );
}
