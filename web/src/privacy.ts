// What a child's letter shouldn't carry into a public mailbag: a street address, a phone number, an
// email or web address, a school or teacher, or a full name. A rough check, written to over-flag
// rather than miss: it nudges the parent on the form and tells the editor where to look. An editor
// still reads every letter. No imports, so Deno can test it as it is (privacy_test.ts).

export interface PrivacyFlag {
  what: string; // "a street address"
  sample: string; // the words that tripped it, as written
}

const STREET = "(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place|cir|circle|pkwy|parkway|hwy|highway|trl|trail)";

const CHECKS: [what: string, pattern: RegExp][] = [
  ["a street address", new RegExp(String.raw`\b\d{1,6}\s+(?:[nsew]\.?\s+)?(?:[a-z0-9]+\s+){0,3}${STREET}\b\.?`, "i")],
  ["a phone number", /(?:\(?\b\d{3}\)?[\s.-]?)?\b\d{3}[\s.-]\d{4}\b|\b\d{10}\b/],
  ["an email address", /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ["a web address", /\b(?:https?:\/\/|www\.)\S+/i],
  // A capitalized name before the kind of school; "school" itself only capitalized, so "My school is fun" passes.
  [
    "a school",
    /\b(?:[A-Z][\w'’.-]*\s+){1,3}(?:[Ee]lementary|[Mm]iddle|[Hh]igh [Ss]chool|School|[Aa]cademy|[Pp]reschool|[Mm]ontessori)\b/,
  ],
  // "Mrs. Olson", "mrs olson"; "Miss" only before a capitalized name, so "I miss my dog" passes.
  ["a teacher’s name", /\b(?:[Mm]rs|[Mm]r|[Mm]s)\.?\s+[A-Za-z]{2,}|\bMiss\s+[A-Z][a-z]+/],
];

// The child's first name followed by a capitalized word is likely a last name ("Emma Johnson", "EMMA
// JOHNSON"), but not "Mia Claus" or a sign-off ("Mia Love"). So is a second word in the name box.
const NOT_SURNAMES = new Set(["Claus", "Santa", "Love", "And", "The", "Merry", "Christmas", "Xoxo", "Thank", "Thanks"]);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function privacyFlags(body: string, firstName: string): PrivacyFlag[] {
  const flags: PrivacyFlag[] = [];
  for (const [what, pattern] of CHECKS) {
    const match = pattern.exec(body);
    if (match) flags.push({ what, sample: match[0].trim() });
  }
  const names = firstName.trim().split(/\s+/).filter(Boolean);
  if (names.length > 1) {
    flags.push({ what: "a full name", sample: names.join(" ") });
  } else if (names.length === 1) {
    // The first name in any capitals, then a word that's capitalized or all capitals.
    const first = [...names[0]].map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : escapeRegex(c)))
      .join("");
    const pattern = new RegExp(String.raw`\b${first}\s+([A-Z][a-z]{2,}|[A-Z]{3,})\b`, "g");
    for (const match of body.matchAll(pattern)) {
      const word = match[1][0] + match[1].slice(1).toLowerCase();
      if (!NOT_SURNAMES.has(word)) {
        flags.push({ what: "a full name", sample: match[0] });
        break;
      }
    }
  }
  return flags;
}

// "a phone number (“715-555-0199”) and a school (“Riverview Elementary”)", in an AP series.
export function describeFlags(flags: PrivacyFlag[]): string {
  const series = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  return series(flags.map((flag) => `${flag.what} (“${flag.sample.length > 40 ? `${flag.sample.slice(0, 40)}…` : flag.sample}”)`));
}
