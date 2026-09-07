"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserCog, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { AdminTable } from "@/components/admin/AdminPage";
import { useToast } from "@/components/ui/Toast";
import { setRoleAction } from "@/app/admin/students/actions";
import { formatDate } from "@/lib/format";
import type { Profile, UserRole } from "@/lib/database.types";

type Member = Pick<Profile, "id" | "full_name" | "email" | "phone" | "role" | "is_suspended" | "created_at">;

export function TeamManager({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [promoting, setPromoting] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeRole(member: Member, role: UserRole) {
    startTransition(async () => {
      const result = await setRoleAction(member.id, role);
      if (result.error) toast.error("Could not change role", result.error);
      else {
        toast.success("Role updated", `${member.full_name} is now ${roleLabel(role)}`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={<UserCog size={16} />} onClick={() => setPromoting(true)}>
          Add a team member
        </Button>
      </div>

      <AdminTable headers={["Name", "Contact", "Role", "Since", ""]}>
        {members.map((member) => (
          <tr key={member.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
            <td className="max-w-[200px] px-4 py-3">
              <p className="truncate font-medium text-text-primary">
                {member.full_name}
                {member.id === currentUserId && (
                  <span className="ml-2 text-xs font-semibold text-accent">you</span>
                )}
              </p>
              {member.is_suspended && <Badge tone="danger">Suspended</Badge>}
            </td>
            <td className="max-w-[220px] px-4 py-3">
              <p className="truncate text-text-secondary">{member.email}</p>
              <p className="truncate text-xs text-text-secondary">{member.phone}</p>
            </td>
            <td className="px-4 py-3">
              <Badge tone={member.role === "admin" ? "accent" : "neutral"}>{roleLabel(member.role)}</Badge>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
              {formatDate(member.created_at)}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right">
              {/* No self-demotion. The database refuses to remove the last
                  administrator, but locking yourself out one click before that
                  is just as unpleasant. */}
              {member.id !== currentUserId && (
                <div className="flex justify-end gap-1.5">
                  {member.role === "content_editor" ? (
                    <Button size="sm" variant="secondary" disabled={pending} icon={<ShieldCheck size={14} />} onClick={() => changeRole(member, "admin")}>
                      Make administrator
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => changeRole(member, "content_editor")}>
                      Make content editor
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={pending} icon={<UserMinus size={14} />} onClick={() => changeRole(member, "student")}>
                    Remove
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </AdminTable>

      <PromoteModal open={promoting} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); router.refresh(); }} />
    </>
  );
}

function roleLabel(role: UserRole): string {
  return role === "admin" ? "Administrator" : role === "content_editor" ? "Content editor" : "Student";
}

/**
 * Promotes an existing account rather than creating one.
 *
 * KELEME has no invite-by-email flow, and adding one would mean an
 * unauthenticated endpoint that creates privileged accounts. Asking the person
 * to register normally first, then promoting them here, keeps every account
 * created through the same hardened path.
 */
function PromoteModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("content_editor");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function promote() {
    startTransition(async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (error || !data) {
        toast.error("No account with that email", "Ask them to register on KELEME first, then promote them here.");
        return;
      }

      const result = await setRoleAction(data.id as string, role);
      if (result.error) toast.error("Could not change role", result.error);
      else {
        toast.success("Team member added", `${data.full_name} is now ${roleLabel(role)}`);
        setEmail("");
        onDone();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a team member" size="sm">
      <p className="text-sm leading-relaxed text-text-secondary">
        The person needs a KELEME account first. Ask them to register normally, then enter their
        email here.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          promote();
        }}
      >
        <Field label="Their email" required>
          {({ id }) => (
            <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@example.com" required />
          )}
        </Field>

        <Field label="Role" hint="Content editors cannot see student records, change prices, or read the audit log.">
          {({ id }) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="content_editor">Content editor</option>
              <option value="admin">Administrator</option>
            </Select>
          )}
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending} icon={<UserCog size={15} />}>Add to team</Button>
        </div>
      </form>
    </Modal>
  );
}
