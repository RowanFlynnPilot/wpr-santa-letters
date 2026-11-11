// Makes web/public/og-image.png, the picture a pasted link to the app shows (index.html's og:image): the
// envelope, 1200 by 630, drawn with the page's own fonts and colors. Run it when the look changes:
//
//   scripts/browser-tests.sh og
//
// It runs in the same Playwright image as the browser tests, so it needs nothing installed here.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const data = (path, type) => `data:${type};base64,${readFileSync(new URL(path, import.meta.url)).toString("base64")}`;
const fraunces = data("../src/fonts/fraunces-latin-full-normal.woff2", "font/woff2");
const publicSans = data("../src/fonts/public-sans-latin-wght-normal.woff2", "font/woff2");
const badge = data("../public/wpr-typewriter-badge.png", "image/png");
const wordmark = data("../public/wpr-wordmark.png", "image/png");

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(${fraunces}) format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 100 900; src: url(${publicSans}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; padding: 26px; color: #1e2622;
  background: repeating-linear-gradient(-45deg, #b3261e 0 30px, #fffdf8 30px 45px, #2c6a62 45px 75px, #fffdf8 75px 90px); }
.face { position: relative; height: 100%; background: #fffdf8; display: grid; grid-template-rows: 1fr auto; }
.words { padding: 62px 70px 0; }
h1 { font: 650 124px/1 Fraunces, serif; font-variation-settings: "SOFT" 100, "opsz" 144; letter-spacing: -0.02em; }
.address { margin-top: 34px; padding-left: 26px; border-left: 6px solid #b3261e;
  font: 600 40px/1.35 Fraunces, serif; font-variation-settings: "SOFT" 100; }
.stamp { position: absolute; top: 58px; right: 64px; width: 172px; height: 214px; padding: 14px; background: #fff;
  rotate: 3deg; filter: drop-shadow(0 2px 3px rgba(30, 38, 34, 0.3)); }
.stamp div { height: 100%; display: grid; place-items: center; background: #3a867c; }
.stamp img { width: 104px; height: 104px; border-radius: 50%; }
.flag { display: flex; align-items: center; gap: 18px; padding: 20px 70px 22px; background: #fff;
  border-top: 5px solid #32373c; box-shadow: inset 0 9px 0 #fff, inset 0 10px 0 #32373c; }
.flag img.badge { width: 76px; height: 76px; }
.flag img.wordmark { height: 46px; }
.flag span { margin-left: auto; color: #6e6353; font: 600 24px "Public Sans", sans-serif; }
</style>
<div class="face">
  <div class="words">
    <h1>Letters to Santa</h1>
    <p class="address">To Santa Claus, at the North Pole<br>From the kids of the Wausau area</p>
  </div>
  <div class="stamp"><div><img src="${badge}" alt=""></div></div>
  <div class="flag"><img class="badge" src="${badge}" alt=""><img class="wordmark" src="${wordmark}" alt=""><span>The holiday mailbag</span></div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("../public/og-image.png", import.meta.url).pathname });
await browser.close();
console.log("wrote web/public/og-image.png");
