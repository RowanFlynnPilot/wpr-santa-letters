import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const REQUIRED_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_MAILBAG_PAGE_URL",
  "VITE_WRITE_PAGE_URL",
  "VITE_RULES_URL",
  "VITE_TURNSTILE_SITE_KEY",
];

// Served from GitHub Pages at /wpr-santa-letters/ and embedded in WordPress by iframe.
// A missing variable fails the build rather than shipping a blank mailbag.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing ${missing.join(", ")}. See web/.env.example.`);

  return {
    base: "/wpr-santa-letters/",
    plugins: [react()],
  };
});
