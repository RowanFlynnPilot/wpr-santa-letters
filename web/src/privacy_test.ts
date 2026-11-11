// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assertEquals } from "jsr:@std/assert@1";
import { describeFlags, privacyFlags, takeOut } from "./privacy.ts";

const what = (body: string, name: string) => privacyFlags(body, name).map((flag) => flag.what);

Deno.test("flags what a child's letter shouldn't publish", () => {
  const letter =
    "Dear Santa,\nMy name is Emma Johnson and I go to Riverview Elementary. I live at 1234 Grand Ave in Wausau. " +
    "My mom's phone is 715-555-0199.\nEmma";
  assertEquals(what(letter, "Emma"), ["a street address", "a phone number", "a school", "a full name"]);
  assertEquals(what("i live at 412 n 3rd st and my teacher is Mrs. Olson", "Kai"), ["a street address", "a teacher’s name"]);
  assertEquals(what("email kid@example.com or see www.example.com/list", "Zoe"), ["an email address", "a web address"]);
  assertEquals(what("call 555-0199 please", "Ava"), ["a phone number"]);
  assertEquals(what("my moms number is 7155551234", "Ava"), ["a phone number"]);
  assertEquals(what("I go to Riverview elementary and mrs smith is nice", "Kai"), ["a school", "a teacher’s name"]);
  assertEquals(what("DEAR SANTA I AM MIA JOHNSON", "Mia"), ["a full name"]);
  assertEquals(what("Dear Santa, I want a sled.", "Mia Johnson"), ["a full name"]);
});

Deno.test("leaves ordinary wishes alone", () => {
  assertEquals(what("I want 100 markers, 2 dogs and a 5000 piece puzzle. Love, Mia", "Mia"), []);
  assertEquals(what("Mia Claus says hi. Mia Love", "Mia"), []);
  assertEquals(what("My school is fun. I want Lego set 75192 with 7541 pieces", "Noah"), []);
  assertEquals(what("I miss my dog. MIA LOVE", "Mia"), []);
});

Deno.test("describes them with what was written", () => {
  assertEquals(
    describeFlags(privacyFlags("Call 715-555-0199. Mrs. Olson says hi.", "Ava")),
    "a phone number (“715-555-0199”) and a teacher’s name (“Mrs. Olson”)",
  );
});

Deno.test("Take it out removes the phrase and closes its gap, and leaves the rest as the child wrote it", () => {
  assertEquals(takeOut("Love,  Emma Johnson.", "Johnson"), "Love,  Emma.");
  assertEquals(takeOut("Emma Johnson wants a sled", "Johnson"), "Emma wants a sled");
  assertEquals(takeOut("Johnson family says hi", "Johnson"), "family says hi");
  assertEquals(takeOut("I live at 12 Elm St\nin Wausau", "12 Elm St"), "I live at\nin Wausau");
  assertEquals(takeOut("love Emma Johnson", "Johnson"), "love Emma");
  assertEquals(takeOut("Dear Santa", "Olson"), "Dear Santa");
  assertEquals(takeOut("Dear Santa", ""), "Dear Santa");
});
