import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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
import { confirmSignUp, resendConfirmationCode, signIn, signUp } from "../lib/auth";
import { validate, type FieldErrors } from "../lib/validate";

/* Two-step wizard: the sign-up form, then the emailed 6-digit confirmation
   code. Login also routes unconfirmed accounts here (location.state.confirm)
   so they land straight on the code step. */

interface RouteState {
  confirm?: { email: string; password?: string };
  from?: string;
}

export default function Signup() {
  const { signedIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as RouteState | null) ?? {};
  const from = routeState.from || "/profile";

  const [step, setStep] = useState<"form" | "confirm">(routeState.confirm ? "confirm" : "form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(routeState.confirm?.email ?? "");
  // memory only, so confirm can auto-sign-in; never persisted (matches account.js)
  const [password, setPassword] = useState(routeState.confirm?.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedIn) return <Navigate to={from} replace />;

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const errs = validate("signup", { firstName, lastName, email, password, confirmPassword });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await signUp(firstName, lastName, email, password);
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
    const errs = validate("confirm", { code });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await confirmSignUp(email, code);
      if (password) {
        // held in memory from the form (or the login redirect): finish sign-in
        await signIn(email, password); // flips signedIn -> redirect above
        return;
      }
      navigate("/login", { state: { from } });
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "confirm") {
    return (
      <AuthCard
        title="Verify Your Email"
        subtitle={
          <>
            We&apos;ve sent a confirmation code to <b className="font-medium text-foreground">{email}</b>
          </>
        }
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={submitConfirm}>
          <FormAlert message={alert} />
          <CodeField label="Confirmation code" value={code} onChange={setCode} error={errors.code} />
          <SubmitButton busy={busy} label="Verify" busyLabel="Verifying…" />
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </Link>
            <ResendCodeButton
              onResend={async () => {
                try {
                  await resendConfirmationCode(email);
                  setAlert(null);
                  return true;
                } catch (err) {
                  setAlert(err instanceof Error ? err.message : "Couldn't resend the code.");
                  return false;
                }
              }}
            />
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create Account"
      subtitle="One Ready, Set, Cloud account for every course"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Sign in
          </Link>
        </>
      }
    >
      {configured === false && (
        <div className="mb-4">
          <FormAlert message="Accounts aren't enabled on this deployment." />
        </div>
      )}
      <form className="flex flex-col gap-4" noValidate onSubmit={submitForm}>
        <FormAlert message={alert} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="firstName"
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={setFirstName}
            error={errors.firstName}
          />
          <Field
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={setLastName}
            error={errors.lastName}
          />
        </div>
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
        />
        <SubmitButton busy={busy} label="Create Account" busyLabel="Creating Account…" />
      </form>
      <PasswordRequirements />
    </AuthCard>
  );
}
