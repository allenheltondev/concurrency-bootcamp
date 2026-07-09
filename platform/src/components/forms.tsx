/* Auth form anatomy — the newsletter dashboard's form vocabulary, matching
   the modal in js/account.js piece for piece: centered max-w-md surface
   card, title + muted subtitle, labels above .input fields, error-300
   borders + error-600 field text, an error-50/error-200/error-600 alert
   box, full-width primary submit with an inline spinner and busy label,
   eye toggles, the tracking-widest code input, and 60s resend cooldowns. */

import { useEffect, useState, type ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex justify-center px-4 py-12 sm:py-16">
      <div className="card w-full max-w-md px-8 py-6 shadow-large">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-1 text-sm text-error-600">
      {error}
    </p>
  );
}

function FieldLabel({ id, label }: { id: string; label: string }) {
  return (
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted-foreground">
      {label}
    </label>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <FieldLabel id={id} label={label} />
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`input ${error ? "input-error" : ""}`}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel id={id} label={label} />
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`input pr-10 ${error ? "input-error" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "hide password" : "show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
        >
          👁
        </button>
      </div>
      <FieldError id={id} error={error} />
    </div>
  );
}

export function CodeField({
  id = "code",
  label,
  value,
  onChange,
  error
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <FieldLabel id={id} label={label} />
      <input
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`input text-center text-lg tracking-widest ${error ? "input-error" : ""}`}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-error-200 bg-error-50 p-3">
      <p className="text-sm text-error-600">{message}</p>
    </div>
  );
}

export function SubmitButton({
  busy,
  label,
  busyLabel
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button type="submit" disabled={busy} className="btn-primary w-full">
      {busy && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {busy ? busyLabel : label}
    </button>
  );
}

export function PasswordRequirements() {
  return (
    <div className="mt-4 text-xs text-muted-foreground">
      Password requirements:
      <ul className="mt-1 list-disc pl-4">
        <li>At least 8 characters</li>
        <li>Contains uppercase and lowercase letters</li>
        <li>Contains at least one number</li>
      </ul>
    </div>
  );
}

const RESEND_COOLDOWN_S = 60;

/** Text-link resend button with the modal's 60s cooldown. `onResend` should
    return false when the resend failed (no cooldown then, so the user can
    retry immediately). */
export function ResendCodeButton({
  onResend,
  children = "Resend confirmation code"
}: {
  onResend: () => Promise<boolean | void>;
  children?: ReactNode;
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  return (
    <button
      type="button"
      disabled={secondsLeft > 0}
      onClick={async () => {
        const ok = await onResend();
        if (ok !== false) setSecondsLeft(RESEND_COOLDOWN_S);
      }}
      className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:cursor-default disabled:opacity-50"
    >
      {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : children}
    </button>
  );
}
