// "Letters to Santa" for the Morning Update, as email HTML that matches WPR's newsletter templates
// (the same rows the Buck Board's Friday section uses): a 600px content table, 32px gutters, a teal
// section rule, an Oswald eyebrow, Merriweather bylines, Source Sans 3 body, inline styles only.
// Staff save the rows for a morning (migration 0007) and the wpr-newsletter build adds them to that
// morning's edition. With three letters they stay well under the newsletter tool's ~13 KB block limit.
import { apLastDay, apNumber, byline, capitalize, count } from "./format";
import { sponsorHref } from "./sales";
import { logoUrl } from "./storage";
import type { Letter, Season, Sponsor } from "./types";

export const MAX_LETTERS = 3;
// A letter longer than this is cut at a word and continued in the mailbag.
const EXCERPT = 320;

const SANS = "'Source Sans 3',Helvetica,Arial,sans-serif";
const SERIF = "'Merriweather',Georgia,serif";
const OSWALD = "'Oswald','Arial Narrow',Arial,sans-serif";
const TEAL = "#3A867C";
const RED = "#B3261E";

// An opening bracket gets an invisible word joiner after it, so a letter can't form a merge tag
// ("[[…]]") the newsletter would fill in for each subscriber.
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\[/g, "[&#8288;");
}

// Same convention as the newsletter pipeline, so these clicks show up beside its stories.
function withUtm(url: string, edition: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set("utm_source", "newsletter");
  tagged.searchParams.set("utm_medium", "email");
  tagged.searchParams.set("utm_campaign", `letters-to-santa-${edition}`);
  return tagged.toString();
}

// A link to one letter on WPR's page: the UTM tags go before the #, where WordPress's analytics see them.
function letterUrl(mailbagUrl: string, id: string, edition: string): string {
  return `${withUtm(mailbagUrl, edition)}#letter=${id}&from=newsletter`;
}

function excerpt(body: string): { text: string; cut: boolean } {
  if (body.length <= EXCERPT) return { text: body, cut: false };
  const cut = body.slice(0, EXCERPT);
  return { text: `${cut.slice(0, cut.lastIndexOf(" ") > 200 ? cut.lastIndexOf(" ") : EXCERPT).trimEnd()}…`, cut: true };
}

// Logos in email: PNG, JPEG or GIF only (Gmail drops SVG, Outlook drops WebP). Otherwise, the name.
function sponsorMark(sponsor: Sponsor): string {
  const href = sponsorHref(sponsor, "newsletter");
  const logo = sponsor.logo_path && /\.(png|jpe?g|gif)$/i.test(sponsor.logo_path) ? sponsor.logo_path : null;
  const mark = logo
    ? `<img src="${esc(logoUrl(logo))}" alt="${esc(sponsor.name)}" height="32" style="height:32px; width:auto; border:0; vertical-align:middle;">`
    : `<strong style="color:#1a1a1a;">${esc(sponsor.name)}</strong>`;
  return href ? `<a href="${esc(href)}" style="text-decoration:none;">${mark}</a>` : mark;
}

function letterRow(letter: Letter, href: string): string {
  const { text, cut } = excerpt(letter.body);
  return `
        <tr>
          <td class="px" style="padding:12px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; background:#FFFDF8; border-left:3px solid ${RED};">
              <tr>
                <td style="padding:12px 16px;">
                  <p style="margin:0; font-family:${SERIF}; font-size:16px; line-height:1.3; font-weight:700; color:#1a1a1a;">${esc(byline(letter))}</p>
                  <p style="margin:6px 0 0; font-family:${SANS}; font-size:15px; line-height:1.55; color:#333333;">${esc(text).replace(/\n+/g, "<br>")}</p>
                  <p style="margin:6px 0 0; font-family:${SANS}; font-size:14px;"><a href="${esc(href)}" style="color:${TEAL}; font-weight:700; text-decoration:none;">${cut ? "Read the rest" : "See it in the mailbag"}&nbsp;&rarr;</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

export interface NewsletterSection {
  season: Season;
  presenting: Sponsor | undefined;
  picks: Letter[];
  posted: number; // letters posted in the window; picks may be fewer
  total: number; // every letter in the mailbag
  edition: string; // YYYY-MM-DD the newsletter goes out, for utm_campaign
  mailbagUrl: string;
  writeUrl: string;
}

// "YYYY-MM-DD" in Wausau for a timestamp.
function wausauDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(timestamp));
}

// Whether the edition invites letters: its morning falls on a day letters come in. Decided by the
// edition's date, not the day staff save it, so a section saved the evening of the last day doesn't
// invite letters the next morning, once they've closed.
export function invitesLetters(season: Season, edition: string): boolean {
  const lastDay = wausauDate(new Date(Date.parse(season.entries_close_at) - 1).toISOString());
  return edition >= wausauDate(season.entries_open_at) && edition <= lastDay;
}

// The section's rows, for the newsletter's 600px content table.
export function newsletterRows(section: NewsletterSection): string {
  const { season, picks, posted, total, edition } = section;
  const open = invitesLetters(season, edition);
  const intro = [
    `${capitalize(count(posted, "new letter", "new letters"))} went into Santa’s mailbag.`,
    picks.length < posted ? `Here ${picks.length === 1 ? "is one" : `are ${apNumber(picks.length)}`} of them.` : "",
    open ? `Parents and guardians can send their child’s letter through ${apLastDay(season.entries_close_at).replace(" ", "\u00a0")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mailbag = withUtm(section.mailbagUrl, edition);
  const links = open
    ? `<a href="${esc(mailbag)}" style="color:${TEAL}; font-weight:700; text-decoration:none;">${total === 1 ? "Read the letter" : `Read all ${apNumber(total)} letters`}&nbsp;&rarr;</a> &nbsp;&middot;&nbsp; <a href="${esc(withUtm(section.writeUrl.split("#")[0], edition))}#write" style="color:${TEAL}; font-weight:700; text-decoration:none;">Write a letter to Santa&nbsp;&rarr;</a>`
    : `<a href="${esc(mailbag)}" style="color:${TEAL}; font-weight:700; text-decoration:none;">${total === 1 ? "Read the letter" : `Read all ${apNumber(total)} letters`}&nbsp;&rarr;</a>`;

  return `
        <!-- ===================== LETTERS TO SANTA (from the Letters to Santa staff page, ${edition}) ===================== -->
        <tr><td class="px" style="padding:22px 32px 0;"><hr style="border:none; border-top:2px solid ${TEAL}; margin:0;"></td></tr>
        <tr>
          <td class="px oswald" style="padding:10px 32px 0; font-family:${OSWALD}; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#1a1a1a;">Letters to Santa</td>
        </tr>${
          section.presenting
            ? `
        <tr>
          <td class="px" style="padding:8px 32px 0; font-family:${SANS}; font-size:13px; color:#555555;">Presented by ${sponsorMark(section.presenting)}</td>
        </tr>`
            : ""
        }
        <tr>
          <td class="px body" style="padding:8px 32px 0; font-family:${SANS}; font-size:15px; line-height:1.5; color:#333333;">${esc(intro)}</td>
        </tr>${picks.map((letter) => letterRow(letter, letterUrl(section.mailbagUrl, letter.id, edition))).join("")}
        <tr>
          <td class="px" style="padding:14px 32px 6px; text-align:center; font-family:${SANS}; font-size:14px;">${links}</td>
        </tr>`;
}

// One Custom HTML block, for adding the section to a campaign by hand: the rows in their own 600px
// table, as the newsletter pipeline wraps its blocks.
export function wrapBlock(rows: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="width:600px;max-width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;"><tbody>' +
    rows +
    "\n</tbody></table></td></tr></table>"
  );
}
