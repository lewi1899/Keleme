"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Flame, Save, Shield, Sparkles, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { updateSettingsAction, type SettingsActionState } from "@/app/admin/settings/actions";

const INITIAL: SettingsActionState = {};

function num(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

function bool(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof settings[key] === "boolean" ? (settings[key] as boolean) : fallback;
}

export function SettingsPanel({ settings }: { settings: Record<string, unknown> }) {
  const [state, formAction] = useFormState(updateSettingsAction, INITIAL);
  const [leaderboard, setLeaderboard] = useState(bool(settings, "leaderboard_enabled", true));
  const [registration, setRegistration] = useState(bool(settings, "registration_open", true));
  const toast = useToast();

  useEffect(() => {
    if (state.ok) toast.success("Settings saved", "Changes are live for every student now.");
    else if (state.error) toast.error("Could not save", state.error);
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="leaderboard_enabled" value={leaderboard ? "on" : "off"} />
      <input type="hidden" name="registration_open" value={registration ? "on" : "off"} />

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Flame size={16} className="text-orange-500" aria-hidden />
          What counts as a day of study
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          A day earns a streak when a student clears <em>either</em> of these. Setting both very low
          would make streaks meaningless.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Minimum study time (seconds)" hint="300 = 5 minutes.">
            {({ id }) => <TextInput id={id} name="streak_min_seconds" type="number" min={60} max={7200} defaultValue={num(settings, "streak_min_seconds", 300)} />}
          </Field>
          <Field label="Or minimum questions answered">
            {({ id }) => <TextInput id={id} name="streak_min_questions" type="number" min={1} max={100} defaultValue={num(settings, "streak_min_questions", 5)} />}
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Shield size={16} className="text-accent" aria-hidden />
          Study-time limits
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          These are the anti-cheat controls. The heartbeat cap is the important one: it is the most
          time a single stretch of inactivity can ever earn, so a tab left open all night credits
          one cap, not eight hours.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Heartbeat cap (seconds)" hint="Default 90.">
            {({ id }) => <TextInput id={id} name="heartbeat_cap_seconds" type="number" min={30} max={600} defaultValue={num(settings, "heartbeat_cap_seconds", 90)} />}
          </Field>
          <Field label="Daily cap (seconds)" hint="43200 = 12 hours.">
            {({ id }) => <TextInput id={id} name="daily_seconds_cap" type="number" min={3600} max={86400} defaultValue={num(settings, "daily_seconds_cap", 43200)} />}
          </Field>
          <Field label="Idle timeout (seconds)" hint="Session closes after this much silence.">
            {({ id }) => <TextInput id={id} name="session_idle_timeout_seconds" type="number" min={60} max={3600} defaultValue={num(settings, "session_idle_timeout_seconds", 600)} />}
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Trophy size={16} className="text-amber-500" aria-hidden />
          Rewards and referrals
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Weekly winners" hint="How many places are ranked and rewarded each week.">
            {({ id }) => <TextInput id={id} name="weekly_reward_winner_count" type="number" min={1} max={100} defaultValue={num(settings, "weekly_reward_winner_count", 10)} />}
          </Field>
          <Field
            label="Referral burst limit (per hour)"
            hint="Above this many confirmed referrals in an hour, a referrer is held for review instead of being paid automatically."
          >
            {({ id }) => <TextInput id={id} name="referral_burst_limit_per_hour" type="number" min={1} max={100} defaultValue={num(settings, "referral_burst_limit_per_hour", 10)} />}
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Sparkles size={16} className="text-accent" aria-hidden />
          Access and ads
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Ads for free students" hint="Paid plans carry their own ad level, set per plan.">
            {({ id }) => (
              <Select id={id} name="free_tier_ad_level" defaultValue={String(settings.free_tier_ad_level ?? "high")}>
                <option value="high">Standard ads</option>
                <option value="medium">Fewer ads</option>
                <option value="low">Very few ads</option>
                <option value="none">No ads</option>
              </Select>
            )}
          </Field>
          <Field label="Download link lifetime (seconds)" hint="How long a PDF link stays valid after a student taps download.">
            {({ id }) => <TextInput id={id} name="signed_url_ttl_seconds" type="number" min={60} max={3600} defaultValue={num(settings, "signed_url_ttl_seconds", 300)} />}
          </Field>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-kl-border p-4">
          <Toggle checked={leaderboard} onChange={setLeaderboard} label="Public leaderboard" description="Turn off to hide the leaderboard from every student." />
          <Toggle checked={registration} onChange={setRegistration} label="Registration open" description="Turn off to stop new students signing up. Existing accounts are unaffected." />
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} icon={<Save size={16} />}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}
