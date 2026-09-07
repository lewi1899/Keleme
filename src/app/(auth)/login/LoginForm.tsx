"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, Info, LogIn, MailCheck, MonitorSmartphone } from "lucide-react";
import { loginAction, type AuthState } from "../actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

const INITIAL: AuthState = {};

/**
 * Notices the student can arrive with. Being specific matters: "signed in
 * elsewhere" and "your account is suspended" produce identical confusion if
 * both just say "please sign in".
 */
const REASONS: Record<string, { icon: React.ReactNode; tone: string; text: string }> = {
  "signed-in-elsewhere": {
    icon: <MonitorSmartphone size={16} />,
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    text: "Your account was opened on another device, so you were signed out here. One account can only be used on one device at a time.",
  },
  "check-email": {
    icon: <MailCheck size={16} />,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    text: "Your account is created. Check your email for the confirmation link, then sign in.",
  },
  deactivated: {
    icon: <Info size={16} />,
    tone: "border-kl-border bg-[var(--surface-elevated)] text-text-secondary",
    text: "This account has been deactivated. Contact KELEME support if this is a mistake.",
  },
  "session-expired": {
    icon: <Info size={16} />,
    tone: "border-kl-border bg-[var(--surface-elevated)] text-text-secondary",
    text: "Your session expired. Please sign in again.",
  },
};

export function LoginForm() {
  const params = useSearchParams();
  const [state, formAction] = useFormState(loginAction, INITIAL);

  const reason = params.get("reason");
  const notice = reason ? REASONS[reason] : undefined;
  const next = params.get("next") ?? "";

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="kl-display text-2xl font-bold text-text-primary">Welcome back</h1>
      <p className="mt-1.5 text-sm text-text-secondary">Sign in to pick up where you left off.</p>

      {notice && (
        <div className={`mt-5 flex gap-2.5 rounded-xl border p-3 text-sm ${notice.tone}`}>
          <span className="mt-0.5 shrink-0" aria-hidden>{notice.icon}</span>
          <p className="leading-relaxed">{notice.text}</p>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />

        {state.error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p>{state.error}</p>
          </div>
        )}

        <Field label="Email" required>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              required
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <Field label="Password" required>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        New to KELEME?{" "}
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}

function SubmitButton() {
  // useFormStatus reads the parent form's pending state, so the button
  // disables itself for the whole round trip with no local state to keep in
  // sync.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth size="lg" loading={pending} icon={<LogIn size={17} />}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
