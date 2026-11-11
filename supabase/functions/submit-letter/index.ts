// POST multipart/form-data from the letter form. A parent or guardian fills it in for the child.
// This function checks the Turnstile token before it reads anything else, stores the optional photo
// of the handwritten letter (already resized and turned upright by the browser) with its metadata
// stripped, then records the letter through submit_letter(), which owns every rule (season phase,
// consent, the words, the daily limit).
//
// Storage layout: letter-photos/<photo_id>/full.jpg and letter-photos/<photo_id>/thumb.jpg.
//
// Once the letter is saved, it emails a confirmation to the parent, after the response goes back (see
// sendLetterEmails); staff hear about it in the morning digest (staff-digest). Email is the one optional setting: without
// RESEND_API_KEY letters save as usual and nothing is sent.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createMailer } from "../_shared/email.ts";
import { optionalEnv, requireEnv, requireNamedKey } from "../_shared/env.ts";
import { BadRequest } from "../_shared/errors.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { stripLocationMetadata } from "../_shared/jpeg.ts";
import { confirmationEmail, type StoredLetter } from "../_shared/letter_emails.ts";
import { senderAddress, senderKey } from "../_shared/sender.ts";
import { SpamCheckDown, verifyTurnstile } from "../_shared/turnstile.ts";

const BUCKET = "letter-photos";
const MAX_BYTES = { full: 3 * 1024 * 1024, thumb: 512 * 1024 };
// An hour, not a year: a photo taken down must stop showing soon. Supabase Pro's Smart CDN drops it within
// a minute, but a browser that already loaded it keeps it for as long as this says. Same as the staff page's uploads.
const CACHE_SECONDS = "3600";

const TURNSTILE_SECRET = requireEnv("TURNSTILE_SECRET_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");

const SECRET_KEY = requireNamedKey("SUPABASE_SECRET_KEYS", "default");
const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false },
});

// Replies to a confirmation reach the editor. Staff hear about new letters in the morning digest.
const mailer = createMailer({
  key: optionalEnv("RESEND_API_KEY"),
  from: optionalEnv("EMAIL_FROM") ?? "Wausau Pilot & Review <santa@wausaupilotandreview.com>",
  replyTo: optionalEnv("EMAIL_REPLY_TO") ?? "editor@wausaupilotandreview.com",
  url: optionalEnv("RESEND_API_URL") ?? undefined,
});
const MAILBAG_PAGE_URL = optionalEnv("MAILBAG_PAGE_URL") ?? "https://wausaupilotandreview.com/letters-to-santa/";
if (!mailer) console.warn("Email is off: set RESEND_API_KEY to send confirmations.");

// Hosted edge functions keep running work handed to EdgeRuntime.waitUntil after responding.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const form = await req.formData();
    const fields = readFields(form);
    await verifyTurnstile(TURNSTILE_SECRET, text(form, "turnstile_token"));
    await checkSenderLimit(req, fields.p_submission_key);
    const photos = await readPhotos(form);
    const photoId = photos ? crypto.randomUUID() : null;
    const paths = photoId ? [`${photoId}/full.jpg`, `${photoId}/thumb.jpg`] : [];

    let saved: { id: string; repeat: boolean };
    try {
      if (photos) {
        // One at a time: if the first fails, nothing is still in flight when we clean up.
        await store(paths[0], photos.full);
        await store(paths[1], photos.thumb);
      }
      const { data, error } = await supabase.rpc("submit_letter", { ...fields, p_photo_id: photoId });
      if (error) throw error.code === "P0001" ? new BadRequest(error.message) : error;
      saved = data;
    } catch (err) {
      // Only a letter that wasn't saved loses its photo.
      await removePhotos(paths);
      throw err;
    }
    // A retry of a letter already saved (the first try's reply was lost) keeps the first try's photo,
    // so this copy goes. Its emails go again with the same keys, and Resend drops the repeats.
    if (saved.repeat) await removePhotos(paths);
    const letterId = saved.id;
    // The parent doesn't wait on email, and an email that fails never fails the letter.
    const emails = sendLetterEmails(letterId);
    if (edgeRuntime) edgeRuntime.waitUntil(emails);
    else await emails;
    return json({ id: letterId }, 201);
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    // The code and message only: a database error's details repeat the row, the family's words with it.
    const { code, message } = err as { code?: string; message?: string };
    console.error("submit-letter failed:", code ?? "", message ?? String(err));
    // A letter that should have gone through didn't: the editor hears about it in the morning.
    await noteProblem(err instanceof SpamCheckDown ? "spam-check" : "save");
    return json({ error: "Your letter couldn't be sent. Check it and try again in a few minutes." }, 500);
  }
});

// The daily limit by where a letter came from (migration 0010): 30 in a rolling day from one network
// address, counted by a keyed scramble of it, never the address. It backs up the limit per email address,
// which someone rotating addresses walks around. If the count can't be made (no address on the request,
// or the database function isn't there yet), the letter goes through: the form never depends on this.
async function checkSenderLimit(req: Request, submissionKey: string): Promise<void> {
  const address = senderAddress(req.headers);
  if (!address) return;
  const { data: allowed, error } = await supabase.rpc("allow_sender", {
    p_sender_key: await senderKey(address, SECRET_KEY),
    p_submission_key: submissionKey,
  });
  if (error) {
    console.error("The sender limit couldn't be checked:", error.code ?? "", error.message);
    return;
  }
  if (allowed === false) {
    await noteProblem("limit");
    throw new BadRequest(
      "A lot of letters have come from this internet connection today, so we've paused it until tomorrow. " +
        "You can also email your child's letter to editor@wausaupilotandreview.com.",
    );
  }
}

// One line in the editor's morning digest: the kind of trouble and when, nothing about the letter. Never
// throws, and never holds a parent's answer up for long.
async function noteProblem(kind: "spam-check" | "save" | "email" | "limit"): Promise<void> {
  try {
    const { error } = await supabase.rpc("note_form_problem", { p_kind: kind }).abortSignal(AbortSignal.timeout(3_000));
    if (error) console.error("A form problem wasn't noted:", kind, error.code ?? "", error.message);
  } catch (err) {
    console.error("A form problem wasn't noted:", kind, (err as Error).message);
  }
}

// Never throws: every failure is logged, and the letter is already safe in the queue.
async function sendLetterEmails(letterId: string): Promise<void> {
  if (!mailer) return;
  try {
    const { data, error } = await supabase
      .from("letters")
      .select(
        "season_id, first_name, age, town, body, photo_id, seasons(entries_close_at, delivered_at), " +
          "letter_private(parent_name, email)",
      )
      .eq("id", letterId)
      .single();
    if (error) throw error;
    const letter = data as unknown as StoredLetter & { season_id: string };

    const prizes = await supabase
      .from("prizes")
      .select("id", { count: "exact", head: true })
      .eq("season_id", letter.season_id);
    if (prizes.error) throw prizes.error;

    const emails = [
      confirmationEmail(letter, letterId, { mailbag: MAILBAG_PAGE_URL, drawing: (prizes.count ?? 0) > 0 }),
    ];
    const results = await Promise.all(emails.map((email) => mailer(email)));
    results.forEach((result, i) => {
      if (!result.ok) console.error(`Email "${emails[i].subject}" for letter ${letterId} didn't send:`, result.error);
    });
    if (results.some((result) => !result.ok)) await noteProblem("email");
  } catch (err) {
    console.error(`Emails for letter ${letterId} didn't send:`, err);
    await noteProblem("email");
  }
}

async function store(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", cacheControl: CACHE_SECONDS });
  if (error) throw error;
}

async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const removal = await supabase.storage.from(BUCKET).remove(paths);
  if (removal.error) console.error("Could not remove orphaned photos", paths, removal.error);
}

function readFields(form: FormData) {
  return {
    p_first_name: text(form, "first_name"),
    p_age: age(form),
    p_town: text(form, "town"),
    p_body: text(form, "body"),
    p_parent_name: text(form, "parent_name"),
    p_email: text(form, "email"),
    p_consent: flag(form, "consent"),
    p_newsletter_opt_in: flag(form, "newsletter_opt_in"),
    p_submission_key: submissionKey(form),
  };
}

// The form's key for this letter, the same on every try (a retry after a lost reply gets the saved letter back).
function submissionKey(form: FormData): string {
  const value = text(form, "submission_key");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequest("Reload the page and send the letter again.");
  }
  return value;
}

// The photo is optional, but it comes as a pair: the full image and its thumbnail.
async function readPhotos(form: FormData): Promise<{ full: Uint8Array; thumb: Uint8Array } | null> {
  const full = form.get("photo");
  const thumb = form.get("thumb");
  if (full === null && thumb === null) return null;
  return { full: await readPhoto(full, MAX_BYTES.full), thumb: await readPhoto(thumb, MAX_BYTES.thumb) };
}

async function readPhoto(photo: FormDataEntryValue | null, maxBytes: number): Promise<Uint8Array> {
  if (!(photo instanceof File)) throw new BadRequest("The photo didn't come through. Choose it again.");
  if (photo.size > maxBytes) throw new BadRequest(`Photo is larger than ${Math.round(maxBytes / 1024)} KB.`);
  return stripLocationMetadata(new Uint8Array(await photo.arrayBuffer()));
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string") throw new BadRequest(`Missing field: ${name}.`);
  // Browsers send a textarea's line breaks as CRLF; keep them as the form counted them (one each).
  return value.replace(/\r\n?/g, "\n");
}

function flag(form: FormData, name: string): boolean {
  const value = text(form, name);
  if (value !== "true" && value !== "false") throw new BadRequest(`${name} must be true or false.`);
  return value === "true";
}

function age(form: FormData): number {
  const value = text(form, "age");
  if (!/^\d{1,2}$/.test(value)) throw new BadRequest("Choose the child's age.");
  return Number(value);
}
