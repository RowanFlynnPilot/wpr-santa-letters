import { assertEquals } from "jsr:@std/assert@1";
import { sentence } from "./sentence.ts";

Deno.test("a sentence that ends on a name with its own period takes no second one", () => {
  assertEquals(sentence("Theo, 5, of Wausau, wins a furnace tune-up from PGA Inc."), "Theo, 5, of Wausau, wins a furnace tune-up from PGA Inc.");
  assertEquals(sentence("Mia wins a family pizza night from Rib River Pizza"), "Mia wins a family pizza night from Rib River Pizza.");
  assertEquals(
    sentence("Letters to Santa is presented by Maher Water, Jones & Jones and PGA Inc."),
    "Letters to Santa is presented by Maher Water, Jones & Jones and PGA Inc.",
  );
  assertEquals(sentence("Thanks also to Sweets on 3rd"), "Thanks also to Sweets on 3rd.");
  // A name that ends some other way keeps its own mark.
  assertEquals(sentence("Thanks also to Yum!"), "Thanks also to Yum!");
});
