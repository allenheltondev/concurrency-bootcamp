import { Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import ForgotPassword from "./pages/ForgotPassword";
import Hub from "./pages/Hub";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Hub />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
