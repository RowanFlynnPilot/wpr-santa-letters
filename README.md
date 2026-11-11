# Letters to Santa

Wausau Pilot & Review's holiday mailbag. Parents and guardians send their child's letter to Santa through a form; staff type in the letters that come by email or mail; an editor reviews every form letter before it goes up; the letters fill a mailbag page all season, and each family gets a reply from Santa to print; on delivery day (Dec. 23) the article runs and the prize winners are announced.

- `supabase/`: Postgres schema, RLS, RPCs, the `submit-letter`, `letter-posted` and `staff-digest` edge functions, and pgTAP tests
- `web/`: React/Vite app on GitHub Pages, embedded in WordPress by iframe

Project rules, invariants and operations SQL are in [CLAUDE.md](CLAUDE.md). A draft of the rules page for Shereen is in [RULES.md](RULES.md).

## Local development

```sh
supabase start                       # migrations + the 2026 season seed
supabase test db                     # pgTAP suite
deno test supabase/functions/_shared web/src   # photo metadata, emails, the privacy check

cp supabase/functions/.env.example supabase/functions/.env   # Cloudflare's always-pass Turnstile test secret
supabase functions serve --env-file supabase/functions/.env

cd web
cp .env.example .env.local           # paste the publishable key from `supabase status`
npm install
npm run dev                          # http://localhost:5173/wpr-santa-letters/#/write
```

Views: `#/mailbag`, `#/write` (the form), `#/embed` (the front-page strip), `#/reply` (Santa's reply to one letter, `?letter=<id>#/reply`, to print) and `#/admin` (staff, opened directly). The season seed opens letters Nov. 27; to try the form locally before then, run in the SQL editor `update public.seasons set entries_open_at = now() where year = 2026;`.

## First deploy

Production (live as of Nov. 10, 2026) is Supabase project `vhimfuaproejbxahjgpr` and https://rowanflynnpilot.github.io/wpr-santa-letters/. These are the steps as they actually went, for next year's project or a rebuild. Nothing is shared with the Buck Board but the Resend account and its verified domain: this project has its own Turnstile widget and its own Resend key, so either can be rotated or revoked without touching the other.

1. **Supabase project.** Create it in WPR's Pro organization (about $10 a month in compute beyond the first project; CLAUDE.md, Open decisions). Set `[db].major_version` in `supabase/config.toml` to match it. Under Settings > API Keys, use the publishable and secret keys (create them if the tab offers to); the legacy anon and service_role keys are deprecated by the end of 2026, inside this season.
2. **Turnstile: a new widget.** Cloudflare dashboard > Turnstile > Add widget: mode Managed, hostname `rowanflynnpilot.github.io` (the form runs inside that frame, not on wausaupilotandreview.com). Keep the site key for step 3 and the secret for step 6.
3. **GitHub secrets and variables, before the first push.** Every PR runs CI (the web build needs the `VITE_` variables), and a merge to `main` deploys with the secrets, so both go in first. Settings > Secrets and variables > Actions:
   - Secrets: `SUPABASE_ACCESS_TOKEN` (a personal access token from supabase.com/dashboard/account/tokens), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
   - Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MAILBAG_PAGE_URL` (https://wausaupilotandreview.com/letters-to-santa/), `VITE_WRITE_PAGE_URL` (the same address with `#write`), `VITE_RULES_URL` (Shereen's rules page), `VITE_TURNSTILE_SITE_KEY` (step 2).
   - Settings > Pages: source "GitHub Actions".

   Changing a variable later deploys nothing by itself: run Pages from the Actions tab afterward.
4. **Email sign-in.** Authentication > Sign In / Providers > Email: turn off "Allow new users to sign up" (staff accounts are made by hand), set **Email OTP length to 6** (a new project defaults to 8 digits; the sign-in page says 6 and accepts only 6, `pattern="\d{6}"` in `web/src/views/Admin.tsx`), and Email OTP Expiration to 900 seconds (the email says the code lasts 15 minutes; the default is an hour). Authentication > SMTP: custom SMTP through Resend (`smtp.resend.com`, port 465, user `resend`, a Resend API key as the password, sender santa@ or editor@ on `send.wausaupilotandreview.com`). Supabase's built-in sender only reaches members of the Supabase organization.
5. **The sign-in template, through the Management API.** The template is the one the dashboard now calls **"Magic link or OTP"** (Authentication > Emails), but saving `supabase/templates/magic_link.html` there didn't take. Set it, and the code settings from step 4, with the Management API and the step 3 access token instead (Node 18+, any shell):
   ```sh
   SUPABASE_ACCESS_TOKEN=<token> node scripts/push-auth-config.mjs vhimfuaproejbxahjgpr
   ```
   It sends `supabase/templates/magic_link.html` with the subject "Your Letters to Santa sign-in code", code length 6 and expiry 900 seconds, then reads the project back and exits non-zero unless all three stuck. In PowerShell, set the token first with `$env:SUPABASE_ACCESS_TOKEN = '<token>'`.
   Then sign in once at `#/admin` and check the email is WPR's, with a 6-digit code.
6. **Function secrets.** `supabase secrets set ALLOWED_ORIGIN=https://rowanflynnpilot.github.io TURNSTILE_SECRET_KEY=<the step 2 secret>`

   **Optional: reading mailed letters.** Once Shereen agrees (CLAUDE.md, invariant 24): an API key from https://platform.claude.com/ (WPR's own Anthropic organization; Settings > API Keys, one key named for this project, with a monthly spend limit), then `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`. Without it, Add a letter says reading is off and staff type letters in. See Reading a mailed letter.
7. **Emails: a new Resend key.** Resend > API Keys > Create, named for this project ("Sending access" is all it needs), then `supabase secrets set RESEND_API_KEY=re_...`. The emails: a confirmation to the parent when a form letter arrives; when a letter with an email goes up, a note to the parent that links to it and to Santa's reply; and each morning at 7, a digest to the editor of the letters waiting for review, none when nothing waits; replies to the first two reach the editor. Defaults, each overridable with a secret of the same name: `EMAIL_FROM` "Wausau Pilot & Review <santa@wausaupilotandreview.com>", `EMAIL_REPLY_TO` editor@, `STAFF_EMAILS` editor@ (comma-separated, the digest's recipients), `STAFF_PAGE_URL` the `#/admin` page, `MAILBAG_PAGE_URL` the WordPress page, `APP_URL` https://rowanflynnpilot.github.io/wpr-santa-letters/ (where Santa's reply opens). Without the key, letters save and nothing is sent. Each form letter sends two emails over its life (one when it arrives, one when it's posted), plus one digest a morning; a separate key doesn't separate the quota, so the Buck Board still shares the Resend plan's daily limit (100 on the free plan). All three functions read the same secrets.
8. **Deploy.** Merge to `main` through a PR (never a direct push; CLAUDE.md). CI tests, pushes migrations, deploys the functions and publishes the web app, but each deploy runs only when its own files changed, so for a first deploy run Supabase and Pages by hand from the Actions tab (from `main`). From here on, migrations 0001–0008 are applied and never edited (CLAUDE.md, invariant 23).
9. **The season and the digest's Vault secrets.** In the SQL editor, run `supabase/seasons/2026.sql` once. Then give the morning digest's job the project's address and secret key through the dashboard's **Vault screen** (Integrations > Vault > Secrets > Add new secret), not with `vault.create_secret` in the SQL editor as migration 0008's comment says. The names must be exact; the job looks them up by name:
   - `santa_project_url`: `https://vhimfuaproejbxahjgpr.supabase.co`
   - `santa_secret_key`: the secret key from Settings > API Keys (it never goes in the repo)

   Check them and both jobs the migrations scheduled:
   ```sql
   select name from vault.secrets where name in ('santa_project_url', 'santa_secret_key');   -- two rows
   select jobname, schedule from cron.job;   -- santa-letters-forget-families, santa-letters-staff-digest
   ```
10. **Staff.** Authentication > Users > Add user (auto-confirm, any long password): `editor@wausaupilotandreview.com` for Shereen and `rowan.flynn@wausaupilotandreview.com`, then insert both into `staff` (CLAUDE.md, Operations). Shereen signs in at https://rowanflynnpilot.github.io/wpr-santa-letters/#/admin with editor@; the 6-digit code arrives in that inbox, so anyone who reads editor@ can sign in, and the morning digest lands there too, with a link to the same page. Sponsors and prizes go in as Chris closes them (CLAUDE.md, Operations).
11. **Before Nov. 27**, with the season's dates moved to open (CLAUDE.md, Operations): one real letter from an iPhone, photo included, through the WordPress page; check the confirmation arrives, and the next morning, the digest naming it; post it in `#/admin` and check the family's note arrives, its link opens the letter and its Santa's reply link opens a reply that prints on one page; then take it down and put the dates back. A digest can be sent sooner by running the job's command (`select command from cron.job where jobname = 'santa-letters-staff-digest';`) in the SQL editor.

## Reading a mailed letter

`#/admin` > Add a letter: add the photo or scan first, then **Read the letter for me**. Claude (`claude-opus-5-5`, through the `transcribe-letter` function) reads the child's handwriting and fills in the boxes that are still blank: first name, age and town if the letter says them, the letter in the child's own spelling, and, for a mailed letter, a return address it can see (private, for the prize drawing). Then:

- Check every word against the photo. A word Claude couldn't read is marked `[?]`; the letter can't be added until each one is fixed.
- **Not for the mailbag** lists any last name, address, phone, email, school or teacher Claude found in the letter, each with **Take it out**. The usual privacy check still runs under the letter box.
- If the photo itself shows an address, a full name or a face (an envelope in the shot, say), the page says so: remove the photo, or take a new one that leaves it out.
- Nothing is saved until Add to the mailbag, exactly as for a typed letter.

**Trying it first.** `scripts/read-letters.ts` reads every photo in `samples/` (gitignored: children's letters never go in the repo) with the same request staff will make, prints each reading with its cost, and saves `samples/readings.json`. Put the key in `supabase/functions/.env` as `ANTHROPIC_API_KEY=...`, then:

```sh
deno run --env-file=supabase/functions/.env --allow-env --allow-read=samples --allow-write=samples --allow-run=ffmpeg --allow-net=api.anthropic.com scripts/read-letters.ts samples
```

What it sends: the 1600px JPEG the browser already made (upright, no location or other metadata) to Anthropic's API, nothing else; the function keeps no copy and logs only how many tokens the reading used. Each reading takes 10 to 20 seconds and costs 3 to 5 cents (measured on four sample letters, Nov. 10). If Claude declines or can't read a page, staff type it in as before.

## WordPress embed

The mailbag lives on one WordPress page, https://wausaupilotandreview.com/letters-to-santa/, in a single frame that shows the mailbag or the form. That page holds the 2024 letters today; move them to a dated post first (as 2022's were), so the address can be the mailbag's.

**The page holds only an iframe, no script.** WPR's server firewall refuses a page save with script in it. Paste into a **Custom HTML** block, from a plain-text source, then purge the page in LiteSpeed:

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-santa-letters/#/mailbag" title="Letters to Santa" style="width:100%;height:88vh;min-height:640px;border:0;display:block" allow="clipboard-write; web-share" data-no-lazy="1"></iframe>
```

The frame scrolls inside itself, and the mailbag's Write a letter to Santa button opens the form inside the frame, so the page needs nothing else. `data-no-lazy="1"` keeps LiteSpeed from blanking the frame until the reader scrolls. `allow` lets a letter's Share button open the phone's share sheet or copy the link.

**Site-wide: `embed.js`.** Install it before the first letter goes up. The Buck Board's host script is already in the site's header or footer code; this one sits beside it, added once by an administrator:

```html
<script src="https://rowanflynnpilot.github.io/wpr-santa-letters/embed.js" defer data-no-optimize="1"></script>
```

With it, the frame is sized to the mailbag (no inner scrollbar), the page scrolls to the top of the frame when the form gives way to its confirmation, `/letters-to-santa/#write` (for promos, the newsletter and social posts) opens the form, and `/letters-to-santa/#letter=<id>` opens the mailbag at that letter. Every link to one letter has that form: the posted email, Share, the front-page strip and the newsletter block. Without the script the page still works, but those links land at the top of the mailbag. No other anchor moves the frame, so a half-written letter survives a click on `#comments`.

For the sales pitch, `https://rowanflynnpilot.github.io/wpr-santa-letters/?demo#/mailbag` puts "Your business here" on the stamp while the presenting slot is unsold, under a ribbon that explains the preview, and `?demo#/write` is the form to try out: it works as it will for parents but sends nothing, and ends on the letter as the mailbag would show it.

## Front-page strip

A band for the front page, beside the Buck Board's: the title, a line for the season (when letters open; how many so far and the deadline; when they go to the North Pole; on delivery day, read them all and see who won), the stamp, two buttons and as many of the newest four letters as fit whole (two across a typical front-page column, one on a phone). Each letter opens itself in the mailbag; every link leaves for the Letters to Santa page. Where it goes on the front page is Shereen's call. Paste into a Custom HTML block, then purge the page:

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-santa-letters/#/embed" title="Letters to Santa" style="width:100%;height:max(340px,calc(620px - 40vw));border:0;display:block" loading="lazy"></iframe>
```

The height grows as the column narrows (the words stack above the letters on a phone), and the strip fits that frame at every width from 320px up, never scrolling sideways; only at very large text sizes does it scroll inside its frame. It needs no script.

## Newsletter

`#/admin` > Newsletter makes the Morning Update's Letters to Santa section, and the newsletter build picks it up on its own: there's nothing to paste. Pick the morning (tomorrow by default), see the letters that went up since 6 a.m. the day before, starting with the newest three the privacy check doesn't flag ticked (a flagged letter shows what was found and goes in only if you tick it; tick others to swap them in), and Save for that morning. The build, about 7 a.m., reads the section saved for that day with the publishable key; readers can't see it before then, and if a letter in it comes down first, the section is left out. Save by the evening before (the page refuses a morning after 6:45 a.m. that day); Take it out of that morning removes it. Editing a letter that's in a saved section takes the section out, so the newsletter can't carry the old words; save that morning again. The section matches the Buck Board's Friday block (600px, WPR's newsletter fonts and colors), names the presenting sponsor, links each letter into the mailbag and ends with Read all the letters (and, while letters are open, Write a letter to Santa). Its links carry `utm_campaign=letters-to-santa-<date>` so Plausible can count newsletter readers. For a special send the build doesn't make, Copy HTML is under "Adding it to a campaign by hand instead".

In `wpr-newsletter` (the `santa-letters-section` change): set `SANTA_LETTERS_SECTIONS` to `https://<project-ref>.supabase.co/rest/v1/newsletter_sections` and `SANTA_LETTERS_KEY` to the publishable key in `build_newsletter.py`. Until they're set, the build leaves the section out and sends as usual.

## Santa's reply

The family's note when a letter goes up links to a reply from Santa: one page of North Pole stationery, addressed to the child by first name and town, postmarked the day it's printed, with the presenting sponsor's stamp. It promises nothing (no gifts) and, for children 4 and under, thanks the grown-up who helped. Staff open the same page from any letter In the mailbag (Santa's reply to print): for a mailed letter, print it and mail it back. Plausible counts `Santa Reply Opened` and `Santa Reply Printed`, by where the link came from, never which letter.
