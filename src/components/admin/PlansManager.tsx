"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { useTransition } from "react";
import { Crown, GraduationCap, Pencil, Plus, Power, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextArea, TextInput, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { savePlanAction, togglePlanAction, type PlanActionState } from "@/app/admin/plans/actions";
import { formatBirr } from "@/lib/format";
import type { AdLevel, Plan, PlanKind } from "@/lib/database.types";

const INITIAL: PlanActionState = {};

const AD_LEVELS: { id: AdLevel; label: string }[] = [
  { id: "none", label: "No ads" },
  { id: "low", label: "Very few ads" },
  { id: "medium", label: "Fewer ads" },
  { id: "high", label: "Standard ads" },
];

export function PlansManager({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const groups: { kind: PlanKind; title: string; icon: React.ReactNode; blurb: string }[] = [
    {
      kind: "standard",
      title: "KELEME Premium",
      icon: <Crown size={16} className="text-amber-500" />,
      blurb: "Premium notes, textbooks and videos for the student's grade.",
    },
    {
      kind: "matric",
      title: "Matric Package",
      icon: <GraduationCap size={16} className="text-violet-600" />,
      blurb: "Past matric and model papers. Sold separately, Grade 12 only.",
    },
  ];

  function toggle(plan: Plan) {
    startTransition(async () => {
      const result = await togglePlanAction(plan.id, !plan.is_active);
      if (result.error) toast.error("Could not update", result.error);
      else {
        toast.success(plan.is_active ? "Plan deactivated" : "Plan activated", plan.name);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>
          New plan
        </Button>
      </div>

      <div className="space-y-8">
        {groups.map((group) => {
          const groupPlans = plans.filter((p) => p.kind === group.kind);
          return (
            <section key={group.kind}>
              <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
                {group.icon}
                {group.title}
              </h2>
              <p className="mt-0.5 text-sm text-text-secondary">{group.blurb}</p>

              {groupPlans.length === 0 ? (
                <Card className="mt-3 p-5">
                  <p className="text-sm text-text-secondary">No plans yet for this product.</p>
                </Card>
              ) : (
                <div className="kl-stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {groupPlans.map((plan, i) => (
                    <Card
                      key={plan.id}
                      style={{ ["--kl-i" as string]: i }}
                      className={`flex flex-col p-4 ${plan.is_active ? "" : "opacity-60"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary">{plan.name}</p>
                        <Badge tone={plan.is_active ? "success" : "neutral"}>
                          {plan.is_active ? "Live" : "Off"}
                        </Badge>
                      </div>

                      <p className="kl-display mt-2 text-2xl font-extrabold text-text-primary">
                        {formatBirr(plan.price)}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {plan.duration_days} days ·{" "}
                        {AD_LEVELS.find((a) => a.id === plan.ad_level)?.label}
                      </p>

                      {plan.description && (
                        <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-text-secondary">
                          {plan.description}
                        </p>
                      )}

                      <div className="mt-3 flex gap-1.5">
                        <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditing(plan)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          icon={<Power size={14} />}
                          onClick={() => toggle(plan)}
                          aria-label={plan.is_active ? `Deactivate ${plan.name}` : `Activate ${plan.name}`}
                        >
                          {plan.is_active ? "Turn off" : "Turn on"}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editing !== null && (
        <PlanEditor
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function PlanEditor({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useFormState(savePlanAction, INITIAL);
  const [active, setActive] = useState(plan?.is_active ?? true);
  const [promotional, setPromotional] = useState(plan?.is_promotional ?? false);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) {
      toast.success(plan ? "Plan updated" : "Plan created");
      onSaved();
    } else if (state.error) {
      toast.error("Could not save", state.error);
    }
  }, [state, plan, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={plan ? "Edit plan" : "New plan"} description={plan?.name}>
      <form action={formAction} className="space-y-4">
        {plan && <input type="hidden" name="planId" value={plan.id} />}
        <input type="hidden" name="isActive" value={active ? "on" : "off"} />
        <input type="hidden" name="isPromotional" value={promotional ? "on" : "off"} />

        <Field label="Product" required>
          {({ id }) => (
            <Select id={id} name="kind" defaultValue={plan?.kind ?? "standard"}>
              <option value="standard">KELEME Premium</option>
              <option value="matric">Matric Package (Grade 12)</option>
            </Select>
          )}
        </Field>

        <Field label="Plan name" required>
          {({ id }) => <TextInput id={id} name="name" defaultValue={plan?.name ?? ""} placeholder="Premium — 3 Months" required />}
        </Field>

        <Field label="Description" hint="Shown to students on the pricing page.">
          {({ id }) => (
            <TextArea id={id} name="description" defaultValue={plan?.description ?? ""} placeholder="Three months of full premium access, with fewer ads." />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (Birr)" required>
            {({ id }) => (
              <TextInput id={id} name="price" type="number" min={0} step="0.01" defaultValue={plan?.price ?? 0} required />
            )}
          </Field>
          <Field label="Duration (days)" required hint="30 = 1 month, 365 = 1 year.">
            {({ id }) => (
              <TextInput id={id} name="durationDays" type="number" min={1} max={3650} defaultValue={plan?.duration_days ?? 30} required />
            )}
          </Field>
        </div>

        <Field label="Ads on this plan" hint="Longer plans should carry fewer ads. Annual plans normally carry none.">
          {({ id }) => (
            <Select id={id} name="adLevel" defaultValue={plan?.ad_level ?? "medium"}>
              {AD_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>{level.label}</option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Order" hint="Lower numbers appear first.">
          {({ id }) => <TextInput id={id} name="sortOrder" type="number" min={0} max={999} defaultValue={plan?.sort_order ?? 0} />}
        </Field>

        <div className="space-y-3 rounded-xl border border-kl-border p-4">
          <Toggle checked={active} onChange={setActive} label="Available to buy" description="Turn off to retire a plan without deleting it. Students who already bought it keep their access." />
          <Toggle checked={promotional} onChange={setPromotional} label="Promotional plan" description="Mark a limited-time offer." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <PlanSubmit />
        </div>
      </form>
    </Modal>
  );
}

function PlanSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} icon={<Save size={16} />}>
      {pending ? "Saving…" : "Save plan"}
    </Button>
  );
}
