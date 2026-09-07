import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/app/AppShell";

/**
 * Every authenticated route sits under this layout, so `requireUser` is the
 * single gate for the whole student app — no page can forget to check.
 * `getSessionContext` is memoised per request, so pages below can call it
 * again for free rather than being handed props through four levels.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  return <AppShell session={session}>{children}</AppShell>;
}
