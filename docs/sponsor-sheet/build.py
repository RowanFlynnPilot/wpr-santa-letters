"""Builds the Letters to Santa sponsor sheet: one page Chris can send a business.

    python docs/sponsor-sheet/build.py        # writes letters-to-santa-sponsor-sheet.html beside this file
    scripts/browser-tests.sh sheet            # then prints it to a one-page PDF (needs Docker)

Everything on it is true of the site as built (CLAUDE.md): the placements are the ones the code has, and the
pictures are screenshots of the real pages in preview mode with made-up letters (docs/media, retaken with
`scripts/browser-tests.sh shots`). The four audience figures are the ones WPR's 2026-27 media kit features;
use no others. Prices are blanks on purpose: the rate card publishes none for this promotion, so Chris
writes them in. The page is self-contained (fonts and pictures inside it), so it opens anywhere.
"""
import base64
import io
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def data(path, mime):
    with open(os.path.join(ROOT, path), "rb") as f:
        return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"


def picture(path, width, crop=None):
    im = Image.open(os.path.join(ROOT, path)).convert("RGB")
    if crop:
        im = im.crop(crop)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=84, optimize=True)
    return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"


PREVIEW = "rowanflynnpilot.github.io/wpr-santa-letters/?demo"
PARTS = {
    "fraunces": data("web/src/fonts/fraunces-latin-full-normal.woff2", "font/woff2"),
    "public_sans": data("web/src/fonts/public-sans-latin-wght-normal.woff2", "font/woff2"),
    "badge": data("web/public/wpr-typewriter-badge.png", "image/png"),
    "wordmark": data("web/public/wpr-wordmark.png", "image/png"),
    "mailbag": picture("docs/media/mailbag.png", 1000, crop=(0, 0, 1200, 560)),
    "shared": picture("docs/media/picture-ava.jpg", 560),
    "reply": picture("docs/media/reply.png", 560, crop=(0, 0, 704, 760)),
    "strip": picture("docs/media/strip.png", 1000),
    "preview": PREVIEW,
}

# The page itself, as the artifact takes it: a title, its styles, its content. No <html> or <body>.
PAGE = """<title>Letters to Santa Sponsor Sheet</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One letter-size sheet: WPR's flag, the offer beside the mailbag itself, who sees it, the three levels
   side by side, three more places the stamp goes, and how to say yes. The tool's own look (the airmail
   envelope, Fraunces over Public Sans), in one light theme: it is a sheet of paper, on screen or printed. */
@font-face { font-family: "Fraunces"; font-weight: 100 900; font-display: swap; src: url(%(fraunces)s) format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 100 900; font-display: swap; src: url(%(public_sans)s) format("woff2"); }
:root {
  --paper: #f6f2e9; --sheet: #fffdf8; --ink: #1e2622; --bark: #5f5647; --line: #dcd3c1;
  --teal: #2c6a62; --airmail: #b3261e; --slate: #32373c; --white: #ffffff;
  --display: "Fraunces", Georgia, "Times New Roman", serif;
  --body: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 13px/1.45 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px; }
p, h1, h2, h3, ul, figure { margin: 0; }
ul { padding: 0; list-style: none; }
img { display: block; max-width: 100%%; height: auto; }

.sheet { max-width: 8.5in; margin: 0 auto; background: var(--sheet); border: 1px solid var(--line); }
.stripes { height: 12px; background: repeating-linear-gradient(-45deg, var(--airmail) 0 14px, var(--sheet) 14px 21px, var(--teal) 21px 35px, var(--sheet) 35px 42px); }
.inner { display: grid; gap: 16px; padding: 18px 34px 20px; }

.flag { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding-bottom: 10px;
  border-bottom: 4px solid var(--slate); box-shadow: 0 5px 0 var(--sheet), 0 6px 0 var(--slate); }
.flag .badge { width: 46px; height: 46px; }
.flag .wordmark { height: 30px; width: auto; background: var(--white); }
.flag span { margin-left: auto; color: var(--bark); font: 700 10.5px var(--body); letter-spacing: 0.16em; text-transform: uppercase; }

.offer { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 22px; align-items: center; margin-top: 6px; }
.eyebrow { color: var(--airmail); font: 700 10.5px var(--body); letter-spacing: 0.16em; text-transform: uppercase; }
h1 { margin-top: 6px; font: 650 35px/1.02 var(--display); font-variation-settings: "SOFT" 100, "opsz" 144; letter-spacing: -0.015em; text-wrap: balance; }
.offer p { margin-top: 10px; font-size: 13.5px; }
.dates { margin-top: 12px; padding-left: 12px; border-left: 4px solid var(--airmail); font: 600 14.5px/1.4 var(--display); font-variation-settings: "SOFT" 100; }
figure img { border: 1px solid var(--line); }
figcaption { margin-top: 4px; color: var(--bark); font-size: 11px; line-height: 1.35; }

.reach { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 10px 14px; background: var(--paper); }
.reach b { display: block; font: 650 25px/1.05 var(--display); font-variation-settings: "SOFT" 100; font-variant-numeric: tabular-nums; }
.reach span { color: var(--bark); font-size: 11px; }
.reach p { grid-column: 1 / -1; color: var(--bark); font-size: 10.5px; }

.levels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.level.presenting { grid-column: 1 / -1; }
.level.presenting ul { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 22px; }
.level { display: flex; flex-direction: column; padding: 11px 13px 12px; border: 1px solid var(--line); border-top: 4px solid var(--teal); background: var(--white); }
.level.presenting { border-top-color: var(--airmail); }
.level h2 { font: 650 18px/1.15 var(--display); font-variation-settings: "SOFT" 100; }
.level .only { color: var(--bark); font-size: 11px; }
.level ul { display: grid; gap: 4px; margin: 7px 0 9px; font-size: 12px; line-height: 1.38; }
.level li { padding-left: 13px; position: relative; }
.level li::before { content: ""; position: absolute; left: 0; top: 0.5em; width: 6px; height: 6px; background: var(--teal); border-radius: 50%%; }
.level.presenting li::before { background: var(--airmail); }
.price { display: flex; align-items: baseline; gap: 6px; margin-top: auto; padding-top: 7px; border-top: 1px solid var(--line); font: 600 12.5px var(--body); }
.price i { flex: 1; min-width: 3.5rem; border-bottom: 1.5px solid var(--ink); height: 1.1em; }

.places { display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(0, 0.78fr) minmax(0, 1.44fr); gap: 14px; align-items: start; }
.places img { max-height: 1.8in; width: auto; }
.places figcaption b { color: var(--ink); }

.close { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 20px; padding-top: 12px; border-top: 1px solid var(--line); }
.close h3 { font: 650 16px/1.2 var(--display); font-variation-settings: "SOFT" 100; }
.close p { margin-top: 4px; font-size: 12px; }
.close .who { font-size: 13px; }
.close .who b { font-size: 15px; }
.url, .mail { font-weight: 600; color: var(--teal); overflow-wrap: anywhere; user-select: all; }
.foot { color: var(--bark); font-size: 10.5px; text-align: center; }

@media (max-width: 720px) {
  .inner { padding: 16px; }
  .offer, .levels, .places, .close, .level.presenting ul { grid-template-columns: minmax(0, 1fr); }
  .reach { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .flag span { margin-left: 0; }
  h1 { font-size: 32px; }
}
@media print {
  @page { size: letter; margin: 0; }
  body { padding: 0; background: var(--sheet); }
  .sheet { max-width: none; border: 0; }
  .sheet, .level, .reach, .stripes { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* On paper the words run a size up, and the pictures give them the room. */
  body { font-size: 14.5px; }
  .offer p { font-size: 15px; }
  .level ul, .close p { font-size: 13.5px; }
  .places img { max-height: 1.5in; }
  .inner { gap: 14px; }
}
</style>

<main class="sheet">
  <div class="stripes"></div>
  <div class="inner">
    <header class="flag">
      <img class="badge" src="%(badge)s" alt="">
      <img class="wordmark" src="%(wordmark)s" alt="Wausau Pilot &amp; Review">
      <span>Sponsorship &middot; Holiday 2026</span>
    </header>

    <section class="offer">
      <div>
        <p class="eyebrow">Letters to Santa 2026</p>
        <h1>Your name on Wausau&rsquo;s holiday mailbag</h1>
        <p>Every December, kids across the Wausau area write to Santa and Wausau Pilot &amp; Review publishes their letters. This year the mailbag is a page of its own: families send letters, read everyone else&rsquo;s, post their child&rsquo;s to Facebook and print a reply from Santa. One business presents all of it.</p>
        <p class="dates">Letters open Nov. 27<br>Last day to write: Dec. 18<br>Every letter and the prize winners: Dec. 23</p>
      </div>
      <figure>
        <img src="%(mailbag)s" alt="The Letters to Santa mailbag: an airmail envelope with a stamp reading Your business here, above a child's handwritten letter.">
        <figcaption>The mailbag. Your logo is the stamp. Letters shown are samples; the children are made up.</figcaption>
      </figure>
    </section>

    <section class="reach" aria-label="Wausau Pilot &amp; Review's audience">
      <div><b>1.4M+</b><span>monthly page views</span></div>
      <div><b>354K+</b><span>unique monthly visitors</span></div>
      <div><b>20K+</b><span>email subscribers</span></div>
      <div><b>36K+</b><span>social likes and follows</span></div>
      <p>Wausau Pilot &amp; Review&rsquo;s audience, from its 2026&ndash;27 media kit.</p>
    </section>

    <section class="levels">
      <div class="level presenting">
        <h2>Presenting sponsor</h2>
        <p class="only">One business only. Your logo, linked to your site, all season:</p>
        <ul>
          <li>The stamp on the mailbag&rsquo;s envelope, with &ldquo;Presented by&rdquo; under it</li>
          <li>On the Letters to Santa band on WPR&rsquo;s front page</li>
          <li>On every letter a family saves as a picture to post</li>
          <li>On Santa&rsquo;s printable reply to each child</li>
          <li>On the thank-you page parents see after sending a letter</li>
          <li>Named in the mailbag&rsquo;s section of the Morning Update newsletter and in the Dec. 23 story with all the letters</li>
        </ul>
        <p class="price">Presenting sponsorship: $<i></i></p>
      </div>
      <div class="level">
        <h2>Supporting sponsor</h2>
        <ul>
          <li>Your name or logo, linked to your site, under &ldquo;Thanks to our sponsors&rdquo; on the mailbag all season</li>
        </ul>
        <p class="price">$<i></i></p>
      </div>
      <div class="level">
        <h2>Prize donor</h2>
        <ul>
          <li>Your prize listed by name on the mailbag: &ldquo;A family pizza night from Your Business&rdquo;</li>
          <li>Named again with its winner on Dec. 23</li>
          <li>Listed with our sponsors</li>
        </ul>
        <p class="price">Your prize: <i></i></p>
      </div>
    </section>

    <section class="places">
      <figure>
        <img src="%(shared)s" alt="A child's letter saved as a picture, with the sponsor's stamp in the corner and Wausau Pilot &amp; Review's name along the foot.">
        <figcaption><b>Shared by families.</b> Every letter saved as a picture carries your stamp.</figcaption>
      </figure>
      <figure>
        <img src="%(reply)s" alt="Santa's printable reply to a child, with the sponsor's stamp beside a North Pole postmark.">
        <figcaption><b>Printed at home.</b> Santa&rsquo;s reply to each child.</figcaption>
      </figure>
      <figure>
        <img src="%(strip)s" alt="The Letters to Santa band for WPR's front page, with the sponsor's stamp beside the title and the newest letters.">
        <figcaption><b>On WPR&rsquo;s front page.</b> The mailbag&rsquo;s band, with the newest letters.</figcaption>
      </figure>
    </section>

    <section class="close">
      <div>
        <h3>Good to know</h3>
        <p>Children appear by first name, age and town only, and an editor reads every letter before it&rsquo;s published. Sponsors don&rsquo;t choose or review letters. Links to your site are tagged, so visits from the mailbag show up in your own analytics, and we count clicks from each placement.</p>
      </div>
      <div>
        <h3>See it with your name on it</h3>
        <p>The live preview: <span class="url">%(preview)s</span></p>
        <p class="who"><b>Chris Weber</b><br><span class="mail">weber.chris@wausaupilotandreview.com</span><br>715-301-5539</p>
      </div>
    </section>

    <p class="foot">Wausau Pilot &amp; Review &middot; 715-301-5539 &middot; a nonprofit newsroom serving Marathon County &middot; wausaupilotandreview.com</p>
  </div>
  <div class="stripes"></div>
</main>
"""

page = PAGE % PARTS
with open(os.path.join(HERE, "page.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write(page)
# The same page as a file that opens on its own, for the PDF and for anyone handed the .html.
with open(os.path.join(HERE, "letters-to-santa-sponsor-sheet.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            + page.replace("</style>", "</style>\n</head>\n<body>", 1) + "</body>\n</html>\n")
print("wrote", round(len(page) / 1024), "KB")
