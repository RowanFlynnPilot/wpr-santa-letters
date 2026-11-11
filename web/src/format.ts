import type { Letter } from "./types";

// AP style: abbreviate Jan., Feb., Aug., Sept., Oct., Nov., Dec.; spell out the rest.
const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const CHICAGO = "America/Chicago";

// A timestamp shown as a Wausau calendar day, e.g. "Dec. 23".
export function apDate(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, month: "numeric", day: "numeric" }).formatToParts(
    new Date(timestamp),
  );
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = parts.find((p) => p.type === "day")?.value;
  return `${AP_MONTHS[month - 1]} ${day}`;
}

// Letters close at midnight; readers think in terms of the last full day.
export function apLastDay(exclusiveEnd: string): string {
  return apDate(new Date(Date.parse(exclusiveEnd) - 1).toISOString());
}

// Ages a parent picks from: 0 is a baby under 1.
export const AGES = Array.from({ length: 18 }, (_, age) => age);

export function ageLabel(age: number): string {
  return age === 0 ? "under 1" : String(age);
}

// "Mia, 6, of Weston": the mailbag's and the article's byline (AP: age set off by commas).
export function byline(letter: Pick<Letter, "first_name" | "age" | "town">): string {
  return `${letter.first_name}, ${ageLabel(letter.age)}${letter.town ? `, of ${letter.town}` : ""}`;
}

// Prize descriptions are written to follow "wins" ("a family pizza night"); a list item starts with a capital.
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// AP: a singular name ending in s takes only an apostrophe.
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

// AP numbers: one through nine in words, 10 and up in figures ("three letters", "72 letters").
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export function apNumber(n: number): string {
  return n < 10 ? WORDS[n] : n.toLocaleString("en-US");
}
export function count(n: number, one: string, many: string): string {
  return `${apNumber(n)} ${n === 1 ? one : many}`;
}

// AP series: "Mia, Si and Ethan" (no Oxford comma).
export function series(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// A letter's paragraphs as the mailbag shows them: blank lines separate paragraphs, and runs of them
// count as one. The words are stored exactly as sent.
export function paragraphs(body: string): string[] {
  return body.split(/\n[ \t]*(?:\n[ \t]*)+/).map((p) => p.trim()).filter(Boolean);
}
