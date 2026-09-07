"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Eye, EyeOff, Save } from "lucide-react";
import { updateProfileAction, type SettingsState } from "@/app/(app)/settings/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

const INITIAL: SettingsState = {};

export function SettingsForm({
  fullName,
  displayName,
  schoolName,
  leaderboardOptIn,
  publicNo,
}: {
  fullName: string;
  displayName: string | null;
  schoolName: string | null;
  leaderboardOptIn: boolean;
  publicNo: number;
}) {
  const [state, formAction] = useFormState(updateProfileAction, INITIAL);
  const [optIn, setOptIn] = useState(leaderboardOptIn);
  const [name, setName] = useState(displayName ?? "");
  const toast = useToast();

  useEffect(() => {
    if (state.ok) toast.success("Settings saved");
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, toast]);

  const anonymousName = `Student #${String(publicNo).padStart(4, "0")}`;
  const shownAs = optIn ? name.trim() || fullName : anonymousName;

  return (
    <Card className="p-5">
      <h2 className="kl-display font-bold text-text-primary">Profile and privacy</h2>

      <form action={formAction} className="mt-4 space-y-5">
        <Field
          label="Display name"
          hint="Shown on the leaderboard instead of your full name. Leave blank to use your real name."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={fullName}
              maxLength={40}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <Field label="School" hint="KELEME rewards top-performing students by school.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              name="schoolName"
              defaultValue={schoolName ?? ""}
              placeholder="Your school"
              maxLength={160}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <div className="rounded-xl border border-kl-border p-4">
          {/* The hidden input carries the switch's value, since a styled
              button is not a form control. */}
          <input type="hidden" name="leaderboardOptIn" value={optIn ? "on" : "off"} />
          <Toggle
            checked={optIn}
            onChange={setOptIn}
            label="Show my name on the public leaderboard"
            description="Off by default. Your phone number, email and school are never shown either way."
          />

          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-[var(--surface-elevated)] p-3">
            {optIn ? (
              <Eye size={15} className="shrink-0 text-accent" aria-hidden />
            ) : (
              <EyeOff size={15} className="shrink-0 text-text-secondary" aria-hidden />
            )}
            <p className="text-sm text-text-secondary">
              You currently appear as{" "}
              <span className="font-semibold text-text-primary">{shownAs}</span>
            </p>
          </div>
        </div>

        <SaveButton />
      </form>
    </Card>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} icon={<Save size={16} />}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}
