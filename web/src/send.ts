// The letter form's send, straight to the submit-letter function with the publishable key. Plain
// fetch, not the Supabase client: the client opens browser storage as it loads, and inside
// WordPress's frame (a third-party frame) a browser that blocks third-party cookies refuses that
// storage, which would take the whole form down. Parents never sign in, so the form needs none of it.
import { env } from "./env";
import type { PreparedPhoto } from "./photo";

export interface LetterSubmission {
  first_name: string;
  age: string;
  town: string;
  body: string;
  parent_name: string;
  email: string;
  consent: boolean;
  newsletter_opt_in: boolean;
}

// `submissionKey` is this letter's, the same on every try: if a try saved the letter but its reply was
// lost (a timeout on a weak connection), the retry gets that letter back instead of making a second.
export async function submitLetter(
  letter: LetterSubmission,
  photo: PreparedPhoto | null,
  turnstileToken: string,
  submissionKey: string,
) {
  const body = new FormData();
  for (const [name, value] of Object.entries(letter)) body.append(name, String(value));
  body.append("turnstile_token", turnstileToken);
  body.append("submission_key", submissionKey);
  if (photo) {
    body.append("photo", photo.full, "full.jpg");
    body.append("thumb", photo.thumb, "thumb.jpg");
  }

  // A stalled upload on a weak connection gives up after a minute, so the parent can try again rather
  // than wait on "Sending…" forever.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/submit-letter`, {
      method: "POST",
      // The key in apikey only: it isn't a JWT, and the form has no sign-in to put in Authorization.
      headers: { apikey: env.supabasePublishableKey },
      body,
      signal: abort.signal,
    });
  } catch (err) {
    console.error(err);
    throw new Error("Your letter didn't go through. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return;

  // Only submit-letter's own { error } body is written for readers. A gateway's error page or a
  // timeout gets a plain retry message, never the raw text.
  const reply = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (typeof reply?.error === "string" && reply.error) throw new Error(reply.error);
  console.error(`submit-letter answered ${response.status}`);
  throw new Error("Your letter couldn't be sent. Check it and try again in a few minutes.");
}
