// A made-up mailbag for the browser tests, and the answers the app would get from Supabase, served from
// here instead (pages.spec.ts). No backend runs: the tests exercise the built app against fixed data and a
// fixed day, so a screenshot changes only when the page does. The fonts are the page's own (src/fonts),
// so nothing here needs the network. Nobody here is a real child.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The day the tests run on, for each phase of the season (the database decides the phase; here it's given).
// Open is the default: Dec. 5, with 13 days left to write.
export type Phase = "upcoming" | "open" | "closed" | "delivered";
export const DAYS: Record<Phase, Date> = {
  upcoming: new Date("2026-11-20T18:00:00Z"),
  open: new Date("2026-12-05T18:00:00Z"),
  closed: new Date("2026-12-20T18:00:00Z"),
  delivered: new Date("2026-12-23T18:00:00Z"),
};
export const TODAY = DAYS.open;

export const SEASON = {
  id: "00000000-0000-4000-8000-0000000000aa",
  year: 2026,
  entries_open_at: "2026-11-27T06:00:00Z",
  entries_close_at: "2026-12-19T06:00:00Z",
  delivered_at: "2026-12-23T12:00:00Z",
  phase: "open",
};

// A name with a ten-letter word and no logo: the stamp that once split "Northwoo / ds".
export const SPONSOR = {
  id: "00000000-0000-4000-8000-0000000000b1",
  name: "Northwoods Community Bank",
  tier: "presenting",
  logo_path: null,
  website_url: "https://example.com/",
};

// A full house: four presenting sponsors, none with a logo yet, so every stamp sets a name in type at
// its smallest. "Orthodontics" is the longest word any of them has to fit whole. All made up.
export const FOUR_SPONSORS = [
  SPONSOR,
  { id: "00000000-0000-4000-8000-0000000000b2", name: "Rib River Pizza", tier: "presenting", logo_path: null, website_url: "https://example.com/pizza" },
  { id: "00000000-0000-4000-8000-0000000000b3", name: "Evergreen Orthodontics", tier: "presenting", logo_path: null, website_url: null },
  { id: "00000000-0000-4000-8000-0000000000b4", name: "Marathon Toy Chest", tier: "presenting", logo_path: null, website_url: "https://example.com/toys" },
];

// The same four with their logos in, in the shapes real ones come in (tests/fixtures/logo-*.png, all made
// up): a square mark, a wide wordmark on a clear background (the hardest fit for an upright stamp), a tall
// badge, and a small file of the kind saved off a Facebook page.
export const LOGO_SPONSORS = FOUR_SPONSORS.map((sponsor, i) => ({ ...sponsor, logo_path: ["logo-square.png", "logo-wide.png", "logo-tall.png", "logo-small.png"][i] }));

// Supporting sponsors, for the row under the envelope: a wide logo that links, a tall one that doesn't, a
// name that links and a long name that doesn't. Made up, like the rest.
export const SUPPORTERS = [
  { id: "00000000-0000-4000-8000-0000000000b5", name: "Rib River Pizza", tier: "supporting", logo_path: "logo-wide.png", website_url: "https://example.com/pizza" },
  { id: "00000000-0000-4000-8000-0000000000b6", name: "Evergreen Orthodontics", tier: "supporting", logo_path: "logo-tall.png", website_url: null },
  { id: "00000000-0000-4000-8000-0000000000b7", name: "Granite City Hardware", tier: "supporting", logo_path: null, website_url: "https://example.com/hardware" },
  { id: "00000000-0000-4000-8000-0000000000b8", name: "Third Street Bakery & Coffee Roasters", tier: "supporting", logo_path: null, website_url: null },
];

const TALL = "00000000-0000-4000-8000-0000000000c1";
const WIDE = "00000000-0000-4000-8000-0000000000c2";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, hour: number) => `2026-12-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;

// Newest first, as the mailbag asks for them. The ids are chosen so all three papers appear (looks.ts).
export const LETTERS = [
  { id: id(1), first_name: "Emma", age: 7, town: "Wausau", photo_id: null, created_at: at(5, 15), body: "Dear Santa,\nI have bin very good this yeer. I wud like a pupy and a red sled.\n\nLove, Emma" },
  { id: id(2), first_name: "Liam", age: 5, town: "Rib Mountain", photo_id: null, created_at: at(5, 14), body: "dear santa i want a dinosor that rors. and a truck. thank you" },
  { id: id(3), first_name: "Ava", age: 9, town: "Schofield", photo_id: TALL, created_at: at(4, 20), body: "Dear Santa,\nI have ben very good. Can I pleese have a sled and a book about horses. My dog wants a bone.\n\nI will leave you cookies and a carrot for Rudolph.\n\nLove, Ava" },
  { id: id(4), first_name: "Henry", age: 4, town: "Mosinee", photo_id: null, created_at: at(4, 16), body: "SANTA\nTRAIN\nPLEASE" },
  { id: id(5), first_name: "Mai", age: 8, town: "Wausau", photo_id: WIDE, created_at: at(3, 22), body: "Dear Santa,\nI drew you our tree. I would like a soccer ball and for my grandma to feel better.\n\nLove, Mai" },
  { id: id(6), first_name: "Maximiliana-Josephine", age: 6, town: "Rib Mountain", photo_id: null, created_at: at(3, 15), body: "Dear Santa\nI want a fish. A orange one." },
  { id: id(9), first_name: "Owen", age: 0, town: null, photo_id: null, created_at: at(2, 17), body: "Owen is 6 months old and would like to chew on the wrapping paper. Love, Owen's mom" },
  { id: id(11), first_name: "Mason", age: 11, town: "Athens", photo_id: null, created_at: at(1, 19), body: "Santa,\nMy sister says you aren't real but I am writing anyway just in case. A fishing pole would be great. Also something for my dog Biscuit. He is a good dog and he only chewed one shoe this year.\n\nMason" },
];

// The editor's pick: the letter with the tall handwritten page.
export const PICK = LETTERS[2];

const json = (route: Route, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...headers },
    body: JSON.stringify(body),
  });

export const PRIZE = { id: "00000000-0000-4000-8000-0000000000d1", sponsor_id: SPONSOR.id, description: "a $50 savings starter", created_at: at(1, 12) };

// Six prizes from two sponsors, three of them the same gift card: "three to win".
export const SIX_PRIZES = [
  PRIZE,
  ...["a family pizza night", "a $25 gift card", "a $25 gift card", "a $25 gift card", "a sled"].map((description, i) => ({
    id: `00000000-0000-4000-8000-0000000000d${i + 2}`,
    sponsor_id: "00000000-0000-4000-8000-0000000000b5",
    description,
    created_at: at(1, 13 + i),
  })),
];

// Two made-up businesses' banner ads (fixtures/ad-one.png, ad-two.png), as ads.json lists the real ones.
export const ADS = [
  { sponsor: "Pine Ridge Hardware", href: "https://example.com/pine-ridge", image: "ad-one.png", width: 970, height: 500, alt: "Happy holidays from Pine Ridge Hardware" },
  { sponsor: "Larkspur Dental", href: "https://example.com/larkspur", image: "ad-two.png", width: 970, height: 500, alt: "Season’s greetings from Larkspur Dental", through: "2027-01-01" },
];

// `ads`: what the app's own ads.json holds (ads.ts). No ads unless a test asks for them, so the season's
// real ads are never in a test or an approved screenshot; `null` is a list that isn't there, and a string
// is the file's words as they are.
export async function mockBackend(
  page: Page,
  options: {
    pick?: boolean;
    sponsors?: unknown[];
    prizes?: unknown[];
    phase?: Phase;
    letters?: (typeof LETTERS)[number][];
    ads?: unknown[] | string | null;
    // Who won what, on delivery day; the first letter wins the one prize unless a test says otherwise.
    winners?: { prize_id: string; letter_id: string }[];
  } = {},
) {
  const phase = options.phase ?? "open";
  // Before letters open the mailbag is empty; on delivery day the first letter has won the prize.
  const letters = phase === "upcoming" ? [] : (options.letters ?? LETTERS);
  await page.clock.setFixedTime(DAYS[phase]);

  // Analytics and the spam check are other people's services: not loaded in tests.
  await page.route(/plausible\.io|challenges\.cloudflare\.com/, (route) => route.abort());

  await page.route("**/storage/v1/object/public/letter-photos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      headers: { "access-control-allow-origin": "*" },
      body: readFileSync(file(route.request().url().includes(TALL) ? "./fixtures/letter-tall.jpg" : "./fixtures/drawing-wide.jpg")),
    }));

  await page.route("**/storage/v1/object/public/sponsor-logos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: readFileSync(file(`./fixtures/${route.request().url().split("/").pop()}`)),
    }));

  await page.route("**/ads/ads.json*", (route) =>
    options.ads === null
      ? route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" })
      : route.fulfill({ status: 200, contentType: "application/json", body: typeof options.ads === "string" ? options.ads : JSON.stringify(options.ads ?? []) }));

  await page.route("**/ads/ad-*.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(file(`./fixtures/${route.request().url().split("/").pop()}`)) }));

  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").pop();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    switch (table) {
      case "current_season":
        return json(route, { ...SEASON, phase });
      case "sponsors":
        return json(route, options.sponsors ?? [SPONSOR]);
      case "prizes":
        return json(route, options.prizes ?? [PRIZE]);
      case "prize_winners":
        // Readers get winners only once the letters are delivered (RLS, in the real database).
        return json(route, phase === "delivered" ? (options.winners ?? [{ prize_id: PRIZE.id, letter_id: LETTERS[0].id }]) : []);
      case "featured_letters":
        return json(route, options.pick === false || letters.length === 0 ? [] : [{ letter_id: PICK.id }]);
      case "mailbag": {
        if (request.method() === "HEAD") {
          return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", "content-range": `0-0/${letters.length}` } });
        }
        const one = url.searchParams.get("id")?.replace("eq.", "");
        const limit = Number(url.searchParams.get("limit")) || letters.length;
        return json(route, one ? letters.filter((l) => l.id === one) : letters.slice(0, limit));
      }
      default:
        return route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
    }
  });
}

// Everything on the page loaded and laid out: fonts in, every photo decoded (lazy ones too).
export async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const img of images) img.loading = "eager";
    await Promise.all(images.map((img) => (img.complete ? null : new Promise((done) => (img.onload = img.onerror = done)))));
  });
}

// True when the page is wider than its window: something is pushing a sideways scrollbar (invariant 16).
export const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// Every word of each sponsor's name on its stamp, set on one line and inside the stamp's face: one list
// of words per stamp on the page. A word that splits across lines ("Northwoo / ds") has more than one box.
export const stampsWords = (page: Page) =>
  page.evaluate(() => {
    const names = [...document.querySelectorAll(".stamp-name")];
    if (names.length === 0) return [[{ word: "(no name on a stamp)", lines: 0, inside: false }]];
    const range = document.createRange();
    return names.map((name) => {
      const face = name.closest(".stamp-face");
      if (!face || !name.firstChild) return [{ word: "(no name on the stamp)", lines: 0, inside: false }];
      const text = name.textContent ?? "";
      const box = face.getBoundingClientRect();
      return [...text.matchAll(/\S+/g)].map((match) => {
        range.setStart(name.firstChild!, match.index);
        range.setEnd(name.firstChild!, match.index + match[0].length);
        const rects = [...range.getClientRects()];
        const bounds = range.getBoundingClientRect();
        return {
          word: match[0],
          lines: new Set(rects.map((r) => Math.round(r.top))).size,
          inside: bounds.left >= box.left - 1 && bounds.right <= box.right + 1,
        };
      });
    });
  });

// Every logo on a stamp: whether it sits inside its stamp's face, keeps its own shape, and is as large as
// the stamp allows (it reaches the face's inner width or height, whichever its shape meets first).
export const stampLogos = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>(".stamp-face img")].map((img) => {
      const face = img.closest(".stamp-face") as HTMLElement;
      // Laid-out sizes, before the stamp's tilt.
      const style = getComputedStyle(face);
      const room = {
        w: face.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        h: face.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      };
      // What the picture itself covers inside its box (object-fit: contain).
      const scale = Math.min(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight);
      const shown = { w: img.naturalWidth * scale, h: img.naturalHeight * scale };
      return {
        // A wordmark's name is set in type beside it, and the picture itself then needs no words.
        name: img.alt || (face.textContent ?? ""),
        loaded: img.naturalWidth > 0,
        inside: img.clientWidth <= room.w + 1 && img.clientHeight <= room.h + 1,
        fills: Math.max(shown.w / room.w, shown.h / room.h),
        width: Math.round(shown.w),
        height: Math.round(shown.h),
      };
    }),
  );

// The one stamp, where a page has one.
export const stampWords = async (page: Page) => (await stampsWords(page))[0];
