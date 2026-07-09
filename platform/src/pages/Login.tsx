import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AuthCard,
  Field,
  FormAlert,
  PasswordField,
  PasswordRequirements,
  SubmitButton
} from "../components/forms";
import { useAuth } from "../context/AuthContext";
import { forgotPassword, isAuthError, respondNewPassword, signIn } from "../lib/auth";
import { validate, type FieldErrors } from "../lib/validate";

type Step = { view: "signin" } | { view: "newPassword"; session: string };

export default function Login() {
  const { signedIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";

  const [step, setStep] = useState<Step>({ view: "signin" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // a successful sign-in (either step) flips the context; land on the return-to
  if (signedIn) return <Navigate to={from} replace />;

  async function submitSignIn(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const errs = validate("signin", { email, password });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const out = await signIn(email, password);
      if (out.kind === "newPasswordRequired") {
        setPassword("");
        setStep({ view: "newPassword", session: out.session });
      }
    } catch (err) {
      if (isAuthError(err) && err.code === "UserNotConfirmedException") {
        // auth.ts already fired a fresh code best-effort; finish there
        navigate("/signup", { state: { confirm: { email, password }, from } });
        return;
      }
      if (isAuthError(err) && err.code === "PasswordResetRequiredException") {
        forgotPassword(email).catch(() => {});
        navigate("/forgot-password", { state: { email, step: "confirm", from } });
        return;
      }
      setAlert(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e: FormEvent) {
    e.preventDefault();
    if (step.view !== "newPassword") return;
    setAlert(null);
    const errs = validate("newPassword", { password, confirmPassword });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await respondNewPassword(email, password, step.session);
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step.view === "newPassword") {
    return (
      <AuthCard
        title="Choose a New Password"
        subtitle="Your account requires a new password before signing in"
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={submitNewPassword}>
          <FormAlert message={alert} />
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
          <SubmitButton busy={busy} label="Set Password" busyLabel="Saving…" />
        </form>
        <PasswordRequirements />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign In"
      subtitle="Sync your progress across devices and courses"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary-600 hover:text-primary-700">
            Sign up
          </Link>
        </>
      }
    >
      {configured === false && (
        <div className="mb-4">
          <FormAlert message="Accounts aren't enabled on this deployment." />
        </div>
      )}
      <form className="flex flex-col gap-4" noValidate onSubmit={submitSignIn}>
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
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        <div className="flex items-center justify-between">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton busy={busy} label="Sign In" busyLabel="Signing In…" />
      </form>
    </AuthCard>
  );
}
