// Letters to Santa's emails: the confirmation a new form letter sends the parent (replies go to the
// editor), the staff's morning digest of letters waiting for review, and the note a family gets when
// its letter is posted. The confirmation carries nothing typed into the form: anyone who gets past
// the spam check can type any address, and our email mustn't carry their words from santa@ to a stranger.

import type { Email } from "./email.ts";

export interface StoredLetter {
  first_name: string;
  age: number;
  town: string | null;
  body: string;
  photo_id: string | null;
  seasons: { entries_close_at: string; delivered_at: string };
  letter_private: { parent_name: string; email: string };
}

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

// A timestamp as a Wausau calendar day, e.g. "Dec. 23".
export function apDate(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric" })
    .formatToParts(new Date(timestamp));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return `${AP_MONTHS[part("month") - 1]} ${part("day")}`;
}

// Letters close at midnight; people think of the last full day.
export function apLastDay(exclusiveEnd: string): string {
  return apDate(new Date(Date.parse(exclusiveEnd) - 1).toISOString());
}

// "Mia, 6, of Weston", as the mailbag and the article set it. A baby is "under 1".
export function byline(letter: Pick<StoredLetter, "first_name" | "age" | "town">): string {
  const age = letter.age === 0 ? "under 1" : String(letter.age);
  return `${letter.first_name}, ${age}${letter.town ? `, of ${letter.town}` : ""}`;
}

// AP: a singular name ending in s takes only an apostrophe.
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// One simple, readable layout for every email: blocks of HTML, with an optional photo up top.
function page(blocks: string[], photo?: { src: string; alt: string }): string {
  const image = photo
    ? `<p style="margin:0 0 16px"><img src="${escape(photo.src)}" alt="${escape(photo.alt)}" width="320" ` +
      `style="display:block;max-width:100%;height:auto;border-radius:4px;border:0"></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff">` +
    `<div style="max-width:560px;margin:0 auto;border-top:4px solid #b3261e;padding-top:16px;` +
    `font:16px/1.5 Arial,Helvetica,sans-serif;color:#1e2622">${image}${blocks.join("")}</div></body></html>`;
}

function p(html: string): string {
  return `<p style="margin:0 0 16px">${html}</p>`;
}

// Anyone can type any address into the form, so the confirmation carries nothing typed into it: no
// names, no town, no words. It can't be used to send someone's chosen text from santa@ to a stranger.
export function confirmationEmail(
  letter: StoredLetter,
  id: string,
  links: { mailbag: string; drawing: boolean },
): Email {
  const story = `All the letters run together in our ${apDate(letter.seasons.delivered_at)} story`;
  const lines = [
    "Thanks for sending your child’s letter to Santa!",
    "An editor reads every letter before it goes in Santa’s mailbag. We take out last names, street addresses " +
    "and school names, and we keep your child’s spelling just as it was written. When the letter is up, we’ll " +
    "email you a link to it.",
    links.drawing
      ? `Letters in the mailbag are entered in our drawing for prizes from local businesses. ${story}, with the ` +
        "winners, and we email the winners’ parents for a mailing address."
      : `${story}.`,
  ];
  const more = `More children at home? Send their letters anytime through ${
    apLastDay(letter.seasons.entries_close_at)
  }.`;
  const help = "Questions, or need to change something? Just reply to this email.";

  return {
    to: [letter.letter_private.email],
    subject: "We got your child’s letter to Santa",
    idempotencyKey: `santa-letters-${id}-confirmation`,
    text: [
      "Hi there,",
      ...lines,
      `See the mailbag: ${links.mailbag}`,
      more,
      help,
      "Wausau Pilot & Review\nwausaupilotandreview.com",
    ].join("\n\n"),
    html: page([
      p("Hi there,"),
      ...lines.map((line) => p(escape(line))),
      p(`<a href="${escape(links.mailbag)}" style="color:#2c6a62;font-weight:bold">See Santa’s mailbag</a>`),
      p(escape(more)),
      p(escape(help)),
      p(`Wausau Pilot &amp; Review<br><a href="https://wausaupilotandreview.com" style="color:#2c6a62">wausaupilotandreview.com</a>`),
    ]),
  };
}

// A form letter waiting for review, as the staff digest lists it.
export interface WaitingLetter {
  first_name: string;
  age: number;
  town: string | null;
  body: string;
  photo_id: string | null;
  created_at: string;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
// AP: one through nine in words.
function apCount(n: number, one: string, many: string): string {
  return `${n < 10 ? WORDS[n] : n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

// The most letters the digest lists; past this (a flood of junk), it counts the rest.
export const DIGEST_LISTED = 25;

// The staff's morning digest, in place of an email per letter: the form letters waiting for review,
// oldest first, each with the start of its words. One a day: the key is the day.
export function digestEmail(waiting: WaitingLetter[], links: { to: string[]; queue: string; today: string }): Email {
  const count = apCount(waiting.length, "letter", "letters");
  const subject = `${count[0].toUpperCase()}${count.slice(1)} to Santa waiting for review`;
  const unlisted = waiting.length - DIGEST_LISTED;
  const rest = unlisted > 0 ? [`…and ${apCount(unlisted, "more", "more")}.`] : [];
  const lines = waiting.slice(0, DIGEST_LISTED).map((letter) => {
    const start = letter.body.replace(/\s+/g, " ").trim();
    const excerpt = start.length > 140 ? `${start.slice(0, 140).replace(/\s+\S*$/, "")}…` : start;
    const sent = `sent ${apDate(letter.created_at)}${letter.photo_id ? ", with a photo" : ""}`;
    return { head: `${byline(letter)} (${sent})`, excerpt };
  });
  const intro = "Good morning. These letters came in through the form and are waiting for review, oldest first.";

  return {
    to: links.to,
    subject,
    idempotencyKey: `santa-letters-digest-${links.today}`,
    text: [
      intro,
      ...lines.map((line) => `${line.head}: ${line.excerpt}`),
      ...rest,
      `Review them on the staff page: ${links.queue}`,
    ].join("\n\n"),
    html: page([
      p(escape(intro)),
      ...lines.map((line) => p(`<strong>${escape(line.head)}</strong><br>${escape(line.excerpt)}`)),
      ...rest.map((line) => p(escape(line))),
      p(`<a href="${escape(links.queue)}" style="color:#2c6a62;font-weight:bold">Review them on the staff page</a>`),
    ]),
  };
}

// What letter-posted reads from posted_notice() (migration 0005).
export interface PostedNotice {
  first_name: string;
  age: number;
  town: string | null;
  parent_name: string | null;
  email: string;
  entries_close_at: string;
  delivered_at: string;
  // Letters are still coming in (phase_at says open), so the email can invite more.
  open: boolean;
  // This letter is in a drawing: there are prizes and its family isn't a staff household.
  drawing: boolean;
}

// Once staff post the letter: it's up, here's the link to it, share it with family. Sent once.
export function postedEmail(notice: PostedNotice, id: string, links: { letter: string; reply: string }): Email {
  const name = notice.first_name;
  const greeting = notice.parent_name ? notice.parent_name.split(/\s+/)[0] : "there";
  const delivered = apDate(notice.delivered_at);
  const lines = [
    `${possessive(name)} letter to Santa is in our mailbag, under “${byline(notice)}.”`,
    "Grandparents, aunts and uncles love reading these. The link opens the mailbag right at the letter, so it’s easy to pass along.",
    notice.drawing
      ? `The letter is in our drawing for prizes from local businesses. We’ll deliver all the letters to the North Pole and announce the winners on ${delivered}.`
      : `We’ll deliver all the letters to the North Pole on ${delivered}.`,
    ...(notice.open
      ? [`More children at home? Send their letters anytime through ${apLastDay(notice.entries_close_at)}.`]
      : []),
  ];
  const help = "Questions, or want the letter taken down? Just reply to this email.";
  const reply = `Santa wrote ${name} back, too. His reply is ready to print at home`;

  return {
    to: [notice.email],
    subject: `${possessive(name)} letter is in Santa’s mailbag`,
    idempotencyKey: `santa-letters-${id}-posted`,
    text: [
      `Hi ${greeting},`,
      lines[0],
      `Read it: ${links.letter}`,
      lines[1],
      `${reply}: ${links.reply}`,
      ...lines.slice(2),
      help,
      "Wausau Pilot & Review\nwausaupilotandreview.com",
    ]
      .join("\n\n"),
    html: page([
      p(`Hi ${escape(greeting)},`),
      p(escape(lines[0])),
      p(
        `<a href="${escape(links.letter)}" style="display:inline-block;padding:10px 18px;border-radius:999px;` +
          `background:#b3261e;color:#ffffff;font-weight:bold;text-decoration:none">Read ${
            escape(possessive(name))
          } letter</a>`,
      ),
      p(escape(lines[1])),
      p(`${escape(reply)}: <a href="${escape(links.reply)}" style="color:#2c6a62">print Santa’s reply</a>.`),
      ...lines.slice(2).map((line) => p(escape(line))),
      p(escape(help)),
      p(`Wausau Pilot &amp; Review<br><a href="https://wausaupilotandreview.com" style="color:#2c6a62">wausaupilotandreview.com</a>`),
    ]),
  };
}
