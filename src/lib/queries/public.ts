import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Plan, SupportContacts } from "@/lib/database.types";

/**
 * Public reference data, cached at the Next layer.
 *
 * Plans and support numbers change a few times a year but are read on every
 * visit to the landing page, so a one-hour cache turns the most-visited,
 * least-authenticated page in the app into something that costs no database
 * round trip at all. Admin mutations call `revalidateTag` to drop the cache
 * immediately, so a price change is live within seconds rather than an hour.
 */

export const PLANS_TAG = "plans";
export const CONTACTS_TAG = "contacts";

export const getActivePlans = unstable_cache(
  async (): Promise<Plan[]> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("kind")
      .order("sort_order");

    // A failed fetch must not take the landing page down with it — an empty
    // pricing section is recoverable, a 500 on the front door is not.
    if (error) return [];
    return (data ?? []) as Plan[];
  },
  ["active-plans"],
  { revalidate: 3600, tags: [PLANS_TAG] }
);

export const getSupportContacts = unstable_cache(
  async (): Promise<SupportContacts> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_support_contacts");
    if (error || !data) return { phones: [], emails: [] };
    return data as SupportContacts;
  },
  ["support-contacts"],
  { revalidate: 3600, tags: [CONTACTS_TAG] }
);
