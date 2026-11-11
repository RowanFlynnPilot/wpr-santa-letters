import { assertEquals } from "jsr:@std/assert@1";
import { checkPhoto, type Reading, READING_SCHEMA, tidyReading } from "./transcription.ts";

const base: Reading = {
  first_name: "Emma",
  age: 7,
  town: "Wausau",
  letter: "Dear Santa,\nI wud like a pupy.\n\nLove, Emma",
  privacy: [],
  photo_concerns: [],
  return_address: null,
  legibility: "clear",
  notes: "",
};

Deno.test("a clean reading passes through as Claude gave it, spelling and all", () => {
  assertEquals(tidyReading(base), base);
});

Deno.test("a full name keeps the first name, and the last name is flagged where the letter has it", () => {
  const reading = tidyReading({ ...base, first_name: "Emma Johnson", letter: "Dear Santa, love Emma Johnson" });
  assertEquals(reading.first_name, "Emma");
  assertEquals(reading.privacy, [{ what: "last name", text: "Johnson" }]);
});

Deno.test("privacy items staff can't find in the letter box, or repeated, are dropped", () => {
  const reading = tidyReading({
    ...base,
    letter: "I go to Riverview Elementary. Riverview Elementary is fun.",
    privacy: [
      { what: "school", text: " Riverview Elementary " },
      { what: "school", text: "Riverview Elementary" },
      { what: "last name", text: "Olson" },
    ],
  });
  assertEquals(reading.privacy, [{ what: "school", text: "Riverview Elementary" }]);
});

Deno.test("an age outside 0 to 17, or not a whole number, is left for staff to choose", () => {
  assertEquals(tidyReading({ ...base, age: 34 }).age, null);
  assertEquals(tidyReading({ ...base, age: -1 }).age, null);
  assertEquals(tidyReading({ ...base, age: 6.5 }).age, null);
  assertEquals(tidyReading({ ...base, age: 0 }).age, 0);
});

Deno.test("names and towns are one line within the boxes' limits; the letter keeps its paragraphs", () => {
  const reading = tidyReading({
    ...base,
    first_name: "  Maximiliana-Josephine-Alexandra-Rose \n",
    town: "Rib\nMountain\u0007",
    letter: "Dear Santa,\r\n\r\n\r\n\r\nI have been good.\u0000",
    notes: "Two\nchildren signed.",
  });
  assertEquals(reading.first_name, "Maximiliana-Josephine-Alexandr");
  assertEquals(reading.town, "Rib Mountain");
  assertEquals(reading.letter, "Dear Santa,\n\nI have been good.");
  assertEquals(reading.notes, "Two children signed.");
  assertEquals(tidyReading({ ...base, letter: "x".repeat(2500) }).letter.length, 2000);
});

Deno.test("blank strings come back as nothing to fill in", () => {
  const reading = tidyReading({
    ...base,
    first_name: " ",
    town: "",
    return_address: "  ",
    photo_concerns: ["", " a face "],
  });
  assertEquals([reading.first_name, reading.town, reading.return_address], [null, null, null]);
  assertEquals(reading.photo_concerns, ["a face"]);
});

Deno.test("only a base64 JPEG of a sensible size is sent to Claude", () => {
  assertEquals(checkPhoto("/9j/4AAQSkZJRg=="), null);
  assertEquals(checkPhoto(undefined), "Choose a photo of the letter first.");
  assertEquals(checkPhoto("iVBORw0KGgo="), "That photo couldn't be read. Choose it again."); // a PNG
  assertEquals(checkPhoto("/9j/<script>"), "That photo couldn't be read. Choose it again.");
  assertEquals(checkPhoto("/9j/" + "A".repeat(6_000_000)), "That photo is too large to read. Choose it again.");
});

Deno.test("the schema asks for every field, so a reading is never missing one", () => {
  assertEquals([...READING_SCHEMA.required].sort(), Object.keys(READING_SCHEMA.properties).sort());
  assertEquals(READING_SCHEMA.additionalProperties, false);
});
