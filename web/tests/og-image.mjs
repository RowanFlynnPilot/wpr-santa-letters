// Makes web/public/og-image.png, the picture a pasted link to the app shows (index.html's og:image): the
// envelope on the mailbag's winter night, 1200 by 630, drawn with the page's own fonts and colors (the
// night, the moon, the horizon and its pines are Night.tsx's and styles.css's, set down here by hand).
// Run it when the look changes:
//
//   scripts/browser-tests.sh og
//
// It runs in the same Playwright image as the browser tests, so it needs nothing installed here. A link to
// WPR's own Letters to Santa page takes its picture from WordPress, not from here: give that page this
// file as its featured image.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const data = (path, type) => `data:${type};base64,${readFileSync(new URL(path, import.meta.url)).toString("base64")}`;
const fraunces = data("../src/fonts/fraunces-latin-full-normal.woff2", "font/woff2");
const publicSans = data("../src/fonts/public-sans-latin-wght-normal.woff2", "font/woff2");
const badge = data("../public/wpr-typewriter-badge.png", "image/png");
const wordmark = data("../public/wpr-wordmark.png", "image/png");

// Snow: the same dots as the page's, scattered once (a picture has no tile to repeat or to fall).
const flakes = [
  [38, 60, 3], [128, 22, 2], [236, 96, 2.5], [352, 30, 2], [470, 18, 3], [596, 44, 2], [724, 16, 2.5], [842, 52, 2],
  [928, 24, 3], [1166, 190, 2.5], [1178, 330, 2], [1160, 452, 3], [24, 214, 2.5], [40, 372, 2], [22, 486, 3],
  [86, 560, 2], [1120, 566, 2.5], [1010, 40, 2], [300, 72, 2], [660, 80, 2],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" />`)
  .join("");

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(${fraunces}) format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 100 900; src: url(${publicSans}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { position: relative; width: 1200px; height: 630px; overflow: hidden; background: #10283a; color: #1e2622; }
.snow { position: absolute; inset: 0; fill: #fffdf8; opacity: 0.85; }
.moon { position: absolute; top: 26px; right: 44px; width: 104px; height: 104px; border-radius: 50%;
  background: radial-gradient(circle at 34% 36%, #e6dcba 0 10px, transparent 11px),
    radial-gradient(circle at 66% 64%, #e6dcba 0 7px, transparent 8px), #f4ecd2; }
.count { position: absolute; top: 30px; left: 0; width: 100%; text-align: center; color: #f4ecd2;
  font: italic 500 30px/1 Fraunces, serif; font-variation-settings: "SOFT" 100; }
.horizon { position: absolute; left: 0; bottom: 0; width: 1200px; height: 160px; }
.envelope { position: absolute; top: 86px; left: 70px; width: 1000px; height: 428px; padding: 18px; rotate: -1.5deg;
  background: repeating-linear-gradient(-45deg, #b3261e 0 26px, #fffdf8 26px 39px, #2c6a62 39px 65px, #fffdf8 65px 78px);
  box-shadow: 0 22px 44px rgba(4, 14, 22, 0.55); }
.face { position: relative; height: 100%; background: #fffdf8; display: grid; grid-template-rows: 1fr auto; }
.words { padding: 28px 46px 0; }
.airmail { display: inline-block; padding: 5px 12px; border: 3px solid #2c6a62; color: #2c6a62;
  font: 700 17px/1 "Public Sans", sans-serif; letter-spacing: 0.16em; text-transform: uppercase; }
h1 { margin-top: 14px; font: 650 100px/1 Fraunces, serif; font-variation-settings: "SOFT" 100, "opsz" 144; letter-spacing: -0.02em; }
.address { margin-top: 20px; padding-left: 22px; border-left: 6px solid #b3261e;
  font: 600 31px/1.35 Fraunces, serif; font-variation-settings: "SOFT" 100; }
.stamp { position: absolute; top: 30px; right: 40px; width: 138px; height: 172px; padding: 11px; background: #fff;
  rotate: 3deg; filter: drop-shadow(0 2px 3px rgba(30, 38, 34, 0.3)); }
.stamp div { height: 100%; display: grid; place-items: center; background: #3a867c; }
.stamp img { width: 86px; height: 86px; border-radius: 50%; }
.flag { display: flex; align-items: center; gap: 14px; padding: 12px 46px 13px; background: #fff; border-top: 4px solid #32373c; }
.flag img.badge { width: 54px; height: 54px; }
.flag img.wordmark { height: 36px; }
.flag span { margin-left: auto; color: #6e6353; font: 600 20px "Public Sans", sans-serif; }
</style>
<svg class="snow" viewBox="0 0 1200 630">${flakes}</svg>
<div class="moon"></div>
<p class="count">From Wausau to the North Pole</p>
<svg class="horizon" viewBox="0 0 1280 170" preserveAspectRatio="xMidYMax slice">
  <path fill="#183b52" d="M0 108 Q 320 58 640 98 T 1280 78 V170 H0 Z" />
  <g fill="#0b1d2a">
    <polygon points="70,40 44,92 96,92" /><polygon points="70,66 36,128 104,128" />
    <polygon points="150,62 130,104 170,104" /><polygon points="150,84 124,134 176,134" />
    <polygon points="232,30 204,88 260,88" /><polygon points="232,60 196,128 268,128" />
    <polygon points="318,72 300,108 336,108" /><polygon points="318,90 294,132 342,132" />
    <polygon points="560,74 544,106 576,106" /><polygon points="560,90 538,128 582,128" />
    <polygon points="880,58 858,102 902,102" /><polygon points="880,80 852,130 908,130" />
    <polygon points="1082,40 1056,92 1108,92" /><polygon points="1082,66 1048,128 1116,128" />
    <polygon points="1150,66 1132,104 1168,104" /><polygon points="1150,86 1126,130 1174,130" />
    <polygon points="1224,40 1198,92 1250,92" /><polygon points="1224,68 1190,126 1258,126" />
  </g>
  <path fill="#f6f2e9" d="M0 136 Q 200 104 460 128 T 900 122 T 1280 110 V170 H0 Z" />
</svg>
<div class="envelope">
  <div class="face">
    <div class="words">
      <p class="airmail">Par avion · Air mail</p>
      <h1>Letters to Santa</h1>
      <p class="address">To Santa Claus, at the North Pole<br>From the kids of the Wausau area</p>
    </div>
    <div class="stamp"><div><img src="${badge}" alt=""></div></div>
    <div class="flag"><img class="badge" src="${badge}" alt=""><img class="wordmark" src="${wordmark}" alt=""><span>The holiday mailbag</span></div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("../public/og-image.png", import.meta.url).pathname });
await browser.close();
console.log("wrote web/public/og-image.png");
