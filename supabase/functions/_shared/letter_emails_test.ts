import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  apLastDay,
  byline,
  confirmationEmail,
  digestEmail,
  possessive,
  postedEmail,
  type StoredLetter,
} from "./letter_emails.ts";

const LETTER: StoredLetter = {
  first_name: "Mia",
  age: 6,
  town: "Weston",
  body: "Dear Santa,\nI want a sled & a <puppy>.\nLove, Mia",
  photo_id: "0b6f0d0e-0000-4000-8000-000000000001",
  seasons: { entries_close_at: "2026-12-19T06:00:00Z", delivered_at: "2026-12-23T12:00:00Z" },
  letter_private: { parent_name: "Pat Parent", email: "pat@example.com" },
};

Deno.test("bylines read as the mailbag sets them", () => {
  assertEquals(byline(LETTER), "Mia, 6, of Weston");
  assertEquals(byline({ ...LETTER, town: null }), "Mia, 6");
  assertEquals(byline({ ...LETTER, first_name: "Theo", age: 0 }), "Theo, under 1, of Weston");
  assertEquals(possessive("Mia"), "Mia’s");
  assertEquals(possessive("Silas"), "Silas’");
});

Deno.test("letters close at midnight: the last day is the day before", () => {
  assertEquals(apLastDay("2026-12-19T06:00:00Z"), "Dec. 18");
});

Deno.test("the confirmation goes to the parent, says what happens next, and carries nothing typed into the form", () => {
  const email = confirmationEmail(LETTER, "id-1", { mailbag: "https://example.com/mailbag", drawing: true });
  assertEquals(email.to, ["pat@example.com"]);
  assertEquals(email.replyTo, undefined);
  assertEquals(email.subject, "We got your child’s letter to Santa");
  assertEquals(email.idempotencyKey, "santa-letters-id-1-confirmation");
  assertStringIncludes(email.text, "Hi there,");
  assertStringIncludes(email.text, "we’ll email you a link to it");
  assertStringIncludes(email.text, "our Dec. 23 story, with the winners");
  assertStringIncludes(email.text, "anytime through Dec. 18");
  assertStringIncludes(email.html, 'href="https://example.com/mailbag"');

  // Whatever someone types, none of it reaches the stranger whose address they typed.
  const crafted = confirmationEmail(
    {
      ...LETTER,
      first_name: "Claim at evil.example",
      town: "Call 715-555-0100",
      letter_private: { parent_name: "https://evil.example/prize Smith", email: "victim@example.com" },
    },
    "id-2",
    { mailbag: "https://example.com/mailbag", drawing: true },
  );
  for (const part of [crafted.subject, crafted.text, crafted.html]) {
    for (const typed of ["evil", "715", "Smith", "Mia", "Pat", "Weston", "sled"]) assert(!part.includes(typed), typed);
  }
});

Deno.test("with no prizes, the confirmation promises no drawing", () => {
  const email = confirmationEmail(LETTER, "id-1", { mailbag: "https://example.com/mailbag", drawing: false });
  assert(!email.text.includes("drawing"));
  assertStringIncludes(email.text, "All the letters run together in our Dec. 23 story.");
});

Deno.test("the morning digest lists the waiting letters, oldest first, once a day", () => {
  const waiting = [
    {
      first_name: "Mia",
      age: 6,
      town: "Weston",
      body: "Dear Santa,\nI want a sled.",
      photo_id: "p1",
      created_at: "2026-12-01T15:00:00Z",
    },
    {
      first_name: "Si",
      age: 4,
      town: null,
      body: "x ".repeat(120),
      photo_id: null,
      created_at: "2026-12-02T15:00:00Z",
    },
    { first_name: "Jo", age: 5, town: null, body: "Dear Santa", photo_id: null, created_at: "2026-12-02T16:00:00Z" },
  ];
  const email = digestEmail(waiting, {
    to: ["editor@example.com"],
    queue: "https://example.com/#/admin",
    today: "2026-12-03",
  });
  assertEquals(email.to, ["editor@example.com"]);
  assertEquals(email.subject, "Three letters to Santa waiting for review");
  assertEquals(email.idempotencyKey, "santa-letters-digest-2026-12-03");
  assertStringIncludes(email.text, "Mia, 6, of Weston (sent Dec. 1, with a photo): Dear Santa, I want a sled.");
  assertStringIncludes(email.text, "Si, 4 (sent Dec. 2): x x");
  assert(email.text.indexOf("Mia") < email.text.indexOf("Jo"));
  assert(!email.text.includes("x ".repeat(80)), "a long letter is cut");
  assertStringIncludes(email.html, 'href="https://example.com/#/admin"');
  assertEquals(
    digestEmail(waiting.slice(0, 1), { to: [], queue: "q", today: "2026-12-03" }).subject,
    "One letter to Santa waiting for review",
  );
});

Deno.test("a flood of letters: the digest lists 25 and counts the rest", () => {
  const waiting = Array.from({ length: 30 }, (_, i) => ({
    first_name: `Kid${i}`,
    age: 7,
    town: null,
    body: "Dear Santa",
    photo_id: null,
    created_at: "2026-12-01T15:00:00Z",
  }));
  const email = digestEmail(waiting, { to: [], queue: "q", today: "2026-12-03" });
  assertEquals(email.subject, "30 letters to Santa waiting for review");
  assertStringIncludes(email.text, "Kid24, 7");
  assert(!email.text.includes("Kid25, 7"));
  assertStringIncludes(email.text, "…and five more.");
  assertStringIncludes(email.html, "…and five more.");
});

Deno.test("the digest escapes what families typed", () => {
  const email = digestEmail(
    [{
      first_name: "<b>Mia</b>",
      age: 6,
      town: null,
      body: "<script>x</script>",
      photo_id: null,
      created_at: "2026-12-01T15:00:00Z",
    }],
    { to: [], queue: "q", today: "2026-12-03" },
  );
  assert(!email.html.includes("<b>Mia</b>") && !email.html.includes("<script>"));
});

const NOTICE = {
  first_name: "Mia",
  age: 6,
  town: "Weston",
  parent_name: "Pat Parent",
  email: "pat@example.com",
  entries_close_at: "2026-12-19T06:00:00Z",
  delivered_at: "2026-12-23T12:00:00Z",
  open: true,
  drawing: true,
};

Deno.test("the posted email links to the letter and Santa's reply, and mentions the drawing while there is one", () => {
  const link = "https://example.com/letters-to-santa/#letter=id-1&from=email";
  const reply = "https://example.com/app/?letter=id-1&from=email#/reply";
  const email = postedEmail(NOTICE, "id-1", { letter: link, reply });
  assertEquals(email.to, ["pat@example.com"]);
  assertEquals(email.subject, "Mia’s letter is in Santa’s mailbag");
  assertEquals(email.idempotencyKey, "santa-letters-id-1-posted");
  assertStringIncludes(email.text, "Hi Pat,");
  assertStringIncludes(email.text, "in our mailbag, under “Mia, 6, of Weston.”");
  assertStringIncludes(email.text, `Read it: ${link}`);
  assertStringIncludes(email.text, "announce the winners on Dec. 23");
  assertStringIncludes(email.text, "through Dec. 18");
  assertStringIncludes(email.html, `href="${link.replace("&", "&amp;")}"`);
  assertStringIncludes(email.text, `Santa wrote Mia back, too. His reply is ready to print at home: ${reply}`);
  assertStringIncludes(email.html, `href="${reply.replace("&", "&amp;")}"`);

  const late = postedEmail({ ...NOTICE, parent_name: null, open: false, drawing: false }, "id-2", {
    letter: link,
    reply,
  });
  assertStringIncludes(late.text, "Hi there,");
  assert(!late.text.includes("drawing") && !late.text.includes("More children"));
});

Deno.test("the digest reports the form's trouble, in plain words, and leads with it when no letters wait", () => {
  const links = { to: ["editor@example.com"], queue: "https://example.com/#/admin", today: "2026-12-05" };
  const quiet = digestEmail([], links, { "spam-check": 3, email: 1 });
  assertEquals(quiet.subject, "Letters to Santa: the letter form had trouble yesterday");
  assertStringIncludes(quiet.text, "No letters are waiting for review.");
  assertStringIncludes(quiet.text, "The spam check couldn’t be reached three times.");
  assertStringIncludes(quiet.text, "A confirmation email didn’t send once.");
  assert(!quiet.text.includes("couldn’t be saved"));
  // Same day, same key: a second call that morning still sends nothing more.
  assertEquals(quiet.idempotencyKey, "santa-letters-digest-2026-12-05");

  const waiting = [{
    first_name: "Mia",
    age: 6,
    town: "Weston",
    body: "Dear Santa",
    photo_id: null,
    created_at: "2026-12-04T15:00:00Z",
  }];
  const busy = digestEmail(waiting, links, { limit: 2, save: 12 });
  assertEquals(busy.subject, "One letter to Santa waiting for review, and the form had trouble");
  assertStringIncludes(busy.text, "reached the daily limit of 30 letters twice");
  assertStringIncludes(busy.text, "A letter couldn’t be saved 12 times.");
  assertStringIncludes(busy.html, "Since yesterday morning, the letter form had trouble:");
  // With no trouble, the digest is exactly what it was.
  assertEquals(digestEmail(waiting, links, {}).subject, "One letter to Santa waiting for review");
  assert(!digestEmail(waiting, links).text.includes("trouble"));
});
