import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, CodeInput, Input, PasswordInput } from "@readysetcloud/ui";
import {
  AuthCard,
  PasswordRequirements,
  ResendCodeButton,
  confirmSignUp,
  signIn,
  signUp,
  useAuth,
  validateCode,
  validateEmail,
  validateName,
  validatePassword
} from "@readysetcloud/ui/auth";
import { useConfigured } from "../lib/useConfigured";

/* Two-step wizard: the sign-up form, then the emailed 6-digit confirmation
   code. Login also routes unconfirmed accounts here (location.state.confirm)
   so they land straight on the code step. */

interface RouteState {
  confirm?: { email: string; password?: string };
  from?: string;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
}

export default function Signup() {
  const { signedIn } = useAuth();
  const configured = useConfigured();
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
    const errs: FieldErrors = {
      firstName: validateName(firstName, "first name"),
      lastName: validateName(lastName, "last name"),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: password === confirmPassword ? undefined : "Passwords don't match."
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
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
    const errs: FieldErrors = { code: validateCode(code) };
    setErrors(errs);
    if (errs.code) return;
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
      <main className="px-4 py-12 sm:py-16">
        <AuthCard
          title="Verify Your Email"
          subtitle={
            <>
              We&apos;ve sent a confirmation code to <b className="font-medium text-foreground">{email}</b>
            </>
          }
        >
          <form className="flex flex-col gap-4" noValidate onSubmit={submitConfirm}>
            {alert && <Alert variant="error">{alert}</Alert>}
            <CodeInput
              label="Confirmation code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              error={errors.code}
            />
            <Button type="submit" block loading={busy} loadingLabel="Verifying…">
              Verify
            </Button>
            <div className="flex items-center justify-between">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to sign in
              </Link>
              <ResendCodeButton email={email} onError={setAlert} />
            </div>
          </form>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="px-4 py-12 sm:py-16">
      <AuthCard
        title="Create Account"
        subtitle="One Ready, Set, Cloud account for every course"
        footer={
          <>
            Already have an account? <Link to="/login">Sign in</Link>
          </>
        }
      >
        {configured === false && <Alert variant="error">Accounts aren&apos;t enabled on this deployment.</Alert>}
        <form className="flex flex-col gap-4" noValidate onSubmit={submitForm}>
          {alert && <Alert variant="error">{alert}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              error={errors.firstName}
            />
            <Input
              label="Last name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              error={errors.lastName}
            />
          </div>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <PasswordInput
            label="Confirm password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
          />
          <PasswordRequirements />
          <Button type="submit" block loading={busy} loadingLabel="Creating Account…">
            Create Account
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
