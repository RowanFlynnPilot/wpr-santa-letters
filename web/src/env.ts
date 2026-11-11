// Every value is required; vite.config.ts refuses to build or serve without them.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  mailbagPageUrl: import.meta.env.VITE_MAILBAG_PAGE_URL,
  writePageUrl: import.meta.env.VITE_WRITE_PAGE_URL,
  rulesUrl: import.meta.env.VITE_RULES_URL,
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
};
