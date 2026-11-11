import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { addressGroup, senderAddress, senderKey } from "./sender.ts";

Deno.test("the sender is the address Cloudflare reports, not one the sender wrote in themselves", () => {
  // A flood posing as someone new each time: the header it controls is ignored when Cloudflare's is there.
  const posed = new Headers({ "x-forwarded-for": "198.51.100.99, 203.0.113.7", "cf-connecting-ip": "203.0.113.7" });
  assertEquals(senderAddress(posed), "203.0.113.7");
  assertEquals(senderAddress(new Headers({ "cf-connecting-ip": "2001:DB8::1" })), "2001:db8::1");
  // Without Cloudflare's header (a local stack), the first forwarded address.
  assertEquals(senderAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })), "203.0.113.7");
  assertEquals(senderAddress(new Headers({ "x-forwarded-for": " " })), null);
  assertEquals(senderAddress(new Headers()), null);
});

Deno.test("an IPv6 address counts as its /64, so changing the rest of it isn't a new sender", () => {
  assertEquals(addressGroup("203.0.113.7"), "203.0.113.7");
  assertEquals(addressGroup("2001:db8:85a3:1:aaaa:bbbb:cccc:dddd"), "2001:db8:85a3:1::/64");
  assertEquals(addressGroup("2001:db8:85a3:1::42"), "2001:db8:85a3:1::/64");
  assertEquals(addressGroup("2001:0db8:85a3:0001:0:0:0:1"), "2001:db8:85a3:1::/64");
  assertEquals(addressGroup("2001:db8::1"), "2001:db8:0:0::/64");
  assertNotEquals(addressGroup("2001:db8:85a3:2::42"), addressGroup("2001:db8:85a3:1::42"));
  assertEquals(addressGroup("::ffff:203.0.113.7"), "203.0.113.7");
});

Deno.test("the key is a scramble of the address: steady for one sender, different for another or another secret", async () => {
  const key = await senderKey("203.0.113.7", "secret-one");
  assertMatch(key, /^[0-9a-f]{32}$/);
  assertEquals(await senderKey("203.0.113.7", "secret-one"), key);
  assertNotEquals(await senderKey("203.0.113.8", "secret-one"), key);
  assertNotEquals(await senderKey("203.0.113.7", "secret-two"), key);
  // Two addresses in one home's IPv6 block are one sender.
  assertEquals(
    await senderKey("2001:db8:85a3:1:aaaa:bbbb:cccc:dddd", "secret-one"),
    await senderKey("2001:db8:85a3:1::42", "secret-one"),
  );
  // The address itself is nowhere in it.
  assertEquals(key.includes("203.0.113.7"), false);
});
