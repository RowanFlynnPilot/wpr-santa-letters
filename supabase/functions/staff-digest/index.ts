// The staff's morning digest. At 7 a.m. pg_cron calls this (migration 0008) and it emails the editor
// the form letters waiting for review, oldest first, and any trouble the letter form had since yesterday
// morning (migration 0010); nothing when there's neither. It replaces an email
// per letter: one email a morning for the editor, and Resend's daily limit goes further.
//
// Only the cron job may call it: the job sends the project's secret key, kept in Vault, in the apikey
// header (a secret key isn't a JWT, so not as a bearer token), and nothing else is accepted (verify_jwt
// is off in config.toml, as for the other functions). Resend drops a
// second send the same day (the key is the date), so a repeat call can't send twice.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createMailer } from "../_shared/email.ts";
import { optionalEnv, requireEnv, requireNamedKey } from "../_shared/env.ts";
import { digestEmail, type FormProblems, type WaitingLetter } from "../_shared/letter_emails.ts";

const SECRET_KEY = requireNamedKey("SUPABASE_SECRET_KEYS", "default");
const supabase = createClient(requireEnv("SUPABASE_URL"), SECRET_KEY, { auth: { persistSession: false } });
const mailer = createMailer({
  key: optionalEnv("RESEND_API_KEY"),
  from: optionalEnv("EMAIL_FROM") ?? "Wausau Pilot & Review <santa@wausaupilotandreview.com>",
  replyTo: optionalEnv("EMAIL_REPLY_TO") ?? "editor@wausaupilotandreview.com",
  url: optionalEnv("RESEND_API_URL") ?? undefined,
});
const STAFF_EMAILS = (optionalEnv("STAFF_EMAILS") ?? "editor@wausaupilotandreview.com")
  .split(",").map((address) => address.trim()).filter(Boolean);
const STAFF_PAGE_URL = optionalEnv("STAFF_PAGE_URL") ?? "https://rowanflynnpilot.github.io/wpr-santa-letters/#/admin";

// Today in Wausau, "YYYY-MM-DD".
function wausauToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (req.headers.get("apikey") !== SECRET_KEY) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }

  try {
    const season = await supabase.from("seasons").select("id").eq("is_active", true).maybeSingle();
    if (season.error) throw season.error;
    if (!season.data) return Response.json({ sent: false, reason: "There is no season." }, { status: 200 });

    const waiting = await supabase
      .from("letters")
      .select("first_name, age, town, body, photo_id, created_at")
      .eq("season_id", season.data.id)
      .eq("status", "pending")
      .order("created_at");
    if (waiting.error) throw waiting.error;
    // What went wrong on the form in the last day, counted by kind. If that can't be read (the table is
    // newer than this function), the digest goes out as it always has.
    const problems: FormProblems = {};
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const noted = await supabase.from("form_problems").select("kind").gte("created_at", since);
    if (noted.error) console.error("Form problems couldn't be read:", noted.error.code ?? "", noted.error.message);
    for (const { kind } of (noted.data ?? []) as { kind: keyof FormProblems }[]) {
      problems[kind] = (problems[kind] ?? 0) + 1;
    }
    const troubled = Object.keys(problems).length > 0;
    if (waiting.data.length === 0 && !troubled) {
      return Response.json({ sent: false, reason: "Nothing is waiting." }, { status: 200 });
    }
    if (!mailer) return Response.json({ sent: false, reason: "Email is off." }, { status: 200 });

    const email = digestEmail(waiting.data as WaitingLetter[], {
      to: STAFF_EMAILS,
      queue: STAFF_PAGE_URL,
      today: wausauToday(),
    }, problems);
    const result = await mailer(email);
    if (!result.ok) {
      console.error("The digest didn't send:", result.error);
      return Response.json({ error: "The digest didn't send." }, { status: 502 });
    }
    return Response.json({ sent: true, waiting: waiting.data.length, problems }, { status: 200 });
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    console.error("staff-digest failed:", code ?? "", message ?? String(err));
    return Response.json({ error: "The digest couldn't be put together." }, { status: 500 });
  }
});
