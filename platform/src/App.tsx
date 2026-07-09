import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import ForgotPassword from "./pages/ForgotPassword";
import Hub from "./pages/Hub";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";

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
              <RequireAuth>
                <Hub />
              </RequireAuth>
            }
          />
          <Route
            path="/app/profile"
            element={
              <RequireAuth>
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
