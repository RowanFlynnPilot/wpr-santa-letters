// Makes the launch kit in docs/social: the pictures WPR posts to promote the mailbag, and the words to
// post with them. Three moments (letters open, a week left, delivery day), each as a feed picture (1080 by
// 1350) and a story (1080 by 1920), on the mailbag's winter night with the envelope on it, drawn with the
// page's own fonts and colors as og-image.mjs draws the link's picture. Every one names the presenting
// sponsors, as the sponsor sheet promises of every post promoting the mailbag.
//
//   scripts/browser-tests.sh social
//
// What changes from year to year, or as sponsors sign on, is in docs/social/kit.json: the presenting
// sponsors' names as their rows have them and in the order they signed on, the season's three dates, and
// the page's address as a reader would type it. Change it, run this again, and every picture and
// docs/social/posts.md are remade. It runs in the same Playwright image as the browser tests.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = process.argv[2];
if (!out) throw new Error("Say where the kit goes: node tests/social.mjs <folder holding kit.json>");
const kit = JSON.parse(readFileSync(join(out, "kit.json"), "utf8"));
for (const key of ["presenting", "opens", "closes", "delivered", "page"]) {
  if (!kit[key]) throw new Error(`docs/social/kit.json has no "${key}".`);
}

const data = (path, type) => `data:${type};base64,${readFileSync(new URL(path, import.meta.url)).toString("base64")}`;
const fraunces = data("../src/fonts/fraunces-latin-full-normal.woff2", "font/woff2");
const publicSans = data("../src/fonts/public-sans-latin-wght-normal.woff2", "font/woff2");
const badge = data("../public/wpr-typewriter-badge.png", "image/png");
const wordmark = data("../public/wpr-wordmark.png", "image/png");

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// AP series: "Mia, Si and Ethan" (format.ts).
const series = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const presenters = series(kit.presenting);
// The same line for a picture: a line may end between two sponsors, never inside one's name.
const whole = (name) => `<span class="whole">${escape(name)}</span>`;
const presentersSet = kit.presenting.length < 2
  ? kit.presenting.map(whole).join("")
  : `${kit.presenting.slice(0, -1).map(whole).join(", ")} and ${whole(kit.presenting.at(-1))}`;
// A date stays on one line: "Dec. 23", never "Dec." and then "23".
const dates = (text) => escape(text).replace(/([A-Z][a-z]+\.?) (\d{1,2})/g, "$1&nbsp;$2");

// The three moments. `lines` sit under the headline as the envelope's address does on the mailbag.
const MOMENTS = [
  {
    file: "1-letters-open",
    when: `${kit.opens}, the day letters open`,
    headline: "Santa’s mailbag is open",
    lines: [`Send your child’s letter through ${kit.closes}.`, `We deliver them all on ${kit.delivered}.`],
    post:
      `Santa’s mailbag is open! Parents and guardians, send your child’s letter to Santa through ${kit.closes}: type it, ` +
      `email it or mail it. We post letters as they come in and deliver every one to the North Pole on ${kit.delivered}.`,
  },
  {
    file: "2-one-week-left",
    when: "a week before letters close",
    headline: "One week left to write to Santa",
    // A longer headline is set a little smaller, so it still takes two lines beside the stamp.
    size: 94,
    lines: [`Letters close ${kit.closes}.`, "Type it, email it or mail it."],
    post:
      `One week left to write to Santa. Letters close ${kit.closes}. Read the ones already in the mailbag, and send ` +
      "your child’s before the sleigh leaves.",
  },
  {
    file: "3-delivered",
    when: `${kit.delivered}, delivery day`,
    headline: "Delivered to the North Pole",
    lines: ["Read every letter in Santa’s mailbag.", "And see who won the prize drawing."],
    post:
      "Every letter is on its way to the North Pole. Read them all, and see who won the prize drawing. Thank you to " +
      "all the kids who wrote, and to the grown-ups who helped.",
  },
];

// Two shapes. A story keeps its top and its foot clear, where the app draws its own buttons over the picture.
const SHAPES = [
  { name: "feed", height: 1350, top: 150, foot: 300, snow: 112, address: 34 },
  { name: "story", height: 1920, top: 330, foot: 520, snow: 330, address: 40 },
];

// Snow: the same dots as the page's, scattered once down the picture's height.
const flakes = (height) =>
  [
    [44, 0.05, 3], [150, 0.02, 2], [262, 0.09, 2.5], [392, 0.03, 2], [520, 0.015, 3], [668, 0.045, 2], [806, 0.02, 2.5],
    [30, 0.2, 2.5], [1052, 0.24, 2], [22, 0.38, 2], [1060, 0.44, 3], [40, 0.56, 3], [1046, 0.6, 2], [96, 0.68, 2],
    [1010, 0.7, 2.5], [300, 0.66, 2], [700, 0.64, 2.5], [520, 0.7, 2], [880, 0.1, 2],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${Math.round(y * height)}" r="${r}" />`)
    .join("");

function picture(moment, shape) {
  return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(${fraunces}) format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 100 900; src: url(${publicSans}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { position: relative; width: 1080px; height: ${shape.height}px; overflow: hidden; background: #10283a; color: #1e2622; }
.snow { position: absolute; inset: 0; fill: #fffdf8; opacity: 0.85; }
.moon { position: absolute; top: ${shape.top - 110}px; right: 56px; width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle at 34% 36%, #e6dcba 0 11px, transparent 12px),
    radial-gradient(circle at 66% 64%, #e6dcba 0 8px, transparent 9px), #f4ecd2; }
.kicker { position: absolute; top: ${shape.top - 76}px; left: 60px; color: #f4ecd2;
  font: italic 500 40px/1 Fraunces, serif; font-variation-settings: "SOFT" 100; }
.stage { position: absolute; top: ${shape.top}px; bottom: ${shape.foot}px; left: 54px; right: 54px;
  display: flex; flex-direction: column; justify-content: center; gap: 50px; }
.envelope { padding: 20px; rotate: -1.5deg;
  background: repeating-linear-gradient(-45deg, #b3261e 0 26px, #fffdf8 26px 39px, #2c6a62 39px 65px, #fffdf8 65px 78px);
  box-shadow: 0 24px 48px rgba(4, 14, 22, 0.55); }
.face { background: #fffdf8; }
.words { padding: 40px 48px 44px; }
.words::after { content: ""; display: block; clear: both; }
.stamp { float: right; width: 150px; height: 186px; margin: -6px -6px 24px 36px; padding: 12px; background: #fff;
  rotate: 3deg; filter: drop-shadow(0 2px 3px rgba(30, 38, 34, 0.3)); }
.stamp div { height: 100%; display: grid; place-items: center; background: #3a867c; }
.stamp img { width: 94px; height: 94px; border-radius: 50%; }
.airmail { display: inline-block; padding: 6px 14px; border: 3px solid #2c6a62; color: #2c6a62;
  font: 700 19px/1 "Public Sans", sans-serif; letter-spacing: 0.16em; text-transform: uppercase; }
h1 { margin-top: 26px; font: 650 ${moment.size ?? 104}px/1.02 Fraunces, serif; font-variation-settings: "SOFT" 100, "opsz" 144;
  letter-spacing: -0.02em; text-wrap: balance; }
.address { margin-top: 34px; padding-left: 24px; border-left: 7px solid #b3261e;
  font: 600 36px/1.35 Fraunces, serif; font-variation-settings: "SOFT" 100; }
.flag { display: flex; align-items: center; gap: 16px; padding: 14px 48px 15px; background: #fff; border-top: 4px solid #32373c; }
.flag img.badge { width: 60px; height: 60px; }
.flag img.wordmark { height: 40px; }
.flag span { margin-left: auto; color: #6e6353; font: 600 22px "Public Sans", sans-serif; }
.presented { padding: 0 26px; text-align: center; color: #f4ecd2; }
.presented small { display: block; font: 700 21px/1 "Public Sans", sans-serif; letter-spacing: 0.18em; text-transform: uppercase; }
.presented p { margin-top: 14px; font: 600 42px/1.25 Fraunces, serif; font-variation-settings: "SOFT" 100; text-wrap: balance; }
.whole { white-space: nowrap; }
.horizon { position: absolute; left: 0; bottom: ${shape.snow - 2}px; width: 1080px; height: 190px; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: ${shape.snow}px; background: #f6f2e9; text-align: center;
  font: 700 ${shape.address}px/1 "Public Sans", sans-serif; color: #1e2622; }
.foot p { padding-top: ${shape.name === "story" ? 4 : 30}px; }
</style>
<svg class="snow" viewBox="0 0 1080 ${shape.height}">${flakes(shape.height)}</svg>
<div class="moon"></div>
<p class="kicker">Letters to Santa</p>
<div class="stage">
  <div class="envelope">
    <div class="face">
      <div class="words">
        <div class="stamp"><div><img src="${badge}" alt=""></div></div>
        <p class="airmail">Par avion · Air mail</p>
        <h1>${escape(moment.headline)}</h1>
        <p class="address">${moment.lines.map(dates).join("<br>")}</p>
      </div>
      <div class="flag"><img class="badge" src="${badge}" alt=""><img class="wordmark" src="${wordmark}" alt=""><span>The holiday mailbag</span></div>
    </div>
  </div>
  <div class="presented"><small>Presented by</small><p>${presentersSet}</p></div>
</div>
<svg class="horizon" viewBox="0 0 1280 170" preserveAspectRatio="xMidYMax slice">
  <path fill="#183b52" d="M0 108 Q 320 58 640 98 T 1280 78 V170 H0 Z" />
  <g fill="#0b1d2a">
    <polygon points="232,30 204,88 260,88" /><polygon points="232,60 196,128 268,128" />
    <polygon points="318,72 300,108 336,108" /><polygon points="318,90 294,132 342,132" />
    <polygon points="402,48 378,96 426,96" /><polygon points="402,72 370,130 434,130" />
    <polygon points="560,74 544,106 576,106" /><polygon points="560,90 538,128 582,128" />
    <polygon points="880,58 858,102 902,102" /><polygon points="880,80 852,130 908,130" />
    <polygon points="1010,44 986,94 1034,94" /><polygon points="1010,68 978,128 1042,128" />
    <polygon points="1082,66 1064,104 1100,104" /><polygon points="1082,86 1058,130 1106,130" />
  </g>
  <path fill="#f6f2e9" d="M0 136 Q 200 104 460 128 T 900 122 T 1280 110 V170 H0 Z" />
</svg>
<div class="foot"><p>${escape(kit.page)}</p></div>`;
}

const browser = await chromium.launch();
for (const shape of SHAPES) {
  const page = await browser.newPage({ viewport: { width: 1080, height: shape.height } });
  for (const moment of MOMENTS) {
    await page.setContent(picture(moment, shape));
    await page.evaluate(() => document.fonts.ready);
    // Nothing may run under the horizon or off the picture: a long list of sponsors would, without a word.
    const fits = await page.evaluate(() => {
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const inside = [...document.querySelectorAll(".envelope, .presented")].map((part) => part.getBoundingClientRect());
      return inside.every((box) => box.top >= stage.top - 20 && box.bottom <= stage.bottom + 20);
    });
    if (!fits) throw new Error(`${moment.file}-${shape.name}: the words don’t fit. Shorten them, or the sponsors’ line, in social.mjs.`);
    await page.screenshot({ path: join(out, `${moment.file}-${shape.name}.png`) });
    console.log(`wrote docs/social/${moment.file}-${shape.name}.png`);
  }
  await page.close();
}
await browser.close();

// The words to post with each picture. The sponsors are named in every one, and the link is the page's.
const link = `https://${kit.page}/`;
const posts = [
  "# Letters to Santa: what to post, and when",
  "",
  "Made by `scripts/browser-tests.sh social` from `kit.json`; change that file and run it again rather than editing this one.",
  "Each post has a feed picture (1080 by 1350, for Facebook and Instagram) and a story (1080 by 1920). Every post names the",
  "presenting sponsors, as the sponsor sheet promises.",
  "",
  ...MOMENTS.flatMap((moment) => [
    `## ${moment.headline}`,
    "",
    `When: ${moment.when}.`,
    `Pictures: \`${moment.file}-feed.png\`, \`${moment.file}-story.png\`.`,
    "",
    `> ${moment.post} ${link}`,
    ">",
    `> Letters to Santa is presented by ${presenters}${/[.!?]$/.test(presenters) ? "" : "."}`,
    "",
    `Picture description (alt text): An airmail envelope on a snowy night reads “${moment.headline}.” ${moment.lines.join(" ")} Presented by ${presenters}${/[.!?]$/.test(presenters) ? "" : "."}`,
    "",
  ]),
];
writeFileSync(join(out, "posts.md"), posts.join("\n"));
console.log("wrote docs/social/posts.md");
