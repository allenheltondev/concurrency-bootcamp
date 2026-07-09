/* Client-side form validation — a 1:1 port of js/account.js's validate()
   (which itself mirrors the newsletter dashboard's forms and the shared
   pool's password policy). Same views, same rules, same copy. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export type AuthView = "signin" | "signup" | "confirm" | "forgot" | "forgotConfirm" | "newPassword";

export interface FieldValues {
  email?: string;
  password?: string;
  confirmPassword?: string;
  firstName?: string;
  lastName?: string;
  code?: string;
}

export type FieldErrors = Partial<Record<keyof FieldValues, string>>;

export function validate(view: AuthView, v: FieldValues): FieldErrors {
  const errs: FieldErrors = {};
  const needEmail = ["signin", "signup", "forgot"].includes(view);
  const needPw = ["signup", "forgotConfirm", "newPassword"].includes(view);
  if (needEmail && !EMAIL_RE.test(v.email || "")) errs.email = "Enter a valid email address.";
  if (view === "signin" && (v.password || "").length < 8) errs.password = "Enter your password.";
  if (view === "signup") {
    if (!(v.firstName || "").trim() || (v.firstName || "").length > 50) errs.firstName = "Required.";
    if (!(v.lastName || "").trim() || (v.lastName || "").length > 50) errs.lastName = "Required.";
  }
  if (needPw) {
    if (!PW_RE.test(v.password || "")) errs.password = "Doesn't meet the requirements below.";
    if (v.password !== v.confirmPassword) errs.confirmPassword = "Passwords don't match.";
  }
  if (["confirm", "forgotConfirm"].includes(view) && !/^\d{6}$/.test(v.code || "")) {
    errs.code = "Enter the 6-digit code.";
  }
  return errs;
}
