"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Check, FileText, Link2, PlayCircle, Save, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveContentAction, type ContentActionState } from "@/app/admin/content/actions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { extractYouTubeId } from "@/lib/validation";
import type { AccessTier, ContentItem, ContentType, Subject, Unit } from "@/lib/database.types";

const INITIAL: ContentActionState = {};

const TYPES: { id: ContentType; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "html", label: "Study note", hint: "Written online, cannot be downloaded", icon: <FileText size={18} /> },
  { id: "pdf", label: "Textbook", hint: "PDF file students can download", icon: <Upload size={18} /> },
  { id: "youtube", label: "Video", hint: "A YouTube link", icon: <PlayCircle size={18} /> },
  { id: "other", label: "Link", hint: "Anything hosted elsewhere", icon: <Link2 size={18} /> },
];

const MAX_PDF_BYTES = 100 * 1024 * 1024;

/**
 * The content upload flow (spec section 25).
 *
 * Ordered the way the admin thinks about it — what kind of thing is this, what
 * is it, where does it belong, who can see it — with the Free/Premium choice
 * given its own prominent control rather than being a checkbox lost among ten
 * others. Getting that field wrong is the single most consequential mistake
 * available on this screen: it either gives away paid content or hides free
 * content behind a paywall.
 *
 * PDFs upload straight from the browser to Supabase Storage using the admin's
 * own session, so a 90MB textbook never passes through the Next.js server.
 */
export function ContentEditor({
  item,
  subjects,
  unitsBySubject,
  onClose,
  onSaved,
}: {
  item: ContentItem | null;
  subjects: Subject[];
  unitsBySubject: Map<string, Unit[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveContentAction, INITIAL);
  const toast = useToast();

  const [contentType, setContentType] = useState<ContentType>(item?.content_type ?? "html");
  const [accessTier, setAccessTier] = useState<AccessTier>(item?.access_tier ?? "free");
  const [grade, setGrade] = useState<string>(String(item?.grade ?? 9));
  const [subjectId, setSubjectId] = useState(item?.subject_id ?? "");
  const [unitId, setUnitId] = useState(item?.unit_id ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(item?.youtube_url ?? "");
  const [storagePath, setStoragePath] = useState(item?.storage_path ?? "");
  const [uploadName, setUploadName] = useState<string | null>(item?.storage_path?.split("/").pop() ?? null);
  const [uploading, setUploading] = useState(false);
  const [published, setPublished] = useState(item?.is_published ?? false);
  const [bodyHtml, setBodyHtml] = useState("");
  const [loadingBody, setLoadingBody] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch the existing body only when editing an HTML item — no reason to pull
  // a long note down for a video edit.
  useEffect(() => {
    if (!item || item.content_type !== "html") return;
    setLoadingBody(true);
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("content_html_bodies")
        .select("body_html")
        .eq("content_id", item.id)
        .maybeSingle();
      setBodyHtml((data?.body_html as string) ?? "");
      setLoadingBody(false);
    })();
  }, [item]);

  useEffect(() => {
    if (state.ok) {
      toast.success(item ? "Content updated" : "Content added");
      onSaved();
    } else if (state.error) {
      toast.error("Could not save", state.error);
    }
    // `state` is the whole result object; re-running on a new one is the point.
  }, [state, item, onSaved, toast]);

  const gradeSubjects = useMemo(
    () => subjects.filter((s) => String(s.grade) === grade),
    [subjects, grade]
  );
  const units = subjectId ? unitsBySubject.get(subjectId) ?? [] : [];
  const videoId = contentType === "youtube" ? extractYouTubeId(youtubeUrl) : null;

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("That is not a PDF", "Textbooks must be PDF files.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("That file is too large", "The limit is 100 MB.");
      return;
    }

    setUploading(true);
    const supabase = createClient();

    // Path is generated, never taken from the file name: a name like
    // "../../secret.pdf" must not be able to influence the storage key.
    const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-60);
    const path = `grade-${grade}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from("content-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: false });

    setUploading(false);

    if (error) {
      toast.error("Upload failed", error.message.includes("policy")
        ? "You do not have permission to upload files."
        : "Check your connection and try again.");
      return;
    }

    setStoragePath(path);
    setUploadName(file.name);
    toast.success("File uploaded", file.name);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit content" : "Add content"}
      description={item ? item.title : "Students see it in their grade as soon as you publish."}
      size="lg"
    >
      <form id="content-form" action={formAction} className="space-y-6">
        {item && <input type="hidden" name="contentId" value={item.id} />}
        <input type="hidden" name="contentType" value={contentType} />
        <input type="hidden" name="accessTier" value={accessTier} />
        <input type="hidden" name="storagePath" value={storagePath} />
        <input type="hidden" name="isPublished" value={published ? "on" : "off"} />

        {/* 1 — what kind of thing */}
        <section>
          <p className="mb-2 text-sm font-semibold text-text-primary">1. What are you adding?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((type) => {
              const active = contentType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setContentType(type.id)}
                  className={`kl-press flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-accent bg-accent-soft" : "border-kl-border hover:border-accent"
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${active ? "text-accent" : "text-text-secondary"}`}>
                    {type.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text-primary">{type.label}</span>
                    <span className="block text-xs text-text-secondary">{type.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2 — the payload */}
        <section className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">2. The content</p>

          <Field label="Title" required>
            {({ id, invalid }) => (
              <TextInput id={id} name="title" defaultValue={item?.title ?? ""} placeholder="Unit 3 — Chemical Bonding" required invalid={invalid} />
            )}
          </Field>

          <Field label="Short description" hint="Shown under the title in lists.">
            {({ id }) => (
              <TextInput id={id} name="description" defaultValue={item?.description ?? ""} placeholder="Covers ionic, covalent and metallic bonding" maxLength={2000} />
            )}
          </Field>

          {contentType === "html" && (
            <Field
              label="Note content (HTML)"
              hint="Paste HTML from your editor. Scripts, styles and event handlers are stripped automatically before saving. Students read this online — there is no download."
              required
            >
              {({ id }) => (
                <TextArea
                  id={id}
                  name="bodyHtml"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder={loadingBody ? "Loading…" : "<h2>Chemical bonding</h2><p>…</p>"}
                  disabled={loadingBody}
                  className="min-h-[220px] font-mono text-xs"
                />
              )}
            </Field>
          )}

          {contentType === "pdf" && (
            <div>
              <p className="mb-1.5 block text-sm font-medium text-text-primary">PDF file <span className="text-red-500">*</span></p>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPdf(file);
                }}
              />

              {storagePath ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-3">
                  <Check size={16} className="shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{uploadName}</span>
                  <button
                    type="button"
                    onClick={() => { setStoragePath(""); setUploadName(null); }}
                    aria-label="Remove file"
                    className="kl-press rounded-lg p-1 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  loading={uploading}
                  icon={<Upload size={16} />}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Choose a PDF (up to 100 MB)"}
                </Button>
              )}
              <p className="mt-1.5 text-xs text-text-secondary">
                Stored privately. Students get a short-lived download link only if their plan allows it.
              </p>
            </div>
          )}

          {contentType === "youtube" && (
            <Field
              label="YouTube link"
              hint={videoId ? `Video id: ${videoId}` : "Paste any YouTube link — watch, share, embed or shorts."}
              required
            >
              {({ id }) => (
                <TextInput
                  id={id}
                  name="youtubeUrl"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  invalid={Boolean(youtubeUrl) && !videoId}
                />
              )}
            </Field>
          )}

          {contentType === "other" && (
            <Field label="Link" required>
              {({ id }) => (
                <TextInput id={id} name="externalUrl" type="url" defaultValue={item?.external_url ?? ""} placeholder="https://…" />
              )}
            </Field>
          )}
        </section>

        {/* 3 — where it belongs */}
        <section className="space-y-4">
          <p className="text-sm font-semibold text-text-primary">3. Where does it belong?</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Grade" required>
              {({ id }) => (
                <Select
                  id={id}
                  name="grade"
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    // The old subject belongs to the old grade, so clear both.
                    setSubjectId("");
                    setUnitId("");
                  }}
                >
                  {[9, 10, 11, 12].map((g) => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Subject">
              {({ id }) => (
                <Select
                  id={id}
                  name="subjectId"
                  value={subjectId}
                  onChange={(e) => { setSubjectId(e.target.value); setUnitId(""); }}
                >
                  <option value="">No subject</option>
                  {gradeSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Unit">
              {({ id }) => (
                <Select id={id} name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!subjectId}>
                  <option value="">No unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.title}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Tags" hint="Comma separated. Optional.">
            {({ id }) => (
              <TextInput id={id} name="tags" defaultValue={item?.tags?.join(", ") ?? ""} placeholder="revision, exam, formulas" />
            )}
          </Field>
        </section>

        {/* 4 — access. Given its own visual weight on purpose. */}
        <section>
          <p className="mb-2 text-sm font-semibold text-text-primary">4. Who can open this?</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <TierChoice
              active={accessTier === "free"}
              onClick={() => setAccessTier("free")}
              title="Free"
              body="Any student in this grade, no subscription needed."
              tone="emerald"
            />
            <TierChoice
              active={accessTier === "premium"}
              onClick={() => setAccessTier("premium")}
              title="Premium"
              body="Requires KELEME Premium."
              tone="amber"
            />
            <TierChoice
              active={accessTier === "matric"}
              onClick={() => setAccessTier("matric")}
              title="Matric package"
              body="Requires the separate Matric Package."
              tone="violet"
            />
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            You can change this at any time — students gain or lose access immediately.
          </p>
        </section>

        {/* 5 — publish */}
        <section className="rounded-xl border border-kl-border p-4">
          <Toggle
            checked={published}
            onChange={setPublished}
            label="Publish now"
            description="Unpublished content is visible only to you and other staff."
          />
        </section>

        {/* The actions live inside the form rather than in the modal footer:
            useFormStatus only reports on an ancestor form, so a footer button
            would never show its pending state. */}
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-kl-border bg-surface px-4 pb-1 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <SubmitButton disabled={uploading} />
        </div>
      </form>
    </Modal>
  );
}

function TierChoice({
  active, onClick, title, body, tone,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
  tone: "emerald" | "amber" | "violet";
}) {
  const accent =
    tone === "emerald"
      ? "border-emerald-500 bg-emerald-500/10"
      : tone === "amber"
      ? "border-amber-500 bg-amber-500/10"
      : "border-violet-500 bg-violet-500/10";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`kl-press rounded-xl border p-3 text-left transition-colors ${
        active ? accent : "border-kl-border hover:border-accent"
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="text-sm font-bold text-text-primary">{title}</span>
        {active && <Check size={15} className="text-text-primary" aria-hidden />}
      </span>
      <span className="mt-1 block text-xs leading-snug text-text-secondary">{body}</span>
    </button>
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
