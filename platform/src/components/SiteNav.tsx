/* The app chrome: @readysetcloud/ui's AppNav wired to this app's auth state,
   route table, and the Ready, Set, Cloud service launcher. One nav bar for the
   whole platform — it replaces the hand-rolled headers the marketing, hub, and
   profile pages each used to carry. Anchors (not <Link>) on purpose: AppNav is
   router-agnostic, and a full load between the hub and a course app is fine. */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppNav, type AppNavItem, type AppTheme } from "@readysetcloud/ui";
import { useAuth } from "@readysetcloud/ui/auth";
import { useConfigured } from "../lib/useConfigured";

const THEME_KEY = "rsc:theme";

function initialTheme(): AppTheme {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export default function SiteNav() {
  const { signedIn, user, signOut } = useAuth();
  const configured = useConfigured();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<AppTheme>(initialTheme);

  // Dormant deployments (accounts disabled) hide sign-in/up entirely; while the
  // config is still loading we optimistically show the anonymous controls.
  const authState = configured === false ? "none" : signedIn ? "authenticated" : "anonymous";
  const name = [user.given_name, user.family_name].filter(Boolean).join(" ") || user.email;

  const navItems: AppNavItem[] = signedIn
    ? [
        { id: "dashboard", label: "Dashboard", href: "/app", active: pathname === "/app" },
        { id: "profile", label: "Profile", href: "/app/profile", active: pathname === "/app/profile" }
      ]
    : [{ id: "courses", label: "Courses", href: "/#courses" }];

  return (
    <AppNav
      appName="Bootcamp"
      homeHref="/"
      currentServiceId="bootcamp"
      navItems={navItems}
      authState={authState}
      user={signedIn ? { name, email: user.email } : undefined}
      theme={theme}
      onThemeChange={(next) => {
        setTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* private-mode / storage-disabled: theme just won't persist */
        }
      }}
      signInAction={{ label: "Sign in", href: "/login" }}
      signUpAction={{ label: "Create account", href: "/signup" }}
      onSignOut={() => {
        void signOut();
        navigate("/");
      }}
    />
  );
}
