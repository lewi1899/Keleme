"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { BookOpen, ChevronDown, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  deleteSubjectAction, deleteUnitAction, saveSubjectAction, saveUnitAction,
  type SubjectActionState,
} from "@/app/admin/subjects/actions";
import type { Subject, Unit } from "@/lib/database.types";

const INITIAL: SubjectActionState = {};

type SubjectRow = Subject & { content_items: { count: number }[] };

export function SubjectsManager({
  grade,
  subjects,
  units,
}: {
  grade: number;
  subjects: SubjectRow[];
  units: Unit[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingSubject, setEditingSubject] = useState<SubjectRow | "new" | null>(null);
  const [editingUnit, setEditingUnit] = useState<{ unit: Unit | null; subjectId: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function removeSubject(subject: SubjectRow) {
    startTransition(async () => {
      const result = await deleteSubjectAction(subject.id);
      if (result.error) toast.error("Could not delete", result.error);
      else { toast.success("Subject deleted", subject.name); router.refresh(); }
    });
  }

  function removeUnit(unit: Unit) {
    startTransition(async () => {
      const result = await deleteUnitAction(unit.id);
      if (result.error) toast.error("Could not delete", result.error);
      else { toast.success("Unit deleted"); router.refresh(); }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[9, 10, 11, 12].map((g) => (
            <a
              key={g}
              href={`/admin/subjects?grade=${g}`}
              className={`kl-press rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                g === grade
                  ? "border-accent bg-accent text-[var(--accent-contrast)]"
                  : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
              }`}
            >
              Grade {g}
            </a>
          ))}
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setEditingSubject("new")}>
          Add subject
        </Button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={20} />}
          title={`No Grade ${grade} subjects yet`}
          description="Add a subject to start filing content under it."
          action={<Button icon={<Plus size={16} />} onClick={() => setEditingSubject("new")}>Add subject</Button>}
        />
      ) : (
        <div className="space-y-2">
          {subjects.map((subject) => {
            const subjectUnits = units.filter((u) => u.subject_id === subject.id);
            const open = expanded === subject.id;
            const contentCount = subject.content_items?.[0]?.count ?? 0;

            return (
              <Card key={subject.id} className={`overflow-hidden p-0 ${subject.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-3 p-4">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor: subject.color }}
                    aria-hidden
                  >
                    {subject.name.slice(0, 2)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{subject.name}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {contentCount} item{contentCount === 1 ? "" : "s"} ·{" "}
                      {subjectUnits.length} unit{subjectUnits.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {!subject.is_active && <Badge tone="neutral">Hidden</Badge>}

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : subject.id)}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} units for ${subject.name}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      <ChevronDown size={16} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSubject(subject)}
                      aria-label={`Edit ${subject.name}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSubject(subject)}
                      disabled={pending}
                      aria-label={`Delete ${subject.name}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="animate-kl-fade-in border-t border-kl-border bg-[var(--surface-elevated)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-text-primary">Units</p>
                      <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditingUnit({ unit: null, subjectId: subject.id })}>
                        Add unit
                      </Button>
                    </div>

                    {subjectUnits.length === 0 ? (
                      <p className="text-sm text-text-secondary">
                        No units yet. Content can still be filed directly under the subject.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {subjectUnits.map((unit) => (
                          <div key={unit.id} className="flex items-center gap-3 rounded-xl border border-kl-border bg-surface p-2.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-text-primary">{unit.title}</span>
                              {unit.description && (
                                <span className="block truncate text-xs text-text-secondary">{unit.description}</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingUnit({ unit, subjectId: subject.id })}
                              aria-label={`Edit ${unit.title}`}
                              className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                            >
                              <Pencil size={14} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeUnit(unit)}
                              disabled={pending}
                              aria-label={`Delete ${unit.title}`}
                              className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editingSubject !== null && (
        <SubjectEditor
          subject={editingSubject === "new" ? null : editingSubject}
          grade={grade}
          onClose={() => setEditingSubject(null)}
          onSaved={() => { setEditingSubject(null); router.refresh(); }}
        />
      )}

      {editingUnit !== null && (
        <UnitEditor
          unit={editingUnit.unit}
          subjectId={editingUnit.subjectId}
          onClose={() => setEditingUnit(null)}
          onSaved={() => { setEditingUnit(null); router.refresh(); }}
        />
      )}
    </>
  );
}

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#db2777", "#ca8a04", "#b45309", "#475569", "#059669", "#4f46e5"];

function SubjectEditor({
  subject, grade, onClose, onSaved,
}: {
  subject: Subject | null;
  grade: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveSubjectAction, INITIAL);
  const [color, setColor] = useState(subject?.color ?? COLORS[0]);
  const [active, setActive] = useState(subject?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(subject ? "Subject updated" : "Subject added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, subject, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={subject ? "Edit subject" : "Add subject"} size="sm">
      <form action={formAction} className="space-y-4">
        {subject && <input type="hidden" name="id" value={subject.id} />}
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Name" required>
          {({ id }) => <TextInput id={id} name="name" defaultValue={subject?.name ?? ""} placeholder="Mathematics" required />}
        </Field>

        <Field label="Grade" required>
          {({ id }) => (
            <Select id={id} name="grade" defaultValue={String(subject?.grade ?? grade)}>
              {[9, 10, 11, 12].map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </Select>
          )}
        </Field>

        <Field label="Description">
          {({ id }) => <TextArea id={id} name="description" defaultValue={subject?.description ?? ""} />}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-primary">Colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                className={`kl-press h-8 w-8 rounded-lg ring-2 transition-transform ${
                  color === c ? "scale-110 ring-[var(--accent)]" : "ring-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <Field label="Order" hint="Lower numbers appear first.">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={subject?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Visible to students" />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}

function UnitEditor({
  unit, subjectId, onClose, onSaved,
}: {
  unit: Unit | null;
  subjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveUnitAction, INITIAL);
  const [active, setActive] = useState(unit?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(unit ? "Unit updated" : "Unit added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, unit, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={unit ? "Edit unit" : "Add unit"} size="sm">
      <form action={formAction} className="space-y-4">
        {unit && <input type="hidden" name="id" value={unit.id} />}
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Title" required>
          {({ id }) => <TextInput id={id} name="title" defaultValue={unit?.title ?? ""} placeholder="Unit 3 — Chemical Bonding" required />}
        </Field>

        <Field label="Description">
          {({ id }) => <TextArea id={id} name="description" defaultValue={unit?.description ?? ""} />}
        </Field>

        <Field label="Order">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={unit?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Visible to students" />

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
