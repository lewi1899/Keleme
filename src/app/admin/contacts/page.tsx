import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { ContactsManager } from "@/components/admin/ContactsManager";
import type { ContactEmail, ContactPhone } from "@/lib/database.types";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function AdminContactsPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [{ data: phones }, { data: emails }] = await Promise.all([
    supabase.from("contact_phones").select("*").order("sort_order"),
    supabase.from("contact_emails").select("*").order("sort_order"),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Contacts"
        description="The numbers and addresses students see on the landing page, in Settings, and when they request a plan. Nothing here is hard-coded — change it and it is live everywhere within seconds."
      />
      <ContactsManager
        phones={(phones ?? []) as ContactPhone[]}
        emails={(emails ?? []) as ContactEmail[]}
      />
    </>
  );
}
