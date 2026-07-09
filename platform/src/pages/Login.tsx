import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Input, PasswordInput } from "@readysetcloud/ui";
import {
  AuthCard,
  PasswordRequirements,
  forgotPassword,
  isAuthError,
  respondNewPassword,
  signIn,
  useAuth,
  validateEmail,
  validatePassword
} from "@readysetcloud/ui/auth";
import { useConfigured } from "../lib/useConfigured";

type Step = { view: "signin" } | { view: "newPassword"; session: string };

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function Login() {
  const { signedIn } = useAuth();
  const configured = useConfigured();
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
    const errs: FieldErrors = {
      email: validateEmail(email),
      password: password ? undefined : "Enter your password."
    };
    setErrors(errs);
    if (errs.email || errs.password) return;
    setBusy(true);
    try {
      const out = await signIn(email, password);
      if (out.kind === "newPasswordRequired") {
        setPassword("");
        setStep({ view: "newPassword", session: out.session });
      }
    } catch (err) {
      if (isAuthError(err) && err.code === "UserNotConfirmedException") {
        // the auth core already fired a fresh code best-effort; finish there
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
    const errs: FieldErrors = {
      password: validatePassword(password),
      confirmPassword: password === confirmPassword ? undefined : "Passwords don't match."
    };
    setErrors(errs);
    if (errs.password || errs.confirmPassword) return;
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
      <main className="px-4 py-12 sm:py-16">
        <AuthCard
          title="Choose a New Password"
          subtitle="Your account requires a new password before signing in"
        >
          <form className="flex flex-col gap-4" noValidate onSubmit={submitNewPassword}>
            {alert && <Alert variant="error">{alert}</Alert>}
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <PasswordInput
              label="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
            />
            <PasswordRequirements />
            <Button type="submit" block loading={busy} loadingLabel="Saving…">
              Set Password
            </Button>
          </form>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="px-4 py-12 sm:py-16">
      <AuthCard
        title="Sign In"
        subtitle="Sync your progress across devices and courses"
        footer={
          <>
            Don&apos;t have an account? <Link to="/signup">Sign up</Link>
          </>
        }
      >
        {configured === false && <Alert variant="error">Accounts aren&apos;t enabled on this deployment.</Alert>}
        <form className="flex flex-col gap-4" noValidate onSubmit={submitSignIn}>
          {alert && <Alert variant="error">{alert}</Alert>}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <div className="flex items-center justify-between">
            <Link to="/forgot-password" className="auth-link text-sm">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" block loading={busy} loadingLabel="Signing In…">
            Sign In
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
