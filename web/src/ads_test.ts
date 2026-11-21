import { assertEquals } from "jsr:@std/assert@1";
import { pickAd, usableAds, wausauDay } from "./ads.ts";

const AD = {
  sponsor: "Pine Ridge Hardware",
  href: "https://example.com/",
  image: "ad-one.png",
  width: 970,
  height: 500,
  alt: "Happy holidays from Pine Ridge Hardware",
};

Deno.test("today is Wausau's day, not the device's or London's", () => {
  // 11:30 p.m. on New Year's Day in Wausau is already Jan. 2 in UTC.
  assertEquals(wausauDay(Date.parse("2027-01-02T05:30:00Z")), "2027-01-01");
  assertEquals(wausauDay(Date.parse("2027-01-02T06:00:00Z")), "2027-01-02");
});

Deno.test("an ad shows through its last day and not after", () => {
  const listed = [{ ...AD, through: "2027-01-01" }];
  assertEquals(usableAds(listed, "2026-11-20").length, 1);
  assertEquals(usableAds(listed, "2027-01-01").length, 1);
  assertEquals(usableAds(listed, "2027-01-02").length, 0);
  // Without a last day, it shows until it's taken out of the list.
  assertEquals(usableAds([AD], "2030-01-01").length, 1);
});

Deno.test("a mistyped entry is left out and the rest still show", () => {
  const bad = [
    { ...AD, href: "http://example.com/" },
    { ...AD, href: "javascript:alert(1)" },
    { ...AD, href: "not an address" },
    { ...AD, image: "../secret.png" },
    { ...AD, image: "https://example.com/ad.png" },
    { ...AD, sharp: "ads/ad-one@2x.png" },
    { ...AD, alt: " " },
    { ...AD, sponsor: 7 },
    { ...AD, width: "970" },
    { ...AD, height: 0 },
    { ...AD, through: "Jan. 1" },
    null,
    "ad-one.png",
  ];
  assertEquals(usableAds([...bad, AD], "2026-12-05"), [AD]);
  // Whatever the file held, if it wasn't a list there are no ads.
  assertEquals(usableAds({ ads: [AD] }, "2026-12-05"), []);
  assertEquals(usableAds(null, "2026-12-05"), []);
});

Deno.test("each visit shows one ad, and every sponsor gets an even share", () => {
  const ads = ["one", "two", "three", "four"].map((sponsor) => ({ ...AD, sponsor }));
  assertEquals(pickAd(ads, 0)?.sponsor, "one");
  assertEquals(pickAd(ads, 0.2499)?.sponsor, "one");
  assertEquals(pickAd(ads, 0.25)?.sponsor, "two");
  assertEquals(pickAd(ads, 0.9999)?.sponsor, "four");
  // A roll of exactly 1 can't fall off the end.
  assertEquals(pickAd(ads, 1)?.sponsor, "four");
  assertEquals(pickAd([], 0.5), undefined);
  // ?ad=3 asks for the third; anything that isn't a place in the list falls back to the roll.
  assertEquals(pickAd(ads, 0, "3")?.sponsor, "three");
  assertEquals(pickAd(ads, 0, "9")?.sponsor, "one");
  assertEquals(pickAd(ads, 0, "0")?.sponsor, "one");
  assertEquals(pickAd(ads, 0, "two")?.sponsor, "one");
});
