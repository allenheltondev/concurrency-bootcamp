import { AuthProvider, RequireAuth } from "@readysetcloud/ui/auth";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
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

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          {/* public: the marketing site + auth screens */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
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
          {/* the account menus on course pages briefly linked /profile */}
          <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
