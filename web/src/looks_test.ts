// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { paperFor, PAPERS, turnFor, widestWord } from "./looks.ts";

Deno.test("a letter is always set on the same paper", () => {
  const id = "00a3f837-005a-426c-afd9-01b6a67c5b73";
  assertEquals(paperFor(id), paperFor(id));
  assert(PAPERS.includes(paperFor(id)));
});

Deno.test("a mailbag of letters uses every paper, none of them for most of the letters", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 300; i++) {
    const paper = paperFor(crypto.randomUUID());
    counts.set(paper, (counts.get(paper) ?? 0) + 1);
  }
  for (const paper of PAPERS) {
    const share = (counts.get(paper) ?? 0) / 300;
    assert(share > 0.2 && share < 0.47, `${paper}: ${share}`);
  }
});

Deno.test("the stamp sizes its type to the sponsor's widest word", () => {
  // The name that split mid-word on the stamp ("Northwoo / ds"): its longest word, not its length, counts.
  assertEquals(widestWord("Northwoods Community Bank"), widestWord("Northwoods"));
  assert(widestWord("Northwoods Community Bank") > widestWord("Rib River Pizza"));
  // Capitals need more room than the same word in lowercase.
  assert(widestWord("KWIK TRIP") > widestWord("kwik trip"));
  assert(widestWord("IncredibleBank") > widestWord("Northwoods"));
  // A very short name isn't set enormous, and an empty one doesn't break the sum.
  assertEquals(widestWord("3M"), 4);
  assertEquals(widestWord(""), 4);
});

Deno.test("where one stamp fits, the presenting sponsors take turns by letter, evenly", () => {
  const id = "00a3f837-005a-426c-afd9-01b6a67c5b73";
  // The same letter keeps its stamp, and one sponsor (or none yet) needs no turn.
  assertEquals(turnFor(id, 4), turnFor(id, 4));
  assertEquals(turnFor(id, 1), 0);
  assertEquals(turnFor(id, 0), 0);
  for (const sponsors of [2, 3, 4]) {
    const turns = new Array(sponsors).fill(0);
    for (let i = 0; i < 1200; i++) turns[turnFor(crypto.randomUUID(), sponsors)] += 1;
    for (const count of turns) {
      const share = count / 1200;
      assert(Math.abs(share - 1 / sponsors) < 0.06, `${sponsors} sponsors: ${turns}`);
    }
  }
});

Deno.test("a sponsor's turn doesn't follow the letter's paper", () => {
  // Hashed apart: among letters on one paper, every one of three sponsors still gets a turn.
  const turns = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const id = crypto.randomUUID();
    if (paperFor(id) === "primary") turns.add(turnFor(id, 3));
  }
  assertEquals(turns.size, 3);
});
