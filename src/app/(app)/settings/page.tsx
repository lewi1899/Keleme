import { LogOut, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupportContacts } from "@/lib/queries/public";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { DeviceSessions } from "@/components/settings/DeviceSessions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser();
  const supabase = createSupabaseServerClient();

  const [{ data: sessions }, contacts] = await Promise.all([
    // Never selects token_hash. The column exists so sessions can be
    // validated, not so they can be listed.
    supabase
      .from("user_sessions")
      .select("id, device_label, user_agent, created_at, last_seen_at, revoked_at")
      .eq("user_id", session.profile.id)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(10),
    getSupportContacts(),
  ]);

  const { profile } = session;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Your profile, privacy and devices.</p>
      </header>

      <SettingsForm
        fullName={profile.full_name}
        displayName={profile.display_name}
        schoolName={profile.school_name}
        leaderboardOptIn={profile.leaderboard_opt_in}
        publicNo={profile.public_no}
      />

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <User size={16} aria-hidden />
          Account
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Row label="Email" value={profile.email ?? "—"} icon={<Mail size={14} />} />
          {/* Masked, not hidden: enough for the student to confirm which
              number is on file, not enough to be a contact list if the page is
              screenshotted or cached. */}
          <Row label="Phone" value={profile.phone_masked ?? "—"} icon={<Phone size={14} />} />
          <Row label="Grade" value={`Grade ${profile.grade}`} />
          <Row label="Member since" value={formatDateTime(profile.created_at)} />
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-text-secondary">
          Your grade and phone number are fixed to keep content access and referral rewards
          honest. To change either, contact KELEME support.
        </p>
      </Card>

      <DeviceSessions
        sessions={(sessions ?? []) as {
          id: string;
          device_label: string | null;
          user_agent: string | null;
          created_at: string;
          last_seen_at: string;
        }[]}
      />

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <ShieldCheck size={16} aria-hidden />
          Need help?
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {contacts.phones.map((phone) => (
            <a
              key={phone.phone}
              href={`tel:${phone.phone}`}
              className="kl-interactive flex items-center gap-3 rounded-xl border border-kl-border p-3"
            >
              <Phone size={15} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">{phone.phone}</span>
                <span className="block text-xs text-text-secondary">{phone.label}</span>
              </span>
            </a>
          ))}
          {contacts.emails.map((email) => (
            <a
              key={email.email}
              href={`mailto:${email.email}`}
              className="kl-interactive flex items-center gap-3 rounded-xl border border-kl-border p-3"
            >
              <Mail size={15} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="block break-all text-sm font-semibold text-text-primary">{email.email}</span>
                <span className="block text-xs text-text-secondary">{email.label}</span>
              </span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface-elevated)] p-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  );
}
