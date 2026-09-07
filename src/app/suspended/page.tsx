import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getSupportContacts } from "@/lib/queries/public";
import { Logo } from "@/components/brand/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Account suspended" };
export const dynamic = "force-dynamic";

/**
 * Where `requireUser` sends a suspended account.
 *
 * A suspended student needs to be told what happened and how to reach a human
 * — bouncing them back to the sign-in page produces an infinite loop and no
 * explanation.
 */
export default async function SuspendedPage() {
  const contacts = await getSupportContacts();

  return (
    <div className="kl-mesh flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo />

      <Card className="mt-8 w-full max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/12 text-amber-600">
          <ShieldAlert size={24} />
        </div>

        <h1 className="kl-display mt-4 text-xl font-bold text-text-primary">
          Your account is on hold
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Access to KELEME has been paused for this account. If you think this is a mistake, get in
          touch and we will sort it out.
        </p>

        <div className="mt-6 space-y-2 text-left">
          {contacts.phones.map((phone) => (
            <a
              key={phone.phone}
              href={`tel:${phone.phone}`}
              className="kl-interactive block rounded-xl border border-kl-border p-3"
            >
              <span className="block text-sm font-semibold text-text-primary">{phone.phone}</span>
              <span className="block text-xs text-text-secondary">{phone.label}</span>
            </a>
          ))}
          {contacts.emails.slice(0, 1).map((email) => (
            <a
              key={email.email}
              href={`mailto:${email.email}`}
              className="kl-interactive block rounded-xl border border-kl-border p-3"
            >
              <span className="block break-all text-sm font-semibold text-text-primary">{email.email}</span>
              <span className="block text-xs text-text-secondary">{email.label}</span>
            </a>
          ))}
        </div>

        <Link href="/login" className="mt-6 inline-block">
          <Button variant="ghost">Back to sign in</Button>
        </Link>
      </Card>
    </div>
  );
}
