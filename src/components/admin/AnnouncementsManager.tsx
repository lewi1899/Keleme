"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Megaphone, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  deleteAnnouncementAction, saveAnnouncementAction, type AnnouncementActionState,
} from "@/app/admin/announcements/actions";
import { formatDateTime } from "@/lib/format";
import type { Announcement } from "@/lib/database.types";

const INITIAL: AnnouncementActionState = {};

const LEVELS = [
  { id: "info", label: "Information", tone: "accent" as const },
  { id: "success", label: "Good news", tone: "success" as const },
  { id: "warning", label: "Warning", tone: "warning" as const },
  { id: "critical", label: "Urgent", tone: "danger" as const },
];

export function AnnouncementsManager({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(announcement: Announcement) {
    startTransition(async () => {
      const result = await deleteAnnouncementAction(announcement.id);
      if (result.error) toast.error("Could not delete", result.error);
      else { toast.success("Announcement deleted"); router.refresh(); }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>New announcement</Button>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={20} />}
          title="No announcements"
          description="Use these for exam dates, maintenance windows or new content."
          action={<Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>New announcement</Button>}
        />
      ) : (
        <div className="space-y-2">
          {announcements.map((announcement) => {
            const level = LEVELS.find((l) => l.id === announcement.level) ?? LEVELS[0];
            const expired = announcement.ends_at ? new Date(announcement.ends_at) < new Date() : false;

            return (
              <Card key={announcement.id} className={`p-4 ${announcement.is_active && !expired ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-text-primary">{announcement.title}</p>
                      <Badge tone={level.tone}>{level.label}</Badge>
                      {announcement.target_grade && <Badge tone="neutral">Grade {announcement.target_grade}</Badge>}
                      {expired && <Badge tone="neutral">Expired</Badge>}
                      {!announcement.is_active && <Badge tone="neutral">Off</Badge>}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{announcement.body}</p>
                    <p className="mt-2 text-xs text-text-secondary">
                      From {formatDateTime(announcement.starts_at)}
                      {announcement.ends_at ? ` until ${formatDateTime(announcement.ends_at)}` : " — no end date"}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(announcement)}
                      aria-label={`Edit ${announcement.title}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(announcement)}
                      disabled={pending}
                      aria-label={`Delete ${announcement.title}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <AnnouncementEditor
          announcement={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function AnnouncementEditor({
  announcement, onClose, onSaved,
}: {
  announcement: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveAnnouncementAction, INITIAL);
  const [active, setActive] = useState(announcement?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(announcement ? "Announcement updated" : "Announcement published"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, announcement, onSaved, toast]);

  // datetime-local wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string.
  const endsAtValue = announcement?.ends_at
    ? new Date(announcement.ends_at).toISOString().slice(0, 16)
    : "";

  return (
    <Modal open onClose={onClose} title={announcement ? "Edit announcement" : "New announcement"}>
      <form action={formAction} className="space-y-4">
        {announcement && <input type="hidden" name="id" value={announcement.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Title" required>
          {({ id }) => <TextInput id={id} name="title" defaultValue={announcement?.title ?? ""} placeholder="Grade 12 mock exam next week" required />}
        </Field>

        <Field label="Message" required>
          {({ id }) => (
            <TextArea id={id} name="body" defaultValue={announcement?.body ?? ""} placeholder="Practice papers for all subjects are now available under Matric papers." required />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importance">
            {({ id }) => (
              <Select id={id} name="level" defaultValue={announcement?.level ?? "info"}>
                {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </Select>
            )}
          </Field>

          <Field label="Who sees it">
            {({ id }) => (
              <Select id={id} name="targetGrade" defaultValue={announcement?.target_grade ? String(announcement.target_grade) : ""}>
                <option value="">Everyone</option>
                {[9, 10, 11, 12].map((g) => <option key={g} value={g}>Grade {g} only</option>)}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Remove automatically on" hint="Leave blank to keep it up until you turn it off.">
          {({ id }) => <TextInput id={id} name="endsAt" type="datetime-local" defaultValue={endsAtValue} />}
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
