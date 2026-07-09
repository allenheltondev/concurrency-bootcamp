/* React face of the shared session contract: a context fed by lib/auth's
   listener registry (sign-in/out anywhere — this tab or another — re-renders
   the app) plus the runtime config's availability, and the <RequireAuth>
   route gate. */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  claims,
  onAuthChange,
  readSession,
  signOut as authSignOut,
  type IdClaims
} from "../lib/auth";
import { getConfig } from "../lib/config";

interface AuthValue {
  signedIn: boolean;
  user: IdClaims;
  /** null while /auth-config.json loads; false when accounts are disabled. */
  configured: boolean | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readSession);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => onAuthChange(() => setSession(readSession())), []);

  useEffect(() => {
    let live = true;
    getConfig().then((config) => {
      if (live) setConfigured(!!config);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      signedIn: !!session,
      user: session ? claims() : {},
      configured,
      signOut: authSignOut
    }),
    [session, configured]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Gate for signed-in-only routes: redirects visitors to /login, carrying a
    return-to so a successful sign-in lands them back where they aimed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const location = useLocation();
  if (!signedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
