import preset from "@readysetcloud/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // the package's components use token classes — Tailwind must see them
    "./node_modules/@readysetcloud/ui/dist/**/*.js"
  ]
};
