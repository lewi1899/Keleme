"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Mail, Pencil, Phone, Plus, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput, Toggle } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  deleteEmailAction, deletePhoneAction, saveEmailAction, savePhoneAction,
  type ContactActionState,
} from "@/app/admin/contacts/actions";
import { formatEthiopianPhone } from "@/lib/phone";
import type { ContactEmail, ContactPhone } from "@/lib/database.types";

const INITIAL: ContactActionState = {};

export function ContactsManager({
  phones,
  emails,
}: {
  phones: ContactPhone[];
  emails: ContactEmail[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingPhone, setEditingPhone] = useState<ContactPhone | "new" | null>(null);
  const [editingEmail, setEditingEmail] = useState<ContactEmail | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  function removePhone(phone: ContactPhone) {
    startTransition(async () => {
      const result = await deletePhoneAction(phone.id);
      if (result.error) toast.error("Could not remove", result.error);
      else { toast.success("Number removed"); router.refresh(); }
    });
  }

  function removeEmail(email: ContactEmail) {
    startTransition(async () => {
      const result = await deleteEmailAction(email.id);
      if (result.error) toast.error("Could not remove", result.error);
      else { toast.success("Email removed"); router.refresh(); }
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <Phone size={17} className="text-accent" aria-hidden />
            Phone numbers
          </h2>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditingPhone("new")}>
            Add number
          </Button>
        </div>

        {phones.length === 0 ? (
          <EmptyState compact icon={<Phone size={18} />} title="No numbers yet" description="Students will not see a phone number until you add one." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {phones.map((phone) => (
              <Card key={phone.id} className={`flex items-center gap-3 p-4 ${phone.is_active ? "" : "opacity-60"}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Phone size={16} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text-primary">
                    {formatEthiopianPhone(phone.phone)}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {phone.label}
                    {phone.purpose ? ` · ${phone.purpose}` : ""}
                  </p>
                </div>
                <Badge tone={phone.is_active ? "success" : "neutral"}>
                  {phone.is_active ? "Live" : "Hidden"}
                </Badge>
                <div className="flex gap-1">
                  <IconButton label={`Edit ${phone.phone}`} onClick={() => setEditingPhone(phone)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label={`Remove ${phone.phone}`} danger disabled={pending} onClick={() => removePhone(phone)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <Mail size={17} className="text-accent" aria-hidden />
            Email addresses
          </h2>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditingEmail("new")}>
            Add email
          </Button>
        </div>

        {emails.length === 0 ? (
          <EmptyState compact icon={<Mail size={18} />} title="No addresses yet" description="Students will not see an email address until you add one." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {emails.map((email) => (
              <Card key={email.id} className={`flex items-center gap-3 p-4 ${email.is_active ? "" : "opacity-60"}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Mail size={16} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text-primary">{email.email}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {email.label}
                    {email.purpose ? ` · ${email.purpose}` : ""}
                  </p>
                </div>
                <Badge tone={email.is_active ? "success" : "neutral"}>
                  {email.is_active ? "Live" : "Hidden"}
                </Badge>
                <div className="flex gap-1">
                  <IconButton label={`Edit ${email.email}`} onClick={() => setEditingEmail(email)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label={`Remove ${email.email}`} danger disabled={pending} onClick={() => removeEmail(email)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {editingPhone !== null && (
        <PhoneEditor
          phone={editingPhone === "new" ? null : editingPhone}
          onClose={() => setEditingPhone(null)}
          onSaved={() => { setEditingPhone(null); router.refresh(); }}
        />
      )}

      {editingEmail !== null && (
        <EmailEditor
          email={editingEmail === "new" ? null : editingEmail}
          onClose={() => setEditingEmail(null)}
          onSaved={() => { setEditingEmail(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function IconButton({
  children, label, onClick, danger, disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`kl-press rounded-lg p-1.5 disabled:opacity-50 ${
        danger
          ? "text-text-secondary hover:bg-red-500/10 hover:text-red-600"
          : "text-text-secondary hover:bg-accent-soft hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function PhoneEditor({
  phone, onClose, onSaved,
}: {
  phone: ContactPhone | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(savePhoneAction, INITIAL);
  const [active, setActive] = useState(phone?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(phone ? "Number updated" : "Number added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, phone, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={phone ? "Edit number" : "Add number"} size="sm">
      <form action={formAction} className="space-y-4">
        {phone && <input type="hidden" name="id" value={phone.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Phone number" hint="Any Ethiopian format — it is stored as +251…" required>
          {({ id }) => <TextInput id={id} name="phone" defaultValue={phone?.phone ?? ""} placeholder="0912345678" required />}
        </Field>

        <Field label="Label" hint="Shown under the number." required>
          {({ id }) => <TextInput id={id} name="label" defaultValue={phone?.label ?? "Support"} placeholder="Support" required />}
        </Field>

        <Field label="Purpose" hint="Optional longer description.">
          {({ id }) => <TextInput id={id} name="purpose" defaultValue={phone?.purpose ?? ""} placeholder="Complaints and account problems" />}
        </Field>

        <Field label="Order">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={phone?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Show to students" description="Hidden numbers stay in the list but are not shown anywhere." />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}

function EmailEditor({
  email, onClose, onSaved,
}: {
  email: ContactEmail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveEmailAction, INITIAL);
  const [active, setActive] = useState(email?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(email ? "Email updated" : "Email added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, email, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={email ? "Edit email" : "Add email"} size="sm">
      <form action={formAction} className="space-y-4">
        {email && <input type="hidden" name="id" value={email.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Email address" required>
          {({ id }) => <TextInput id={id} name="email" type="email" defaultValue={email?.email ?? ""} placeholder="support@keleme.et" required />}
        </Field>

        <Field label="Label" required>
          {({ id }) => <TextInput id={id} name="label" defaultValue={email?.label ?? "General"} required />}
        </Field>

        <Field label="Purpose" hint="Optional longer description.">
          {({ id }) => <TextInput id={id} name="purpose" defaultValue={email?.purpose ?? ""} />}
        </Field>

        <Field label="Order">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={email?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Show to students" />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} icon={<Save size={16} />}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
