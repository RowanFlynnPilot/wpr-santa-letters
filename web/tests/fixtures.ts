// A made-up mailbag for the browser tests, and the answers the app would get from Supabase, served from
// here instead (pages.spec.ts). No backend runs: the tests exercise the built app against fixed data and a
// fixed day, so a screenshot changes only when the page does. The fonts are the page's own (src/fonts),
// so nothing here needs the network. Nobody here is a real child.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The day the tests run on: letters are open, with 13 days left to write (Dec. 5 to Dec. 18).
export const TODAY = new Date("2026-12-05T18:00:00Z");

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

export async function mockBackend(page: Page, options: { pick?: boolean } = {}) {
  await page.clock.setFixedTime(TODAY);

  // Analytics and the spam check are other people's services: not loaded in tests.
  await page.route(/plausible\.io|challenges\.cloudflare\.com/, (route) => route.abort());

  await page.route("**/storage/v1/object/public/letter-photos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      headers: { "access-control-allow-origin": "*" },
      body: readFileSync(file(route.request().url().includes(TALL) ? "./fixtures/letter-tall.jpg" : "./fixtures/drawing-wide.jpg")),
    }));

  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").pop();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    switch (table) {
      case "current_season":
        return json(route, SEASON);
      case "sponsors":
        return json(route, [SPONSOR]);
      case "prizes":
        return json(route, [{ id: "00000000-0000-4000-8000-0000000000d1", sponsor_id: SPONSOR.id, description: "a $50 savings starter", created_at: at(1, 12) }]);
      case "prize_winners":
        return json(route, []);
      case "featured_letters":
        return json(route, options.pick === false ? [] : [{ letter_id: PICK.id }]);
      case "mailbag": {
        if (request.method() === "HEAD") {
          return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", "content-range": `0-0/${LETTERS.length}` } });
        }
        const one = url.searchParams.get("id")?.replace("eq.", "");
        const limit = Number(url.searchParams.get("limit")) || LETTERS.length;
        return json(route, one ? LETTERS.filter((l) => l.id === one) : LETTERS.slice(0, limit));
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

// Every word of the sponsor's name on the stamp, set on one line and inside the stamp's face. A word
// that splits across lines ("Northwoo / ds") has more than one box.
export const stampWords = (page: Page) =>
  page.evaluate(() => {
    const name = document.querySelector(".stamp-name");
    const face = name?.closest(".stamp-face");
    if (!name || !face || !name.firstChild) return [{ word: "(no name on the stamp)", lines: 0, inside: false }];
    const text = name.textContent ?? "";
    const box = face.getBoundingClientRect();
    const range = document.createRange();
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
