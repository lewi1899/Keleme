"use client";

import { forwardRef, useId } from "react";
import clsx from "clsx";

const CONTROL =
  "w-full rounded-xl border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 transition-colors focus:border-accent disabled:opacity-60";

function fieldTone(invalid?: boolean) {
  return invalid ? "border-red-500" : "border-kl-border";
}

interface FieldWrapperProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
}

/**
 * One wrapper for every form control so labels, hints and errors are wired to
 * the input the same way each time — `aria-describedby` pointing at both the
 * hint and the error, `aria-invalid` when it fails. Getting this right once
 * here is what makes the whole app usable with a screen reader.
 */
export function Field({ label, error, hint, required, children }: FieldWrapperProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(CONTROL, fieldTone(invalid), className)}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(CONTROL, fieldTone(invalid), "appearance-none", className)}
        {...props}
      >
        {children}
      </select>
    );
  }
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function TextArea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(CONTROL, fieldTone(invalid), "min-h-[96px] resize-y", className)}
      {...props}
    />
  );
});

/** Accessible switch — a real checkbox under a styled track, not a div. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "kl-press relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-accent" : "bg-[var(--border)]"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-kl-spring",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-text-secondary">{description}</span>}
      </label>
    </div>
  );
}
