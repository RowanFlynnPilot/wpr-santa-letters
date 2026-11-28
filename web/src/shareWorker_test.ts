// The Cloudflare Worker's share pages (docs/cloudflare/letters-to-santa-host.js), against a stand-in for
// Supabase. The Worker is pasted into Cloudflare by hand, so this is the only place it runs before it's live.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import worker, { cardText, jpegSize, sharePage } from "../../docs/cloudflare/letters-to-santa-host.js";

const ID = "3f2a8c1e-5b7d-4e9f-a012-3456789abcde";
const PAGE = "https://wausaupilotandreview.com/letters-to-santa/";
const FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS]";

const LETTER = {
  season_id: "11111111-1111-1111-1111-111111111111",
  first_name: "Emma",
  age: 7,
  town: "Wausau" as string | null,
  body: "Dear Santa,\nI have bin very good this yeer. I wud like a pupy and a red sled.\n\nLove, Emma",
  photo_id: null as string | null,
};
const PHOTO = "22222222-2222-2222-2222-222222222222";
const SPONSORS = ["Jones & Jones", "Maher Water", "One Community Bank", "PGA"];

// A frame header after the JFIF segment: 1200 wide, 1600 tall.
const JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0x40, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00,
]);

// A stand-in for Supabase that records what the Worker asked for.
function supabase(options: { letters?: unknown[]; status?: number; sponsors?: string[] | "down"; photo?: "down" } = {}) {
  const calls: { url: string; apikey: string | null; authorization: string | null }[] = [];
  const fetcher = (input: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: input, apikey: headers.get("apikey"), authorization: headers.get("authorization") });
    if (input.includes("/rest/v1/mailbag")) return Promise.resolve(Response.json(options.letters ?? [LETTER], { status: options.status ?? 200 }));
    if (input.includes("/rest/v1/sponsors")) {
      if (options.sponsors === "down") return Promise.resolve(new Response("no", { status: 500 }));
      return Promise.resolve(Response.json((options.sponsors ?? SPONSORS).map((name) => ({ name }))));
    }
    if (input.includes("/storage/v1/object/public/letter-photos/")) {
      return Promise.resolve(options.photo === "down" ? new Response("no", { status: 500 }) : new Response(JPEG, { status: 206 }));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };
  return { fetcher, calls };
}

const get = (path: string, userAgent: string, method = "GET") =>
  new Request(`https://wausaupilotandreview.com${path}`, { method, headers: { "user-agent": userAgent } });

const meta = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1].replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"');

Deno.test("a person is sent on to the mailbag at that letter, before anything is looked up", async () => {
  const { fetcher, calls } = supabase();
  const response = await sharePage(get(`/letters-to-santa/letter/${ID}`, IPHONE), fetcher);
  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), `${PAGE}#letter=${ID}&from=share`);
  assertEquals(calls.length, 0);
});

Deno.test("a preview crawler gets the letter's own title, first words, sponsors and the envelope", async () => {
  const { fetcher, calls } = supabase();
  const response = await sharePage(get(`/letters-to-santa/letter/${ID.toUpperCase()}/`, FACEBOOK), fetcher);
  assertEquals(response.status, 200);
  assertStringIncludes(response.headers.get("content-type")!, "text/html");
  assertEquals(response.headers.get("x-robots-tag"), "noindex");
  const html = await response.text();
  assertEquals(meta(html, "og:title"), "Emma’s letter to Santa");
  assertEquals(
    meta(html, "og:description"),
    "Emma, 7, of Wausau: “Dear Santa, I have bin very good this yeer. I wud like a pupy and a red sled. Love, Emma” " +
      "Read it in Santa’s mailbag at Wausau Pilot & Review, presented by Jones & Jones, Maher Water, One Community Bank and PGA.",
  );
  assertEquals(meta(html, "og:url"), `${PAGE}letter/${ID}`);
  assertEquals(meta(html, "og:image"), "https://rowanflynnpilot.github.io/wpr-santa-letters/og-image.png");
  assertEquals(meta(html, "og:image:width"), "1200");
  assertEquals(meta(html, "og:image:type"), "image/png");
  // A person the crawler check missed is still sent on.
  assertStringIncludes(html, `location.replace("${PAGE}#letter=${ID}&from=share")`);
  assert(!html.includes("http-equiv"));
  // The public view, one letter, with the key in apikey and nowhere else.
  assertStringIncludes(calls[0].url, `/rest/v1/mailbag?select=season_id,first_name,age,town,body,photo_id&id=eq.${ID}`);
  assert(calls.every((call) => call.apikey?.startsWith("sb_publishable_") && call.authorization === null));
});

Deno.test("a letter with a photo previews the child's own page, with its size", async () => {
  const { fetcher } = supabase({ letters: [{ ...LETTER, photo_id: PHOTO }] });
  const html = await (await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK), fetcher)).text();
  assertStringIncludes(meta(html, "og:image")!, `/storage/v1/object/public/letter-photos/${PHOTO}/full.jpg`);
  assertEquals(meta(html, "og:image:type"), "image/jpeg");
  assertEquals(meta(html, "og:image:width"), "1200");
  assertEquals(meta(html, "og:image:height"), "1600");
});

Deno.test("a photo whose size can't be read is still the preview, without a size", async () => {
  const { fetcher } = supabase({ letters: [{ ...LETTER, photo_id: PHOTO }], photo: "down" });
  const html = await (await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK), fetcher)).text();
  assertStringIncludes(meta(html, "og:image")!, `${PHOTO}/full.jpg`);
  assertEquals(meta(html, "og:image:width"), undefined);
});

Deno.test("a letter that isn't up has no preview, only the way to the mailbag", async () => {
  for (const options of [{ letters: [] }, { status: 500 }]) {
    const { fetcher } = supabase(options);
    const response = await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK), fetcher);
    assertEquals(response.status, 302);
    assertEquals(response.headers.get("location"), `${PAGE}#letter=${ID}&from=share`);
  }
});

Deno.test("the sponsors being unreadable doesn't cost the letter its preview", async () => {
  const { fetcher } = supabase({ sponsors: "down" });
  const html = await (await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK), fetcher)).text();
  assertStringIncludes(meta(html, "og:description")!, "Read it in Santa’s mailbag at Wausau Pilot & Review.");
});

Deno.test("anything that isn't a letter's address goes to the mailbag; only GET and HEAD are answered", async () => {
  const { fetcher, calls } = supabase();
  for (const path of ["/letters-to-santa/letter/", "/letters-to-santa/letter/not-an-id", `/letters-to-santa/letter/${ID}/more`]) {
    const response = await sharePage(get(path, FACEBOOK), fetcher);
    assertEquals(response.status, 302);
    assertEquals(response.headers.get("location"), PAGE);
  }
  assertEquals((await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK, "POST"), fetcher)).status, 405);
  assertEquals(calls.length, 0);
  const head = await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK, "HEAD"), fetcher);
  assertEquals(head.status, 200);
  assertEquals(await head.text(), "");
});

Deno.test("what a letter says can't break out of the page", async () => {
  const { fetcher } = supabase({ letters: [{ ...LETTER, first_name: 'Em"><script>', body: '</title><script>alert(1)</script> "hi" & bye' }] });
  const html = await (await sharePage(get(`/letters-to-santa/letter/${ID}`, FACEBOOK), fetcher)).text();
  assert(!html.includes("<script>alert"));
  assert(!html.includes('Em">'));
  assertEquals(html.match(/<script>/g)?.length, 1);
});

Deno.test("the preview's words: a baby, no town, a name ending in s, a long letter, a sponsor ending in a period", () => {
  const text = cardText({ letter: { ...LETTER, first_name: "James", age: 0, town: null, body: "word ".repeat(100) }, presenting: ["PGA Inc."] });
  assertEquals(text.title, "James’ letter to Santa");
  assert(text.description.startsWith("James, under 1: “word word"));
  assertStringIncludes(text.description, "word…” Read it");
  assert(text.description.endsWith("presented by PGA Inc."));
  assert(text.description.length < 300);
});

Deno.test("a JPEG's size is read from its frame header, and nothing else is mistaken for one", () => {
  assertEquals(jpegSize(JPEG), { width: 1200, height: 1600 });
  assertEquals(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assertEquals(jpegSize(JPEG.slice(0, 24)), null);
});

Deno.test("the Worker answers a share address itself and never hands it to WordPress", async () => {
  const response = await worker.fetch(get(`/letters-to-santa/letter/${ID}`, IPHONE), {}, { passThroughOnException() {} });
  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), `${PAGE}#letter=${ID}&from=share`);
});
