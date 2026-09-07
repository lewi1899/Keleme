"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  Calendar, Check, Eye, EyeOff, GraduationCap, Pencil, Plus, Save, Trash2, X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTable } from "@/components/admin/AdminPage";
import { useToast } from "@/components/ui/Toast";
import {
  deleteQuestionAction, deleteYearAction, saveQuestionAction, saveYearAction,
  toggleQuestionPublishAction, type MatricActionState,
} from "@/app/admin/matric/actions";
import type { AdminMatricQuestion } from "@/app/admin/matric/page";
import type { MatricYear, Subject } from "@/lib/database.types";

const INITIAL: MatricActionState = {};
const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface OptionDraft {
  label: string;
  bodyHtml: string;
  isCorrect: boolean;
}

export function MatricManager({
  years, subjects, questions, total, page, pageSize, filters,
}: {
  years: MatricYear[];
  subjects: Subject[];
  questions: AdminMatricQuestion[];
  total: number;
  page: number;
  pageSize: number;
  filters: { year: string; subject: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [editingYear, setEditingYear] = useState<MatricYear | "new" | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<AdminMatricQuestion | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.push(`/admin/matric?${next.toString()}`);
  }

  function togglePublish(question: AdminMatricQuestion) {
    startTransition(async () => {
      const result = await toggleQuestionPublishAction(question.id, !question.is_published);
      if (result.error) toast.error("Could not update", result.error);
      else { toast.success(question.is_published ? "Unpublished" : "Published"); router.refresh(); }
    });
  }

  function removeQuestion(question: AdminMatricQuestion) {
    startTransition(async () => {
      const result = await deleteQuestionAction(question.id);
      if (result.error) toast.error("Could not delete", result.error);
      else { toast.success("Question deleted"); router.refresh(); }
    });
  }

  function removeYear(year: MatricYear) {
    startTransition(async () => {
      const result = await deleteYearAction(year.id);
      if (result.error) toast.error("Could not delete", result.error);
      else { toast.success("Year deleted"); router.refresh(); }
    });
  }

  return (
    <>
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <Calendar size={17} className="text-accent" aria-hidden />
            Exam years
          </h2>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditingYear("new")}>
            Add year
          </Button>
        </div>

        {years.length === 0 ? (
          <EmptyState compact icon={<Calendar size={18} />} title="No years yet" description="Add a year before adding questions to it." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {years.map((year) => (
              <Card key={year.id} className={`flex items-center gap-3 p-3.5 ${year.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text-primary">{year.label}</p>
                  <p className="text-xs text-text-secondary">{year.year}</p>
                </div>
                {!year.is_active && <Badge tone="neutral">Off</Badge>}
                <button
                  type="button"
                  onClick={() => setEditingYear(year)}
                  aria-label={`Edit ${year.label}`}
                  className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                >
                  <Pencil size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removeYear(year)}
                  disabled={pending}
                  aria-label={`Delete ${year.label}`}
                  className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <GraduationCap size={17} className="text-violet-600" aria-hidden />
            Questions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Select value={filters.year} onChange={(e) => setParam("year", e.target.value)} aria-label="Filter by year" className="w-auto">
              <option value="">All years</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </Select>
            <Select value={filters.subject} onChange={(e) => setParam("subject", e.target.value)} aria-label="Filter by subject" className="w-auto">
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button icon={<Plus size={16} />} disabled={years.length === 0 || subjects.length === 0} onClick={() => setEditingQuestion("new")}>
              Add question
            </Button>
          </div>
        </div>

        {years.length === 0 || subjects.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={20} />}
            title="Set up a year and a Grade 12 subject first"
            description="Questions are filed under one exam year and one Grade 12 subject, so both need to exist before you can add any."
          />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={20} />}
            title="No questions yet"
            description="Add your first past-paper question. Students see it once you publish."
            action={<Button icon={<Plus size={16} />} onClick={() => setEditingQuestion("new")}>Add question</Button>}
          />
        ) : (
          <>
            <AdminTable headers={["Question", "Year", "Subject", "Options", "Access", "Status", ""]}>
              {questions.map((question) => {
                const correct = question.matric_question_options.filter((o) => o.is_correct).length;
                return (
                  <tr key={question.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-text-primary">{stripHtml(question.question_html)}</p>
                      <p className="text-xs text-text-secondary">
                        {question.difficulty} · {question.marks} mark{question.marks === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{question.matric_years?.label ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-text-secondary">{question.subjects?.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={correct === 1 ? "success" : "danger"}>
                        {question.matric_question_options.length} · {correct === 1 ? "1 correct" : `${correct} correct`}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><TierBadge tier={question.access_tier} /></td>
                    <td className="px-4 py-3">
                      <Badge tone={question.is_published ? "success" : "neutral"}>
                        {question.is_published ? "Published" : "Draft"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => togglePublish(question)}
                          disabled={pending}
                          aria-label={question.is_published ? "Unpublish" : "Publish"}
                          className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                        >
                          {question.is_published ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(question)}
                          aria-label="Edit question"
                          className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                        >
                          <Pencil size={15} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQuestion(question)}
                          disabled={pending}
                          aria-label="Delete question"
                          className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </AdminTable>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-text-secondary">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setParam("page", String(page + 1))}>Next</Button>
              </div>
            </div>
          </>
        )}
      </section>

      {editingYear !== null && (
        <YearEditor
          year={editingYear === "new" ? null : editingYear}
          onClose={() => setEditingYear(null)}
          onSaved={() => { setEditingYear(null); router.refresh(); }}
        />
      )}

      {editingQuestion !== null && (
        <QuestionEditor
          question={editingQuestion === "new" ? null : editingQuestion}
          years={years}
          subjects={subjects}
          onClose={() => setEditingQuestion(null)}
          onSaved={() => { setEditingQuestion(null); router.refresh(); }}
        />
      )}
    </>
  );
}

/** Rough text preview for the admin list — the HTML itself is already clean. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "(empty)";
}

function YearEditor({ year, onClose, onSaved }: { year: MatricYear | null; onClose: () => void; onSaved: () => void }) {
  const [state, formAction] = useFormState(saveYearAction, INITIAL);
  const [active, setActive] = useState(year?.is_active ?? true);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(year ? "Year updated" : "Year added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, year, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={year ? "Edit year" : "Add exam year"} size="sm">
      <form action={formAction} className="space-y-4">
        {year && <input type="hidden" name="id" value={year.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Year" hint="The Ethiopian calendar year, e.g. 2016." required>
          {({ id }) => <TextInput id={id} name="year" type="number" min={1990} max={2100} defaultValue={year?.year ?? 2016} required />}
        </Field>

        <Field label="Label" hint="What students see." required>
          {({ id }) => <TextInput id={id} name="label" defaultValue={year?.label ?? ""} placeholder="2016 E.C." required />}
        </Field>

        <Field label="Description">
          {({ id }) => <TextInput id={id} name="description" defaultValue={year?.description ?? ""} />}
        </Field>

        <Field label="Order">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={year?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Available to students" />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}

function QuestionEditor({
  question, years, subjects, onClose, onSaved,
}: {
  question: AdminMatricQuestion | null;
  years: MatricYear[];
  subjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveQuestionAction, INITIAL);
  const [published, setPublished] = useState(question?.is_published ?? false);
  const [options, setOptions] = useState<OptionDraft[]>(
    question?.matric_question_options.length
      ? question.matric_question_options.map((o) => ({
          label: o.label,
          bodyHtml: o.body_html,
          isCorrect: o.is_correct,
        }))
      : [
          { label: "A", bodyHtml: "", isCorrect: true },
          { label: "B", bodyHtml: "", isCorrect: false },
          { label: "C", bodyHtml: "", isCorrect: false },
          { label: "D", bodyHtml: "", isCorrect: false },
        ]
  );
  const toast = useToast();

  useEffect(() => {
    if (state.ok) { toast.success(question ? "Question updated" : "Question added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, question, onSaved, toast]);

  // Exactly one correct answer, enforced by making the choice a radio group:
  // selecting one necessarily clears the others, so the invalid state the
  // database rejects cannot be constructed here in the first place.
  function markCorrect(index: number) {
    setOptions((current) => current.map((o, i) => ({ ...o, isCorrect: i === index })));
  }

  function updateOption(index: number, body: string) {
    setOptions((current) => current.map((o, i) => (i === index ? { ...o, bodyHtml: body } : o)));
  }

  function addOption() {
    if (options.length >= 8) return;
    setOptions((current) => [...current, { label: LABELS[current.length], bodyHtml: "", isCorrect: false }]);
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions((current) =>
      current
        .filter((_, i) => i !== index)
        // Relabel so the letters stay contiguous after a removal.
        .map((o, i) => ({ ...o, label: LABELS[i] }))
    );
  }

  const hasCorrect = options.some((o) => o.isCorrect);

  return (
    <Modal
      open
      onClose={onClose}
      title={question ? "Edit question" : "Add question"}
      description="Students never receive the correct answer with the question — it is stripped server-side."
      size="lg"
    >
      <form action={formAction} className="space-y-5">
        {question && <input type="hidden" name="id" value={question.id} />}
        <input type="hidden" name="isPublished" value={published ? "on" : "off"} />
        <input type="hidden" name="options" value={JSON.stringify(options)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam year" required>
            {({ id }) => (
              <Select id={id} name="yearId" defaultValue={question?.year_id ?? years[0]?.id}>
                {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Subject" required>
            {({ id }) => (
              <Select id={id} name="subjectId" defaultValue={question?.subject_id ?? subjects[0]?.id}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Question" hint="HTML is allowed. Scripts and styles are stripped before saving." required>
          {({ id }) => (
            <TextArea
              id={id}
              name="questionHtml"
              defaultValue={question?.question_html ?? ""}
              placeholder="<p>Which of the following is a noble gas?</p>"
              className="min-h-[110px] font-mono text-xs"
              required
            />
          )}
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">
              Options <span className="font-normal text-text-secondary">— select the correct one</span>
            </p>
            <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} disabled={options.length >= 8} onClick={addOption}>
              Add option
            </Button>
          </div>

          <div className="space-y-2">
            {options.map((option, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 rounded-xl border p-2.5 transition-colors ${
                  option.isCorrect ? "border-emerald-500 bg-emerald-500/8" : "border-kl-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => markCorrect(index)}
                  role="radio"
                  aria-checked={option.isCorrect}
                  aria-label={`Mark option ${option.label} as correct`}
                  className={`kl-press mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors ${
                    option.isCorrect ? "bg-emerald-500 text-white" : "bg-[var(--surface-elevated)] text-text-secondary"
                  }`}
                >
                  {option.isCorrect ? <Check size={15} aria-hidden /> : option.label}
                </button>

                <TextArea
                  value={option.bodyHtml}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${option.label}`}
                  aria-label={`Option ${option.label} text`}
                  className="min-h-[44px] flex-1 text-sm"
                />

                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= 2}
                  aria-label={`Remove option ${option.label}`}
                  className="kl-press mt-0.5 rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          {!hasCorrect && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-500">
              Mark one option as the correct answer.
            </p>
          )}
        </div>

        <Field label="Explanation" hint="Shown to the student after they answer. Strongly recommended.">
          {({ id }) => (
            <TextArea
              id={id}
              name="explanationHtml"
              defaultValue={question?.explanation_html ?? ""}
              placeholder="<p>Noble gases have a full outer shell…</p>"
              className="min-h-[80px] font-mono text-xs"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Difficulty">
            {({ id }) => (
              <Select id={id} name="difficulty" defaultValue={question?.difficulty ?? "medium"}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            )}
          </Field>
          <Field label="Marks">
            {({ id }) => <TextInput id={id} name="marks" type="number" min={1} max={20} defaultValue={question?.marks ?? 1} />}
          </Field>
          <Field label="Access" hint="Free questions are a taster for students without the package.">
            {({ id }) => (
              <Select id={id} name="accessTier" defaultValue={question?.access_tier ?? "matric"}>
                <option value="matric">Matric Package</option>
                <option value="free">Free</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="rounded-xl border border-kl-border p-4">
          <Toggle
            checked={published}
            onChange={setPublished}
            label="Publish"
            description="A question can only be published when it has at least two options and exactly one correct answer."
          />
        </div>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-kl-border bg-surface px-4 pb-1 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton disabled={!hasCorrect} />
        </div>
      </form>
    </Modal>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={disabled} icon={<Save size={16} />}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
