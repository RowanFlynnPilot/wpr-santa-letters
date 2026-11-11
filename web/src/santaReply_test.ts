// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { hashOf } from "./looks.ts";
import { santaReply } from "./santaReply.ts";

const emma = { first_name: "Emma", age: 7, town: "Wausau" };
const words = (reply: ReturnType<typeof santaReply>) => [...reply.paragraphs, reply.postscript].join(" ");

Deno.test("a letter's reply is the same every time it's opened or printed", () => {
  const id = "00a3f837-005a-426c-afd9-01b6a67c5b73";
  assertEquals(santaReply(emma, hashOf(id)), santaReply(emma, hashOf(id)));
});

Deno.test("brothers and sisters almost never get the same reply", () => {
  let same = 0;
  for (let i = 0; i < 400; i++) {
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    if (words(santaReply(emma, hashOf(a))) === words(santaReply(emma, hashOf(b)))) same++;
  }
  // 256 replies in all: two letters match about once in 256 pairs.
  assert(same <= 8, `${same} of 400 pairs matched`);
  // And every version of every part is in use.
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    const reply = santaReply(emma, hashOf(crypto.randomUUID()));
    reply.paragraphs.forEach((p, part) => seen.add(`${part}:${p}`));
    seen.add(`ps:${reply.postscript}`);
  }
  assertEquals(seen.size, 16);
});

Deno.test("no version promises anything: no gifts, no visit, nothing about what was asked for", () => {
  for (let n = 0; n < 256; n++) {
    // Each part's four versions, in every combination's worth of slices.
    const reply = santaReply(emma, (n & 3) | (((n >> 2) & 3) << 8) | (((n >> 4) & 3) << 16) | (((n >> 6) & 3) << 24));
    const text = words(reply);
    assert(
      !/\b(gifts?|presents?|toys?|bring|brings|deliver|sleigh|chimney|stocking|wish(es)?|asked for|you will get|i will come|see you|christmas eve|naughty|nice list)\b/i
        .test(text),
      text,
    );
    assertEquals(reply.paragraphs.length, 3);
  }
});

Deno.test("the town is named when the letter gave one, and the sentence still reads without it", () => {
  for (let n = 0; n < 4; n++) {
    const withTown = santaReply(emma, n).paragraphs[0];
    const without = santaReply({ ...emma, town: null }, n).paragraphs[0];
    assert(withTown.includes(" from Wausau"), withTown);
    assert(!without.includes("from") && !without.includes("  ") && !without.includes(" ,"), without);
    assertNotEquals(withTown, without);
  }
});

Deno.test("Santa thanks the grown-up who helped a child of 4 or under, in every version", () => {
  for (let n = 0; n < 4; n++) {
    assert(santaReply({ ...emma, age: 4 }, n).paragraphs[0].endsWith("Thank you to the grown-up who helped you write it, too."));
    assert(!santaReply({ ...emma, age: 5 }, n).paragraphs[0].includes("grown-up"));
  }
});
