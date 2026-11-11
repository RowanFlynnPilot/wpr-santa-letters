// Staff-only functions check the caller themselves: verify_jwt is off in config.toml, since the project's new
// API keys aren't the legacy JWT secret the gateway checks. A signed-in user with a row in `staff`, or a
// response to send back instead.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { json } from "./http.ts";

export async function requireStaff(supabase: SupabaseClient, req: Request): Promise<Response | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json({ error: "Sign in again." }, 401);
  const { data: staff, error } = await supabase
    .from("staff")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!staff) return json({ error: "Staff only." }, 403);
  return null;
}
