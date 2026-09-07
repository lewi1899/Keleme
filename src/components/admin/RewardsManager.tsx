"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Calculator, Check, Gift, Pencil, Plus, Save, Send, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTable } from "@/components/admin/AdminPage";
import { useToast } from "@/components/ui/Toast";
import {
  computeWeekAction, markWinnerClaimedAction, publishWeekAction, saveRewardAction,
  setSlotRewardAction, type RewardActionState,
} from "@/app/admin/rewards/actions";
import { formatBirr, formatDate, formatDuration, ordinal } from "@/lib/format";
import type { RewardCatalogItem, WeeklyRewardRun } from "@/lib/database.types";
import type { WinnerRow } from "@/app/admin/rewards/page";

const INITIAL: RewardActionState = {};

const REWARD_TYPES = [
  { id: "premium_days", label: "Days of Premium" },
  { id: "matric_days", label: "Days of Matric Package" },
  { id: "prize", label: "Physical prize" },
  { id: "airtime", label: "Airtime" },
  { id: "cash", label: "Cash" },
];

export function RewardsManager({
  catalog, slots, runs, selectedRun, winners,
}: {
  catalog: RewardCatalogItem[];
  slots: { rank: number; reward_id: string; is_active: boolean }[];
  runs: WeeklyRewardRun[];
  selectedRun: string | null;
  winners: WinnerRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<RewardCatalogItem | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = runs.find((r) => r.id === selectedRun);

  function computeWeek() {
    startTransition(async () => {
      const result = await computeWeekAction();
      if (result.error) toast.error("Could not calculate", result.error);
      else { toast.success("Week calculated", "Review the ranking, then publish to award the prizes."); router.refresh(); }
    });
  }

  function publish() {
    if (!run) return;
    startTransition(async () => {
      const result = await publishWeekAction(run.id);
      if (result.error) toast.error("Could not publish", result.error);
      else { toast.success("Prizes awarded", "Subscription prizes are already on the winners' accounts."); router.refresh(); }
    });
  }

  function setSlot(rank: number, rewardId: string) {
    startTransition(async () => {
      const result = await setSlotRewardAction(rank, rewardId);
      if (result.error) toast.error("Could not assign", result.error);
      else { toast.success(`${ordinal(rank)} place prize updated`); router.refresh(); }
    });
  }

  function markClaimed(winner: WinnerRow) {
    startTransition(async () => {
      const result = await markWinnerClaimedAction(winner.id);
      if (result.error) toast.error("Could not update", result.error);
      else { toast.success("Marked as claimed"); router.refresh(); }
    });
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ weeks */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <Trophy size={17} className="text-amber-500" aria-hidden />
            Weekly winners
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={pending} icon={<Calculator size={15} />} onClick={computeWeek}>
              Calculate last week
            </Button>
            {run && !run.published && winners.length > 0 && (
              <Button loading={pending} icon={<Send size={15} />} onClick={publish}>
                Publish and award
              </Button>
            )}
          </div>
        </div>

        {runs.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {runs.map((r) => (
              <a
                key={r.id}
                href={`/admin/rewards?run=${r.id}`}
                className={`kl-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  r.id === selectedRun
                    ? "border-accent bg-accent text-[var(--accent-contrast)]"
                    : "border-kl-border text-text-secondary hover:bg-accent-soft"
                }`}
              >
                {formatDate(r.week_start)}
                {!r.published && " · draft"}
              </a>
            ))}
          </div>
        )}

        {!run ? (
          <EmptyState
            icon={<Trophy size={20} />}
            title="No weeks calculated yet"
            description="Calculate last week to produce a ranking. Nothing is awarded until you review it and publish."
            action={<Button loading={pending} icon={<Calculator size={16} />} onClick={computeWeek}>Calculate last week</Button>}
          />
        ) : (
          <>
            <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-text-primary">
                  Week of {formatDate(run.week_start)} – {formatDate(run.week_end)}
                </p>
                <p className="text-xs text-text-secondary">
                  Calculated {formatDate(run.computed_at)} · {winners.length} winner{winners.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge tone={run.published ? "success" : "warning"}>
                {run.published ? "Published" : "Draft — not yet awarded"}
              </Badge>
            </Card>

            {winners.length === 0 ? (
              <EmptyState compact icon={<Trophy size={18} />} title="Nobody studied this week" description="No prizes to award." />
            ) : (
              <AdminTable headers={["Rank", "Student", "School", "Time", "Prize", "Status", ""]}>
                {winners.map((winner) => (
                  <tr key={winner.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="kl-display font-bold text-text-primary">{ordinal(winner.rank)}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="truncate font-medium text-text-primary">{winner.profiles?.full_name ?? "Unknown"}</p>
                      {/* Contact details so a physical prize can actually be
                          delivered — admins only, never exposed publicly. */}
                      <p className="truncate text-xs text-text-secondary">{winner.profiles?.phone}</p>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-text-secondary">
                      {winner.profiles?.school_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDuration(winner.seconds)}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-text-secondary">
                      {winner.reward_catalog?.name ?? "No prize assigned"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={winner.status === "claimed" ? "success" : winner.status === "awarded" ? "accent" : "neutral"}>
                        {winner.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {run.published && winner.status !== "claimed" && winner.reward_catalog?.reward_type !== "premium_days" && (
                        <Button size="sm" variant="secondary" disabled={pending} icon={<Check size={14} />} onClick={() => markClaimed(winner)}>
                          Mark handed over
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </>
        )}
      </section>

      {/* ----------------------------------------------------------- slots */}
      <section>
        <h2 className="kl-display text-lg font-bold text-text-primary">Prize for each place</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Which prize each finishing position receives. Leave a place empty to award nothing there.
        </p>

        {catalog.length === 0 ? (
          <EmptyState compact icon={<Gift size={18} />} title="Create a prize first" description="Add a prize below, then assign it to a place." />
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((rank) => {
              const slot = slots.find((s) => s.rank === rank);
              return (
                <Card key={rank} className="p-3">
                  <p className="kl-display text-sm font-bold text-text-primary">{ordinal(rank)} place</p>
                  <Select
                    className="mt-2 text-xs"
                    value={slot?.reward_id ?? ""}
                    onChange={(e) => e.target.value && setSlot(rank, e.target.value)}
                    aria-label={`Prize for ${ordinal(rank)} place`}
                  >
                    <option value="">No prize</option>
                    {catalog.filter((c) => c.is_active).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- catalog */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
            <Gift size={17} className="text-accent" aria-hidden />
            Prizes
          </h2>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditing("new")}>Add prize</Button>
        </div>

        {catalog.length === 0 ? (
          <EmptyState compact icon={<Gift size={18} />} title="No prizes defined" description="Add one to start rewarding the weekly top ten." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((item) => (
              <Card key={item.id} className={`p-4 ${item.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-text-primary">{item.name}</p>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    aria-label={`Edit ${item.name}`}
                    className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-accent-soft hover:text-text-primary"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {REWARD_TYPES.find((t) => t.id === item.reward_type)?.label}
                  {item.reward_days ? ` · ${item.reward_days} days` : ""}
                  {item.value_birr ? ` · worth ${formatBirr(item.value_birr)}` : ""}
                </p>
                {item.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary">{item.description}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {editing !== null && (
        <RewardEditor
          reward={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function RewardEditor({
  reward, onClose, onSaved,
}: {
  reward: RewardCatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(saveRewardAction, INITIAL);
  const [type, setType] = useState(reward?.reward_type ?? "premium_days");
  const [active, setActive] = useState(reward?.is_active ?? true);
  const toast = useToast();

  const needsDays = type === "premium_days" || type === "matric_days";

  useEffect(() => {
    if (state.ok) { toast.success(reward ? "Prize updated" : "Prize added"); onSaved(); }
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, reward, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={reward ? "Edit prize" : "Add prize"} size="sm">
      <form action={formAction} className="space-y-4">
        {reward && <input type="hidden" name="id" value={reward.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />

        <Field label="Prize name" required>
          {({ id }) => <TextInput id={id} name="name" defaultValue={reward?.name ?? ""} placeholder="Champion — 1 month premium" required />}
        </Field>

        <Field label="Type" hint="Subscription prizes are awarded automatically when you publish a week. Everything else is handed over by you.">
          {({ id }) => (
            <Select id={id} name="rewardType" value={type} onChange={(e) => setType(e.target.value as RewardCatalogItem["reward_type"])}>
              {REWARD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          )}
        </Field>

        {needsDays && (
          <Field label="Days" required>
            {({ id }) => <TextInput id={id} name="rewardDays" type="number" min={1} max={3650} defaultValue={reward?.reward_days ?? 30} required />}
          </Field>
        )}

        <Field label="Approximate value (Birr)" hint="For your own reporting. Not shown to students.">
          {({ id }) => <TextInput id={id} name="valueBirr" type="number" min={0} step="0.01" defaultValue={reward?.value_birr ?? ""} />}
        </Field>

        <Field label="Description">
          {({ id }) => <TextArea id={id} name="description" defaultValue={reward?.description ?? ""} />}
        </Field>

        <Field label="Order">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} defaultValue={reward?.sort_order ?? 0} />}
        </Field>

        <Toggle checked={active} onChange={setActive} label="Available to assign" />

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
