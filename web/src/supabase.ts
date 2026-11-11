import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Staff sign-ins live in sessionStorage, not localStorage: rowanflynnpilot.github.io is one origin
// shared by every WPR tool on GitHub Pages, and a token left in localStorage there would outlive the
// tab where any of them could read it. The token unlocks parents' emails and return addresses.
// Signing in again after closing the tab is the cost.
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { storage: window.sessionStorage },
});
