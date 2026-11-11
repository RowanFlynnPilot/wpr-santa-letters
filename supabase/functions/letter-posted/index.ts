// POST { letter_id } from a staff browser right after a letter goes up (#/admin: posted from the
// queue, or typed in): emails the parent, once, that the letter is in Santa's mailbag, with a link
// that opens the mailbag at it and one to Santa's reply to print. Families pass the letter's link
// along; every one brings the mailbag readers.
//
// Only staff may call it. It checks the caller's sign-in itself (verify_jwt is off in config.toml,
// since the project's new API keys aren't the legacy JWT secret the gateway checks).
// posted_notice() answers only for a posted letter with an email whose family hasn't been told; the
// send is recorded after Resend accepts it, and Resend drops a repeat of the same key within a day,
// so a double click can't send twice. Without RESEND_API_KEY it does nothing and records nothing.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createMailer } from "../_shared/email.ts";
import { optionalEnv, requireEnv, requireNamedKey } from "../_shared/env.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { postedEmail, type PostedNotice } from "../_shared/letter_emails.ts";

const supabase = createClient(requireEnv("SUPABASE_URL"), requireNamedKey("SUPABASE_SECRET_KEYS", "default"), {
  auth: { persistSession: false },
});
const mailer = createMailer({
  key: optionalEnv("RESEND_API_KEY"),
  from: optionalEnv("EMAIL_FROM") ?? "Wausau Pilot & Review <santa@wausaupilotandreview.com>",
  replyTo: optionalEnv("EMAIL_REPLY_TO") ?? "editor@wausaupilotandreview.com",
  url: optionalEnv("RESEND_API_URL") ?? undefined,
});
// The WordPress Letters to Santa page; embed.js opens the mailbag at #letter=<id>.
const MAILBAG = optionalEnv("MAILBAG_PAGE_URL") ?? "https://wausaupilotandreview.com/letters-to-santa/";
// The app itself, where Santa's reply opens on its own page so it prints as one sheet.
const APP = optionalEnv("APP_URL") ?? "https://rowanflynnpilot.github.io/wpr-santa-letters/";
const LETTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!mailer) console.warn("Email is off: set RESEND_API_KEY to tell families when a letter is posted.");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) return json({ error: "Sign in again." }, 401);
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return json({ error: "Staff only." }, 403);

    const body = await req.json().catch(() => ({}));
    const letterId = typeof body.letter_id === "string" ? body.letter_id.toLowerCase() : "";
    if (!LETTER_ID.test(letterId)) return json({ error: "letter_id must be a letter's id." }, 400);
    if (!mailer) return json({ sent: false, reason: "Email is off." }, 200);

    const { data: notice, error } = await supabase.rpc("posted_notice", { p_letter_id: letterId });
    if (error) throw error;
    if (!notice) return json({ sent: false, reason: "Not posted, no email, or the family was already told." }, 200);

    const email = postedEmail(notice as PostedNotice, letterId, {
      letter: `${MAILBAG}#letter=${letterId}&from=email`,
      reply: `${APP}?letter=${letterId}&from=email#/reply`,
    });
    const result = await mailer(email);
    if (!result.ok) {
      console.error(`Posted email for letter ${letterId} didn't send:`, result.error);
      return json({ sent: false, reason: "The email didn't send." }, 502);
    }
    const { error: markError } = await supabase.rpc("mark_posted_notice", { p_letter_id: letterId });
    if (markError) {
      console.error(`Posted email for letter ${letterId} sent but not recorded:`, markError.code, markError.message);
    }
    return json({ sent: true }, 200);
  } catch (err) {
    // A database error's code and message only: its details can repeat the family's words.
    const { code, message } = err as { code?: string; message?: string };
    console.error("letter-posted failed:", code ?? "", message ?? String(err));
    return json({ error: "The posted email couldn't be sent." }, 500);
  }
});
