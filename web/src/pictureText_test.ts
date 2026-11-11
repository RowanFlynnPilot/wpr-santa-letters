// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assertEquals } from "jsr:@std/assert@1";
import { firstLines, wrapText } from "./pictureText.ts";

// Every character one unit wide: a line holds as many characters as its width.
const measure = (text: string) => text.length;

Deno.test("words wrap at the width, and the child's own line breaks are kept", () => {
  assertEquals(wrapText("Dear Santa,\nI wud like a pupy and a red sled.", 16, measure), [
    "Dear Santa,",
    "I wud like a",
    "pupy and a red",
    "sled.",
  ]);
});

Deno.test("a blank line stays one blank row, however many the letter had", () => {
  assertEquals(wrapText("Dear Santa\n\n\n\nLove, Emma\n", 20, measure), ["Dear Santa", "", "Love, Emma"]);
  assertEquals(wrapText("\n\nhello", 20, measure), ["hello"]);
});

Deno.test("a word longer than the line is broken rather than run off the page", () => {
  assertEquals(wrapText("I Iwantatrainsetforchristmas please", 10, measure), [
    "I",
    "Iwantatrai",
    "nsetforchr",
    "istmas",
    "please",
  ]);
});

Deno.test("a long letter keeps its first lines and ends in an ellipsis that fits", () => {
  const lines = ["Dear Santa,", "I have been", "very good.", "", "I would like", "a sled."];
  assertEquals(firstLines(lines, 6, 12, measure), { lines, cut: false });
  assertEquals(firstLines(lines, 3, 12, measure), { lines: ["Dear Santa,", "I have been", "very good…"], cut: true });
  // Not ending on a blank row, and trimmed so the ellipsis still fits the width.
  assertEquals(firstLines(lines, 4, 12, measure).lines.at(-1), "very good…");
  assertEquals(firstLines(lines, 5, 12, measure).lines.at(-1), "I would lik…");
});
