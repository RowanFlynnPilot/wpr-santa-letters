// Fail at module load, not mid-request, when a secret is missing.
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// Supabase's new API keys arrive as a JSON object keyed by name, e.g.
// SUPABASE_SECRET_KEYS={"default":"sb_secret_..."}. The legacy service_role key is
// deprecated by the end of 2026, which lands inside this contest's season.
export function requireNamedKey(envName: string, keyName: string): string {
  const key = (JSON.parse(requireEnv(envName)) as Record<string, string>)[keyName];
  if (!key) throw new Error(`${envName} has no key named "${keyName}"`);
  return key;
}

// For the few settings that switch a feature on, like email: absent means off, not broken.
export function optionalEnv(name: string): string | null {
  return Deno.env.get(name) || null;
}
