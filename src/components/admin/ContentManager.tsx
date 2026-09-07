"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye, EyeOff, FileText, Filter, Pencil, Plus, Search, Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTable } from "@/components/admin/AdminPage";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { useToast } from "@/components/ui/Toast";
import { deleteContentAction, togglePublishAction } from "@/app/admin/content/actions";
import { ContentTypeIcon, contentTypeLabel } from "@/components/content/ContentRow";
import { formatDate } from "@/lib/format";
import type { ContentItem, Subject, Unit } from "@/lib/database.types";

type Row = ContentItem & { subjects: { name: string } | null };

export function ContentManager({
  items,
  subjects,
  units,
  total,
  page,
  pageSize,
  filters,
}: {
  items: Row[];
  subjects: Subject[];
  units: Unit[];
  total: number;
  page: number;
  pageSize: number;
  filters: { grade: string; type: string; tier: string; q: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page number.
    next.delete("page");
    router.push(`/admin/content?${next.toString()}`);
  }

  function togglePublish(item: Row) {
    startTransition(async () => {
      const result = await togglePublishAction(item.id, !item.is_published);
      if (result.error) toast.error("Could not update", result.error);
      else {
        toast.success(item.is_published ? "Unpublished" : "Published", item.title);
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const item = deleting;
    startTransition(async () => {
      const result = await deleteContentAction(item.id);
      if (result.error) toast.error("Could not delete", result.error);
      else {
        toast.success("Deleted", item.title);
        setDeleting(null);
        router.refresh();
      }
    });
  }

  const unitsBySubject = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const unit of units) {
      const bucket = map.get(unit.subject_id);
      if (bucket) bucket.push(unit);
      else map.set(unit.subject_id, [unit]);
    }
    return map;
  }, [units]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("q") as string;
            setFilter("q", value?.trim() ?? "");
          }}
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden />
          <TextInput name="q" defaultValue={filters.q} placeholder="Search titles…" className="pl-9" aria-label="Search content" />
        </form>

        <Select value={filters.grade} onChange={(e) => setFilter("grade", e.target.value)} aria-label="Filter by grade" className="w-auto">
          <option value="">All grades</option>
          {[9, 10, 11, 12].map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </Select>

        <Select value={filters.type} onChange={(e) => setFilter("type", e.target.value)} aria-label="Filter by type" className="w-auto">
          <option value="">All types</option>
          <option value="html">Notes</option>
          <option value="pdf">Textbooks</option>
          <option value="youtube">Videos</option>
          <option value="other">Links</option>
        </Select>

        <Select value={filters.tier} onChange={(e) => setFilter("tier", e.target.value)} aria-label="Filter by access" className="w-auto">
          <option value="">Free and Premium</option>
          <option value="free">Free only</option>
          <option value="premium">Premium only</option>
          <option value="matric">Matric only</option>
        </Select>

        <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>
          Add content
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText size={20} />}
          title={filters.q || filters.grade || filters.type ? "Nothing matches those filters" : "No content yet"}
          description={
            filters.q || filters.grade || filters.type
              ? "Try clearing a filter."
              : "Add your first study note, textbook or video. Students see it as soon as you publish."
          }
          action={<Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>Add content</Button>}
        />
      ) : (
        <>
          <AdminTable headers={["Title", "Type", "Grade", "Subject", "Access", "Status", "Updated", ""]}>
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
                <td className="max-w-[240px] px-4 py-3">
                  <p className="truncate font-medium text-text-primary">{item.title}</p>
                  {item.description && (
                    <p className="truncate text-xs text-text-secondary">{item.description}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-text-secondary">
                    <ContentTypeIcon type={item.content_type} size={14} />
                    {contentTypeLabel(item.content_type)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">Grade {item.grade}</td>
                <td className="max-w-[140px] truncate px-4 py-3 text-text-secondary">
                  {item.subjects?.name ?? "—"}
                </td>
                <td className="px-4 py-3"><TierBadge tier={item.access_tier} /></td>
                <td className="px-4 py-3">
                  <Badge tone={item.is_published ? "success" : "neutral"}>
                    {item.is_published ? "Published" : "Draft"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                  {formatDate(item.updated_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => togglePublish(item)}
                      disabled={pending}
                      title={item.is_published ? "Unpublish" : "Publish"}
                      aria-label={item.is_published ? `Unpublish ${item.title}` : `Publish ${item.title}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      {item.is_published ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      title="Edit"
                      aria-label={`Edit ${item.title}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(item)}
                      title="Delete"
                      aria-label={`Delete ${item.title}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setFilter("page", String(page - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setFilter("page", String(page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {editing !== null && (
        <ContentEditor
          item={editing === "new" ? null : editing}
          subjects={subjects}
          unitsBySubject={unitsBySubject}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this content?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={pending} icon={<Trash2 size={15} />} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">{deleting?.title}</span> will be removed
          for every student, along with its file if it has one. This cannot be undone.
        </p>
        <p className="mt-3 text-sm text-text-secondary">
          If you only want to hide it for now, unpublish it instead.
        </p>
      </Modal>
    </>
  );
}
