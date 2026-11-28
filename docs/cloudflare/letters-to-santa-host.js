// A Cloudflare Worker for wausaupilotandreview.com, on the route  wausaupilotandreview.com/letters-to-santa*
//
// It does two things, and touches no other page.
//
// 1. The page's script. WPR's server firewall refuses a WordPress page save with script in it, so the
//    Letters to Santa page holds only the mailbag's iframe. This adds the one script that page needs
//    (web/public/embed.js: it sizes the frame to its content and opens the letter a link points to) as the
//    page passes through Cloudflare. Nothing in WordPress changes.
//
// 2. A letter's share page:  /letters-to-santa/letter/<letter id>. The link the mailbag's Share hands out.
//    A person who follows it is sent straight on to the mailbag at that letter (#letter=<id>&from=share,
//    which embed.js opens; the posted email's link adds ?from=email, and is sent on as from=email). A link-preview crawler (Facebook, iMessage, WhatsApp, Slack…) is given a small
//    page of Open Graph tags instead, so the preview says "Emma’s letter to Santa" with the letter's first
//    words, and shows the child's own page when the letter has a photo, in place of the same envelope for
//    every letter. It reads only the public mailbag view, with the publishable key the app itself ships: a
//    letter that isn't up (waiting, declined, taken down) has no preview, only the way to the mailbag.
//
// To undo all of it: delete the route (Workers & Pages > this Worker > Domains). To undo the share pages
// alone, paste the earlier version of this file back in; the app's Share links then lead to WordPress's
// "not found" page, so put the app's links back first (web/src/components/ShareButton.tsx).
// Set the route to "Fail open", so the page is served as usual if the Worker is ever over its limit.
//
// Nothing in the repo deploys this: it is pasted into Cloudflare's editor. Its tests are
// web/src/shareWorker_test.ts (deno test web/src).

// The app's own public settings (the web app is built with the same two; neither is a secret).
const SUPABASE_URL = "https://vhimfuaproejbxahjgpr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_836yO7dbYbz35bySU2q5cQ_4n9mGkbz";
const MAILBAG_PAGE = "https://wausaupilotandreview.com/letters-to-santa/";
// What a letter without a photo shows: the envelope on the night (web/public/og-image.png).
const ENVELOPE = { url: "https://rowanflynnpilot.github.io/wpr-santa-letters/og-image.png", type: "image/png", width: 1200, height: 630 };

// data-no-optimize keeps LiteSpeed from bundling it; data-cfasync keeps Cloudflare's Rocket Loader off it.
const TAG =
  '<script src="https://rowanflynnpilot.github.io/wpr-santa-letters/embed.js" defer data-no-optimize="1" data-cfasync="false"></script>';

const SHARE_PATH = /^\/letters-to-santa\/letter\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const SHARE_PREFIX = /^\/letters-to-santa\/letter(\/|$)/i;

// facebookexternalhit also covers iMessage; WhatsApp's name also covers Signal.
const PREVIEW_CRAWLERS =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|pinterestbot|redditbot|embedly|iframely|mastodon\/|cardyb/i;

// A crawler waits only so long. If Supabase is slower than this, it gets the way to the mailbag (and the
// mailbag page's own preview) rather than nothing.
const SUPABASE_TIMEOUT_MS = 3000;

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (SHARE_PREFIX.test(path)) {
      // Whatever goes wrong here, a reader still lands on the mailbag.
      try {
        return await sharePage(request, (input, init) => fetch(input, init));
      } catch (error) {
        console.error("Share page:", error);
        return Response.redirect(MAILBAG_PAGE, 302);
      }
    }

    // If anything here throws, the request goes on to the site as if there were no Worker.
    ctx.passThroughOnException();

    const response = await fetch(request);
    const type = response.headers.get("content-type") || "";
    // Only a page that loaded: not a redirect, an error, a picture or a form post.
    if (request.method !== "GET" || response.status !== 200 || !type.includes("text/html")) return response;

    return new HTMLRewriter()
      .on("body", {
        element(body) {
          body.append(TAG, { html: true });
        },
      })
      .transform(response);
  },
};

// One letter's share page. `fetcher` is fetch, handed in so the tests can stand in for Supabase.
export async function sharePage(request, fetcher, timeoutMs = SUPABASE_TIMEOUT_MS) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const id = SHARE_PATH.exec(url.pathname)?.[1].toLowerCase();
  if (!id) return Response.redirect(MAILBAG_PAGE, 302);

  // People are sent on before anything is looked up: a share that goes around costs Supabase nothing, and
  // a redirect keeps the visit's referrer, so a click from Facebook still counts as Facebook.
  // Where the link was followed from, for the mailbag's count: Share, or the email a family gets when
  // their letter goes up (which they forward, and paste into Facebook).
  const from = url.searchParams.get("from") === "email" ? "email" : "share";
  const letterPage = `${MAILBAG_PAGE}#letter=${id}&from=${from}`;
  if (!PREVIEW_CRAWLERS.test(request.headers.get("user-agent") ?? "")) return Response.redirect(letterPage, 302);

  const card = await loadCard(id, fetcher, timeoutMs).catch((error) => {
    // The code and message only, never the letter (CLAUDE.md, invariant 11).
    console.error(`Share page for a letter: ${error?.message ?? error}`);
    return null;
  });
  if (!card) return Response.redirect(letterPage, 302);

  const html = renderSharePage({ ...card, shareUrl: `${MAILBAG_PAGE}letter/${id}`, letterPage });
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Short, so a letter that comes down stops previewing soon after.
      "cache-control": "public, max-age=300",
      "vary": "user-agent",
      "x-robots-tag": "noindex",
    },
  });
}

async function loadCard(id, fetcher, timeoutMs) {
  const rest = async (query) => {
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/${query}`, {
      // The key goes in apikey only: it isn't a JWT (invariant 12).
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Supabase answered ${response.status}`);
    return response.json();
  };

  // The public view: only letters that are up, and only what the mailbag prints.
  const [letter] = await rest(`mailbag?select=season_id,first_name,age,town,body,photo_id&id=eq.${id}`);
  if (!letter) return null;

  const photo = letter.photo_id ? `${SUPABASE_URL}/storage/v1/object/public/letter-photos/${letter.photo_id}/full.jpg` : null;
  const [sponsors, image] = await Promise.all([
    // A preview without its sponsors is still a preview.
    rest(`sponsors?select=name&tier=eq.presenting&season_id=eq.${letter.season_id}&order=created_at.asc`).catch(() => []),
    photo ? photoSize(photo, fetcher, timeoutMs).then((size) => ({ url: photo, type: "image/jpeg", ...size })) : ENVELOPE,
  ]);
  return { letter, presenting: sponsors.map((sponsor) => sponsor.name), image };
}

// Facebook draws the preview on a link's first share only if it knows the picture's size up front. Read it
// from the JPEG's frame header, a few hundred bytes in (submit-letter strips the big metadata segments).
async function photoSize(url, fetcher, timeoutMs) {
  try {
    const response = await fetcher(url, { headers: { range: "bytes=0-16383" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`storage answered ${response.status}`);
    return jpegSize(new Uint8Array(await response.arrayBuffer())) ?? {};
  } catch (error) {
    console.warn(`A letter photo's size: ${error?.message ?? error}`);
    return {};
  }
}

// Start-of-frame markers: every JPEG coding process except the four reserved codes.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const SOS = 0xda;

export function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // a fill byte
      continue;
    }
    if (SOF.has(marker)) {
      if (i + 9 > bytes.length) return null;
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (marker === SOS) return null;
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

// AP: a singular name ending in s takes only an apostrophe (web/src/format.ts).
const possessive = (name) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);
// AP series: "Mia, Si and Ethan".
const series = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

// The letter's first words, on one line, cut at a word.
function excerpt(body, room = 150) {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= room) return line;
  const cut = line.slice(0, room + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : room).replace(/[\s,;:.!?-]+$/, "")}…`;
}

// What the preview says. Nothing the letter's card in the mailbag doesn't: first name, age, town, its words.
export function cardText({ letter, presenting }) {
  const who = [letter.first_name, letter.age === 0 ? "under 1" : String(letter.age)].join(", ") + (letter.town ? `, of ${letter.town}` : "");
  const invite = `Read it in Santa’s mailbag at Wausau Pilot & Review${presenting.length ? `, presented by ${series(presenting)}` : ""}`;
  return {
    title: `${possessive(letter.first_name)} letter to Santa`,
    // A sponsor's name can end in a period ("PGA Inc."): the sentence doesn't get a second one.
    description: `${who}: “${excerpt(letter.body)}” ${invite}${/[.!?]$/.test(invite) ? "" : "."}`,
    alt: letter.photo_id ? `${possessive(letter.first_name)} letter to Santa, in their own hand` : "An airmail envelope addressed to Santa Claus on a snowy night",
  };
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Crawlers read the head. The body is only for a person the crawler check missed: the script sends them
// on, and the link is there if scripts are off. No meta refresh: Facebook's crawler follows one, and would
// read the mailbag page's tags instead of these.
export function renderSharePage({ letter, presenting, image, shareUrl, letterPage }) {
  const { title, description, alt } = cardText({ letter, presenting });
  const size = image.width
    ? `\n<meta property="og:image:width" content="${image.width}">\n<meta property="og:image:height" content="${image.height}">`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wausau Pilot &amp; Review">
<meta property="og:url" content="${escape(shareUrl)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(image.url)}">
<meta property="og:image:type" content="${image.type}">${size}
<meta property="og:image:alt" content="${escape(alt)}">
<meta name="twitter:card" content="summary_large_image">
<style>body{margin:0;padding:2rem 1rem;background:#f5f0e8;color:#1e2622;font:1rem/1.5 system-ui,sans-serif}main{max-width:40rem;margin:0 auto}a{color:#1f5c55}</style>
</head>
<body>
<main>
<h1>${escape(title)}</h1>
<p>${escape(description)}</p>
<p><a href="${escape(letterPage)}">Read it in Santa’s mailbag</a></p>
</main>
<script>location.replace(${JSON.stringify(letterPage).replace(/</g, "\\u003c")});</script>
</body>
</html>
`;
}
