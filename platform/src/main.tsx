import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { configureAuth } from "@readysetcloud/ui/auth";
import "@readysetcloud/ui/styles.css";
import "@readysetcloud/ui/fonts.css";
import App from "./App";
import { getConfig } from "./lib/config";
import "./index.css";

// The shared auth core reads the same runtime deployment config this app
// already publishes (/auth-config.json) — absent config keeps auth dormant.
configureAuth(() => getConfig());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
