/// <reference types="vite/client" />

// Presence is enforced in vite.config.ts.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_MAILBAG_PAGE_URL: string;
  readonly VITE_WRITE_PAGE_URL: string;
  readonly VITE_RULES_URL: string;
  readonly VITE_TURNSTILE_SITE_KEY: string;
}
