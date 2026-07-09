/** Ported from the RSC newsletter dashboard (dashboard-ui/tailwind.config.js)
 *  — the canonical home of the RSC design tokens for this repo (ADR 0002).
 *  Colors resolve through CSS variables defined in src/index.css, so light /
 *  dark / explicit [data-theme] all work at runtime. Familiar palette names
 *  alias the semantic scales exactly like the newsletter config does. */

const scale = (name, steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) =>
  Object.fromEntries(steps.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]));

const primary = scale("primary");
const success = scale("success");
const warning = scale("warning");
const error = scale("error");
const secondary = scale("secondary");

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        primary, success, warning, error, secondary,
        // familiar names alias the semantic scales (newsletter convention)
        blue: primary, green: success, red: error,
        orange: warning, amber: warning, yellow: warning,
        gray: secondary, slate: secondary
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "Monaco", "monospace"]
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem" },
      boxShadow: {
        soft: "0 2px 15px -3px rgba(0,0,0,0.07), 0 10px 20px -2px rgba(0,0,0,0.04)",
        medium: "0 4px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
        large: "0 10px 40px -10px rgba(0,0,0,0.15), 0 20px 25px -5px rgba(0,0,0,0.1)"
      },
      spacing: { 18: "4.5rem", 88: "22rem" }
    }
  },
  plugins: []
};
