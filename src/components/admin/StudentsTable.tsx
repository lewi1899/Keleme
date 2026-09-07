"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban, CheckCircle2, Crown, Flame, GraduationCap, Search, ShieldCheck, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTable } from "@/components/admin/AdminPage";
import { useToast } from "@/components/ui/Toast";
import {
  grantEntitlementAction, setSuspensionAction,
} from "@/app/admin/students/actions";
import { formatDate, formatDuration } from "@/lib/format";
import type { StudentRow } from "@/app/admin/students/page";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "premium", label: "Premium" },
  { id: "matric", label: "Matric" },
  { id: "free", label: "Free" },
  { id: "streaking", label: "On a streak" },
  { id: "suspended", label: "Suspended" },
];

export function StudentsTable({
  rows,
  total,
  page,
  pageSize,
  filters,
}: {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: { q: string; grade: string; filter: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [granting, setGranting] = useState<StudentRow | null>(null);
  const [suspending, setSuspending] = useState<StudentRow | null>(null);
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.push(`/admin/students?${next.toString()}`);
  }

  function toggleSuspension(student: StudentRow, reason?: string) {
    startTransition(async () => {
      const result = await setSuspensionAction(student.id, !student.is_suspended, reason);
      if (result.error) toast.error("Could not update", result.error);
      else {
        toast.success(student.is_suspended ? "Account restored" : "Account suspended", student.full_name);
        setSuspending(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <form
            className="relative min-w-[220px] flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              setParam("q", ((new FormData(e.currentTarget).get("q") as string) ?? "").trim());
            }}
          >
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden />
            <TextInput
              name="q"
              defaultValue={filters.q}
              placeholder="Search by name, email, phone or school…"
              className="pl-9"
              aria-label="Search students"
            />
          </form>

          <Select value={filters.grade} onChange={(e) => setParam("grade", e.target.value)} aria-label="Filter by grade" className="w-auto">
            <option value="">All grades</option>
            {[9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setParam("filter", f.id)}
              className={`kl-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filters.filter === f.id
                  ? "border-accent bg-accent text-[var(--accent-contrast)]"
                  : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No students match"
          description="Try clearing the search or filters."
        />
      ) : (
        <>
          <AdminTable headers={["Student", "Grade", "School", "Access", "Streak", "Time", "Joined", ""]}>
            {rows.map((student) => (
              <tr key={student.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
                <td className="max-w-[220px] px-4 py-3">
                  <p className="truncate font-medium text-text-primary">
                    {student.full_name}
                    {student.is_suspended && (
                      <Badge tone="danger" className="ml-2">Suspended</Badge>
                    )}
                  </p>
                  {/* Contact details are shown to admins because supporting a
                      student requires reaching them. RLS makes this row
                      unreadable to everyone else. */}
                  <p className="truncate text-xs text-text-secondary">{student.email}</p>
                  <p className="truncate text-xs text-text-secondary">{student.phone}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{student.grade}</td>
                <td className="max-w-[160px] truncate px-4 py-3 text-text-secondary">
                  {student.school_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {student.is_premium && <Badge tone="premium" icon={<Crown size={10} />}>Premium</Badge>}
                    {student.is_matric && <Badge tone="matric" icon={<GraduationCap size={10} />}>Matric</Badge>}
                    {!student.is_premium && !student.is_matric && <Badge tone="neutral">Free</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Flame size={12} className={student.current_streak > 0 ? "text-orange-500" : ""} aria-hidden />
                    {student.current_streak}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                  {formatDuration(student.total_seconds)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                  {formatDate(student.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setGranting(student)}
                      title="Grant access"
                      aria-label={`Grant access to ${student.full_name}`}
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                    >
                      <ShieldCheck size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => (student.is_suspended ? toggleSuspension(student) : setSuspending(student))}
                      disabled={pending}
                      title={student.is_suspended ? "Restore account" : "Suspend account"}
                      aria-label={`${student.is_suspended ? "Restore" : "Suspend"} ${student.full_name}`}
                      className={`kl-press rounded-lg p-1.5 ${
                        student.is_suspended
                          ? "text-emerald-600 hover:bg-emerald-500/10"
                          : "text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                      }`}
                    >
                      {student.is_suspended ? <CheckCircle2 size={15} aria-hidden /> : <Ban size={15} aria-hidden />}
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
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setParam("page", String(page + 1))}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <GrantModal student={granting} onClose={() => setGranting(null)} onDone={() => { setGranting(null); router.refresh(); }} />

      <Modal
        open={suspending !== null}
        onClose={() => setSuspending(null)}
        title="Suspend this account?"
        size="sm"
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">{suspending?.full_name}</span> will be
          signed out immediately on every device and will not be able to open any content until you
          restore the account.
        </p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = (new FormData(e.currentTarget).get("reason") as string) || undefined;
            if (suspending) toggleSuspension(suspending, reason);
          }}
        >
          <Field label="Reason" hint="Recorded in the audit log.">
            {({ id }) => <TextInput id={id} name="reason" placeholder="e.g. shared account" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSuspending(null)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={pending} icon={<Ban size={15} />}>
              Suspend
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Manual entitlement grant.
 *
 * The presets exist because "give this student a month" is the overwhelmingly
 * common case — usually after confirming a payment by phone — and typing 30
 * every time invites typos that hand out ten years of Premium.
 */
function GrantModal({
  student,
  onClose,
  onDone,
}: {
  student: StudentRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"premium" | "matric">("premium");
  const [days, setDays] = useState(30);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (!student) return null;

  function grant(note: string) {
    if (!student) return;
    startTransition(async () => {
      const result = await grantEntitlementAction(student.id, kind, days, note);
      if (result.error) toast.error("Could not grant access", result.error);
      else {
        toast.success("Access granted", `${student.full_name} — ${days} days of ${kind}`);
        onDone();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Grant access" description={student.full_name}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          grant((new FormData(e.currentTarget).get("note") as string) ?? "");
        }}
      >
        <Field label="What are you granting?">
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as "premium" | "matric")}>
              <option value="premium">KELEME Premium</option>
              <option value="matric" disabled={student.grade !== 12}>
                Matric Package{student.grade !== 12 ? " (Grade 12 only)" : ""}
              </option>
            </Select>
          )}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-primary">For how long?</p>
          <div className="flex flex-wrap gap-1.5">
            {[30, 90, 180, 365].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDays(preset)}
                className={`kl-press rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  days === preset
                    ? "border-accent bg-accent text-[var(--accent-contrast)]"
                    : "border-kl-border text-text-secondary hover:bg-accent-soft"
                }`}
              >
                {preset === 365 ? "1 year" : `${preset} days`}
              </button>
            ))}
          </div>
          <TextInput
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-2"
            aria-label="Days"
          />
        </div>

        <Field label="Note" hint="Why — recorded in the audit log.">
          {({ id }) => <TextInput id={id} name="note" placeholder="Paid by telebirr, ref 12345" />}
        </Field>

        <p className="rounded-xl bg-[var(--surface-elevated)] p-3 text-xs leading-relaxed text-text-secondary">
          If the student already has time left, this is added to the end of it — nothing is lost.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending} icon={<ShieldCheck size={15} />}>Grant access</Button>
        </div>
      </form>
    </Modal>
  );
}
