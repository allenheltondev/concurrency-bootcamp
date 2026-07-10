import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Alert, Button, CodeInput, Input, PasswordInput } from "@readysetcloud/ui";
import {
  AuthCard,
  PasswordRequirements,
  confirmForgotPassword,
  forgotPassword,
  signIn,
  useAuth,
  validateCode,
  validateEmail,
  validatePassword
} from "@readysetcloud/ui/auth";
import { useConfigured } from "../lib/useConfigured";

/* Two steps: email -> code + new password. Login routes
   PasswordResetRequiredException here straight onto the code step
   (location.state), mirroring the account.js modal flow. */

interface RouteState {
  email?: string;
  step?: "confirm";
  from?: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
}

const RESEND_COOLDOWN_S = 60;

/* The package's ResendCodeButton is hardwired to resendConfirmationCode;
   this flow resends via forgotPassword, so the cooldown button stays local. */
function ResendResetCode({
  email,
  onError,
  onSent
}: {
  email: string;
  onError: (message: string) => void;
  onSent: () => void;
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
        try {
          await forgotPassword(email);
          onSent();
          setSecondsLeft(RESEND_COOLDOWN_S);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Couldn't resend the code.");
        }
      }}
      className="auth-link text-sm disabled:cursor-default disabled:opacity-50"
    >
      {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
    </button>
  );
}

export default function ForgotPassword() {
  const { signedIn } = useAuth();
  const configured = useConfigured();
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
    const errs: FieldErrors = { email: validateEmail(email) };
    setErrors(errs);
    if (errs.email) return;
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
    const errs: FieldErrors = {
      code: validateCode(code),
      password: validatePassword(password),
      confirmPassword: password === confirmPassword ? undefined : "Passwords don't match."
    };
    setErrors(errs);
    if (errs.code || errs.password || errs.confirmPassword) return;
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
      <main className="px-4 py-12 sm:py-16">
        <AuthCard
          title="Choose a New Password"
          subtitle={
            <>
              We&apos;ve sent a reset code to <b className="font-medium text-foreground">{email}</b>
            </>
          }
        >
          <form className="flex flex-col gap-4" noValidate onSubmit={submitConfirm}>
            {alert && <Alert variant="error">{alert}</Alert>}
            <CodeInput
              label="Reset code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              error={errors.code}
            />
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
            <Button type="submit" block loading={busy} loadingLabel="Resetting…">
              Reset Password
            </Button>
            <div className="flex items-center justify-between">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to sign in
              </Link>
              <ResendResetCode email={email} onError={setAlert} onSent={() => setAlert(null)} />
            </div>
          </form>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="px-4 py-12 sm:py-16">
      <AuthCard title="Reset Password" subtitle="Enter your email and we'll send you a reset code">
        {configured === false && <Alert variant="error">Accounts aren&apos;t enabled on this deployment.</Alert>}
        <form className="flex flex-col gap-4" noValidate onSubmit={submitEmail}>
          {alert && <Alert variant="error">{alert}</Alert>}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <Button type="submit" block loading={busy} loadingLabel="Sending…">
            Send Reset Code
          </Button>
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </Link>
          </div>
        </form>
      </AuthCard>
    </main>
  );
}
