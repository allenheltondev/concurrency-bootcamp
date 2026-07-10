import { AuthProvider, RequireAuth } from "@readysetcloud/ui/auth";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import SiteNav from "./components/SiteNav";
import ForgotPassword from "./pages/ForgotPassword";
import Hub from "./pages/Hub";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";

/* The package's RequireAuth is router-agnostic: it renders a fallback node
   when signed out. Ours carries a return-to so a successful sign-in lands
   the visitor back where they aimed. */
function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

/* The chrome-bearing surface: everything that isn't a focused auth flow gets
   the shared AppNav on top. Auth screens (login/signup/reset) stay bare — a
   nav offering "Sign in" on the sign-in page would just be noise. */
function SiteLayout() {
  return (
    <>
      <SiteNav />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route element={<SiteLayout />}>
            {/* public: the marketing site */}
            <Route path="/" element={<Landing />} />
            {/* gated: the signed-in dashboard */}
            <Route
              path="/app"
              element={
                <RequireAuth fallback={<RedirectToLogin />}>
                  <Hub />
                </RequireAuth>
              }
            />
            <Route
              path="/app/profile"
              element={
                <RequireAuth fallback={<RedirectToLogin />}>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Landing />} />
          </Route>
          {/* bare auth screens */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* the account menus on course pages briefly linked /profile */}
          <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
