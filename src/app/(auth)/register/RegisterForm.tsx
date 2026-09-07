"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, GraduationCap, Phone, UserPlus } from "lucide-react";
import { registerAction, type AuthState } from "../actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { formatEthiopianPhone, normalizeEthiopianPhone } from "@/lib/phone";

const INITIAL: AuthState = {};

const GRADES = [
  { value: 9, label: "Grade 9" },
  { value: 10, label: "Grade 10" },
  { value: 11, label: "Grade 11" },
  { value: 12, label: "Grade 12 — includes matric papers" },
];

/**
 * Two steps rather than one long column.
 *
 * On a phone, a nine-field form is a wall that people abandon. Splitting it
 * means the first screen asks only for what someone expects to be asked for,
 * and the second screen — phone, grade, school — arrives once they are already
 * invested. Both steps are still submitted together in a single request, so
 * the phone number is collected strictly before the account is created, as
 * spec section 6 requires; there is no window where a KELEME account exists
 * without one.
 */
export function RegisterForm() {
  const params = useSearchParams();
  const [state, formAction] = useFormState(registerAction, INITIAL);
  const [step, setStep] = useState<1 | 2>(1);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [referralCode, setReferralCode] = useState(params.get("ref")?.toUpperCase() ?? "");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // A server-side field error always belongs to the step that owns the field,
  // so jump back to it rather than leaving the student staring at a step 2
  // form with an invisible email error.
  useEffect(() => {
    const fields = Object.keys(state.fieldErrors ?? {});
    if (fields.some((f) => ["fullName", "email", "password"].includes(f))) setStep(1);
  }, [state.fieldErrors]);

  const errors = { ...localErrors, ...(state.fieldErrors ?? {}) };
  const normalizedPhone = normalizeEthiopianPhone(phone);

  function validateStepOne(): boolean {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next.fullName = "Enter your full name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = "Enter a valid email address";
    if (password.length < 8) next.password = "Use at least 8 characters";
    setLocalErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="kl-display text-2xl font-bold text-text-primary">Create your account</h1>
        <span className="text-xs font-semibold text-text-secondary">Step {step} of 2</span>
      </div>

      <div className="mt-4 flex gap-1.5" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={2}>
        {[1, 2].map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              n <= step ? "bg-accent" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {state.error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{state.error}</p>
        </div>
      )}

      <form action={formAction} className="mt-6" noValidate>
        {/* Step 1's values ride along as hidden inputs while step 2 is showing,
            so one submit carries the whole registration. */}
        <div className={step === 1 ? "animate-kl-fade-in space-y-4" : "hidden"}>
          <Field label="Full name" error={errors.fullName} required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name={step === 1 ? "fullName" : undefined}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder="Selam Tesfaye"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Email" error={errors.email} hint="We use this to sign you in and recover your account." required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name={step === 1 ? "email" : undefined}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Password" error={errors.password} hint="At least 8 characters." required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name={step === 1 ? "password" : undefined}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Button
            type="button"
            fullWidth
            size="lg"
            icon={<ArrowRight size={17} />}
            onClick={() => {
              if (validateStepOne()) setStep(2);
            }}
          >
            Continue
          </Button>
        </div>

        <div className={step === 2 ? "animate-kl-fade-in space-y-4" : "hidden"}>
          {step === 2 && (
            <>
              <input type="hidden" name="fullName" value={fullName} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="password" value={password} />
            </>
          )}

          <Field
            label="Phone number"
            error={errors.phone}
            hint={
              normalizedPhone
                ? `Saved as ${formatEthiopianPhone(normalizedPhone)}`
                : "Ethiopian mobile number, e.g. 0912345678"
            }
            required
          >
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <Phone
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                  aria-hidden
                />
                <TextInput
                  id={id}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="0912345678"
                  className="pl-9 pr-9"
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
                {/* Live confirmation that the number was understood, so nobody
                    discovers a typo only after submitting. */}
                {normalizedPhone && (
                  <Check size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" aria-hidden />
                )}
              </div>
            )}
          </Field>

          <Field label="Grade" error={errors.grade} required>
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <GraduationCap
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                  aria-hidden
                />
                <Select
                  id={id}
                  name="grade"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="pl-9"
                  aria-describedby={describedBy}
                  invalid={invalid}
                >
                  <option value="">Choose your grade</option>
                  {GRADES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </Field>

          <Field
            label="School"
            error={errors.schoolName}
            hint="KELEME rewards top-performing students by school."
            required
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="schoolName"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                autoComplete="organization"
                placeholder="Menelik II Secondary School"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Referral code" error={errors.referralCode} hint="Optional — if a friend invited you.">
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="referralCode"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={12}
                className="uppercase tracking-widest"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" icon={<ArrowLeft size={17} />} onClick={() => setStep(1)}>
              Back
            </Button>
            <SubmitButton />
          </div>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth size="lg" loading={pending} icon={<UserPlus size={17} />}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}
