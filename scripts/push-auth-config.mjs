// Sets the staff sign-in email and code settings on a hosted project through Supabase's Management API,
// since saving the "Magic link or OTP" template in the dashboard didn't take (README, First deploy, step 5).
//
//   SUPABASE_ACCESS_TOKEN=<personal access token> node scripts/push-auth-config.mjs <project-ref>
//
// Prints what the project holds afterward. Node 18 or later (built-in fetch).
import { readFile } from "node:fs/promises";

const ref = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=<token> node scripts/push-auth-config.mjs <project-ref>");
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const html = await readFile(new URL("../supabase/templates/magic_link.html", import.meta.url), "utf8");

const patch = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    mailer_subjects_magic_link: "Your Letters to Santa sign-in code",
    mailer_templates_magic_link_content: html,
    mailer_otp_length: 6, // a new project defaults to 8; the page and the email say 6
    mailer_otp_exp: 900, // the email says the code lasts 15 minutes
  }),
});
if (!patch.ok) {
  console.error(`PATCH failed: ${patch.status} ${await patch.text()}`);
  process.exit(1);
}

const config = await (await fetch(url, { headers })).json();
const same = config.mailer_templates_magic_link_content === html;
console.log({
  subject: config.mailer_subjects_magic_link,
  otp_length: config.mailer_otp_length,
  otp_exp: config.mailer_otp_exp,
  template: same ? "matches supabase/templates/magic_link.html" : "DIFFERS from supabase/templates/magic_link.html",
});
if (!same || config.mailer_otp_length !== 6 || config.mailer_otp_exp !== 900) process.exit(1);
