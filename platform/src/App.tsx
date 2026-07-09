import { Route, Routes } from "react-router-dom";
import Hub from "./pages/Hub";

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="*" element={<Hub />} />
      </Routes>
    </div>
  );
}
