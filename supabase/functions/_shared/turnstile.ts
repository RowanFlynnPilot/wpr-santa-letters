import { BadRequest } from "./errors.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare itself couldn't be reached or didn't answer properly: nobody's letter can get through until it
// can, so the caller notes it for the editor's morning digest (migration 0010). Not the parent's doing.
export class SpamCheckDown extends Error {}

// Confirms the entry form's Turnstile token with Cloudflare. Tokens are single-use and
// expire after five minutes; the form fetches a fresh one after any failed attempt. If Cloudflare
// doesn't answer in 10 seconds the entrant gets the usual retry message; no photo is stored yet.
export async function verifyTurnstile(secret: string, token: string): Promise<void> {
  let result: { success: boolean; "error-codes": string[] };
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    result = await response.json();
  } catch (err) {
    throw new SpamCheckDown(`Turnstile siteverify didn't answer: ${(err as Error).message}`);
  }
  if (!result.success) {
    console.warn("Turnstile rejected a submission", result["error-codes"]);
    throw new BadRequest(
      "We couldn't confirm you're a person. Wait for the check above the button to finish, then try again.",
    );
  }
}
