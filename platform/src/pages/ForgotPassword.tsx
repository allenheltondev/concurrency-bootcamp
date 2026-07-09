import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  AuthCard,
  CodeField,
  Field,
  FormAlert,
  PasswordField,
  PasswordRequirements,
  ResendCodeButton,
  SubmitButton
} from "../components/forms";
import { useAuth } from "../context/AuthContext";
import { confirmForgotPassword, forgotPassword, signIn } from "../lib/auth";
import { validate, type FieldErrors } from "../lib/validate";

/* Two steps: email -> code + new password. Login routes
   PasswordResetRequiredException here straight onto the code step
   (location.state), mirroring the account.js modal flow. */

interface RouteState {
  email?: string;
  step?: "confirm";
  from?: string;
}

export default function ForgotPassword() {
  const { signedIn, configured } = useAuth();
  const location = useLocation();
  const routeState = (location.state as RouteState | null) ?? {};
  const from = routeState.from || "/profile";

  const [step, setStep] = useState<"email" | "confirm">(
    routeState.step === "confirm" && routeState.email ? "confirm" : "email"
  );
  const [email, setEmail] = useState(routeState.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the confirm step auto-signs in after resetting; land on the return-to
  if (signedIn) return <Navigate to={from} replace />;

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const errs = validate("forgot", { email });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await forgotPassword(email);
      setErrors({});
      setStep("confirm");
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirm(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const errs = validate("forgotConfirm", { code, password, confirmPassword });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await confirmForgotPassword(email, code, password);
      await signIn(email, password); // flips signedIn -> redirect above
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "confirm") {
    return (
      <AuthCard
        title="Choose a New Password"
        subtitle={
          <>
            We&apos;ve sent a reset code to <b className="font-medium text-foreground">{email}</b>
          </>
        }
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={submitConfirm}>
          <FormAlert message={alert} />
          <CodeField label="Reset code" value={code} onChange={setCode} error={errors.code} />
          <PasswordField
            id="password"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            error={errors.confirmPassword}
          />
          <SubmitButton busy={busy} label="Reset Password" busyLabel="Resetting…" />
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </Link>
            <ResendCodeButton
              onResend={async () => {
                try {
                  await forgotPassword(email);
                  setAlert(null);
                  return true;
                } catch (err) {
                  setAlert(err instanceof Error ? err.message : "Couldn't resend the code.");
                  return false;
                }
              }}
            >
              Resend code
            </ResendCodeButton>
          </div>
        </form>
        <PasswordRequirements />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset Password" subtitle="Enter your email and we'll send you a reset code">
      {configured === false && (
        <div className="mb-4">
          <FormAlert message="Accounts aren't enabled on this deployment." />
        </div>
      )}
      <form className="flex flex-col gap-4" noValidate onSubmit={submitEmail}>
        <FormAlert message={alert} />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />
        <SubmitButton busy={busy} label="Send Reset Code" busyLabel="Sending…" />
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to sign in
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
