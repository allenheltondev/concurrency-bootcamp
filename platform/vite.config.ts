/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// P0 ships dark at /platform/ (unlinked). Phase P3 of docs/PLATFORM_PLAN.md
// moves the hub to the root URL — flip base to "/" there.
export default defineConfig({
  base: "/platform/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  }
});
