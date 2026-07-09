/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The hub owns the root URL (docs/PLATFORM_PLAN.md phase P3); the course
// apps live as static siblings at /js-concurrency/ and /distributed-systems/.
export default defineConfig({
  base: "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  }
});
