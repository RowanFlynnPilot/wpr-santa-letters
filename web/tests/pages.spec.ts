// The reader's pages in a real browser, at a desk's width and a phone's: what's on them, that nothing
// scrolls sideways (invariant 16), that each sponsor's name sits whole on its stamp, that they pass an
// accessibility scan, and a screenshot of each compared with the last approved one (tests/__screenshots__).
// A screenshot that changes on purpose is re-approved with `scripts/browser-tests.sh update` (README).
// Everything runs in Chrome's engine and in Safari's; the season's other three phases (before letters open,
// after they close, delivery day) each get a test of their own at the foot.
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { usableAds } from "../src/ads";
import { fitLogo, presentedBy } from "../src/emailMarks";
import { hashOf } from "../src/looks";
import { santaReply } from "../src/santaReply";
import {
  ADS,
  FOUR_SPONSORS,
  LETTERS,
  LOGO_SPONSORS,
  mockBackend,
  type Phase,
  PICK,
  PRIZE,
  scrollsSideways,
  settled,
  SIX_PRIZES,
  SPONSOR,
  stampLogos,
  stampsWords,
  stampWords,
  SUPPORTERS,
} from "./fixtures";

const DESK = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

// The approved screenshots are Chrome's. Safari's engine sets type a little differently, so there the
// tests check the page itself (what's on it, the stamp, sideways scroll, accessibility) and skip the picture.
async function shot(page: Page, name: string, options?: { fullPage?: boolean }) {
  if (test.info().project.name === "chromium") await expect(page).toHaveScreenshot(name, options);
}

async function open(
  page: Page,
  path: string,
  size: { width: number; height: number },
  options?: Parameters<typeof mockBackend>[1],
) {
  await page.setViewportSize(size);
  await mockBackend(page, options);
  await page.goto(path);
}

const card = (page: Page, firstName: string) =>
  page.locator(".letter-wall .letter").filter({ has: page.locator(".blank-fill", { hasText: new RegExp(`^${firstName}$`) }) });

async function expectAccessible(page: Page, within?: string) {
  const scan = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]);
  const results = await (within ? scan.include(within) : scan).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

async function expectStampWhole(page: Page) {
  const words = await stampWords(page);
  expect(words.map((w) => w.word)).toEqual(SPONSOR.name.split(" "));
  for (const word of words) expect(word, `"${word.word}" on the stamp`).toMatchObject({ lines: 1, inside: true });
}

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`mailbag, ${name}`, async ({ page }) => {
    await open(page, "#/mailbag", size);
    await expect(page.getByRole("heading", { level: 1, name: "Letters to Santa" })).toBeVisible();
    await expect(page.locator(".countdown")).toHaveText("13 days left to send a letter.");
    await expect(page.locator(".count")).toHaveText("Eight letters in the mailbag");

    // The editor's pick leads, once; the rest are in the wall on all three papers.
    const pick = page.locator(".featured-letter");
    await expect(pick.getByRole("heading", { name: "Editor’s pick" })).toBeVisible();
    await expect(pick.locator(".blank-fill").first()).toHaveText(PICK.first_name);
    await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length - 1);
    const papers = await page.locator(".letter-wall .letter").evaluateAll((cards) => [...new Set(cards.map((c) => (c as HTMLElement).dataset.paper))].sort());
    expect(papers).toEqual(["notebook", "pad", "primary"]);
    await expect(page.locator(".letter-wall .postmark").first()).toHaveAttribute("aria-label", /^Arrived Dec\.\s5$/);

    await settled(page);
    await expectStampWhole(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    await shot(page, `mailbag-${name}.png`, { fullPage: true });
  });
}

test("mailbag without a pick is the letters alone", async ({ page }) => {
  await open(page, "#/mailbag", DESK, { pick: false });
  await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length);
  await expect(page.locator(".featured-letter")).toHaveCount(0);
});

test("a tall photo opens to its whole height and closes again", async ({ page }) => {
  await open(page, "#/mailbag", DESK, { pick: false });
  const ava = card(page, "Ava");
  const photo = ava.locator(".letter-photo img");
  await expect(photo).toBeVisible();
  await settled(page);
  const closed = (await photo.boundingBox())!.height;
  await ava.getByRole("button", { name: "See all of Ava’s letter" }).click();
  await expect(ava.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await photo.boundingBox())!.height).toBeGreaterThan(closed * 1.1);
  // The drawing fits whole, so it has no button.
  await expect(card(page, "Mai").locator(".letter-photo img")).toBeVisible();
  await expect(card(page, "Mai").locator(".letter-photo button")).toHaveCount(0);
});

test("a link to one letter opens it first and leaves no trace of which letter in the address", async ({ page }) => {
  await open(page, `?letter=${LETTERS[0].id}&from=share#/mailbag`, DESK);
  await expect(page.locator(".linked-letter").getByRole("heading", { name: "Emma’s letter" })).toBeVisible();
  expect(page.url()).not.toContain(LETTERS[0].id);
  await expect(card(page, "Emma")).toHaveCount(0);
  await expect(card(page, "Liam")).toHaveCount(1);
});

test("Save it as a picture saves a JPEG of the letter", async ({ page }) => {
  await open(page, "#/mailbag", DESK);
  const download = page.waitForEvent("download");
  await page.locator(".featured-letter").getByRole("button", { name: "Save it as a picture" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("letter-to-santa.jpg");
  const { size } = await import("node:fs").then((fs) => saved.path().then((path) => fs.statSync(path)));
  expect(size).toBeGreaterThan(40_000);
  await expect(page.locator(".featured-letter .share-note")).toHaveText("Picture saved. It’s ready to post.");
});

for (const [name, size] of [["wide", { width: 1100, height: 340 }], ["phone", { width: 375, height: 620 }]] as const) {
  test(`front-page strip, ${name}`, async ({ page }) => {
    await open(page, "#/embed", size);
    const shown = page.locator(".strip-letters li:visible");
    await expect(shown.first().locator(".strip-pick")).toHaveText("Editor’s pick");
    await expect(shown.first().locator(".strip-byline")).toHaveText("Ava, 9, of Schofield");
    // As many letters as fit whole: one on a phone, more across a wide column.
    if (name === "phone") await expect(shown).toHaveCount(1);
    else expect(await shown.count()).toBeGreaterThan(1);
    // Every link leaves the strip for WPR's page.
    expect(await page.locator(".strip a:not(.stamp-face)").evaluateAll((links) => links.every((a) => (a as HTMLAnchorElement).target === "_top"))).toBe(true);

    await settled(page);
    await expectStampWhole(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    await shot(page, `strip-${name}.png`);
  });
}

test("the letter form, phone", async ({ page }) => {
  await open(page, "#/write", PHONE);
  await expect(page.getByRole("heading", { level: 1, name: "Write to Santa" })).toBeVisible();
  // Its head is a short band of the mailbag's night, with the countdown under the heading; the first box
  // to fill in is still on the first screen.
  const band = page.locator(".write-night");
  await expect(band.locator(".countdown")).toHaveText("13 days left to send a letter.");
  await expect(band.locator(".night-horizon")).toBeVisible();
  expect(await band.evaluate((night) => getComputedStyle(night).backgroundColor)).toBe("rgb(16, 40, 58)");
  expect((await band.boundingBox())!.height).toBeLessThan(220);
  await expect(page.getByRole("textbox", { name: /^First name/ })).toBeInViewport();
  const firstName = page.getByRole("textbox", { name: /^First name/ });
  await expect(firstName).toBeVisible();
  // The privacy check speaks up as a parent types, and never blocks (invariant 15).
  await firstName.fill("Emma");
  await page.locator("textarea.ruled").fill("Dear Santa, I go to Riverview Elementary. Call 715-555-0142. Love, Emma Johnson");
  await expect(page.locator(".privacy-note")).toContainText("a school");
  await expect(page.locator(".privacy-note")).toContainText("a phone number");

  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
  await page.locator("textarea.ruled").fill("");
  await firstName.fill("");
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await shot(page, "write-phone.png");

  // Where the band has a corner to spare, the moon is in it.
  await page.setViewportSize(DESK);
  await expect(band.locator(".night-moon")).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  if (test.info().project.name === "chromium") await expect(page.locator(".write-night")).toHaveScreenshot("write-night-desk.png");
});

test("Santa’s reply", async ({ page }) => {
  await open(page, `?letter=${LETTERS[0].id}&from=email#/reply`, { width: 900, height: 1100 });
  await expect(page.getByText("Dear Emma,")).toBeVisible();
  await expect(page.locator(".reply .postmark")).toHaveAttribute("aria-label", /^Postmarked North Pole, Dec\.\s5$/);
  // It promises nothing (invariant 22): none of what Emma asked for.
  await expect(page.locator(".reply-sheet")).not.toContainText(/pupy|sled/i);
  expect(page.url()).not.toContain(LETTERS[0].id);

  await settled(page);
  await expectStampWhole(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
  await shot(page, "reply.png", { fullPage: true });

  // On screen the sheet lies on the night; on paper it is the sheet alone: no blue, no snow, no horizon,
  // no button, and one letter-size page.
  const night = () =>
    page.locator("main.reply").evaluate((main) => ({
      background: getComputedStyle(main).backgroundColor,
      snow: getComputedStyle(main, "::before").display,
    }));
  expect(await night()).toEqual({ background: "rgb(16, 40, 58)", snow: "block" });
  await page.emulateMedia({ media: "print" });
  expect(await night()).toEqual({ background: "rgba(0, 0, 0, 0)", snow: "none" });
  await expect(page.locator(".reply .night-horizon")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print Santa’s reply" })).toBeHidden();
  await expect(page.getByText("Dear Emma,")).toBeVisible();
  if (test.info().project.name === "chromium") expect(await printedPages(page)).toBe(1);
});

// How many sheets the page prints on, with the margins its own print styles ask for.
async function printedPages(page: Page) {
  const pdf = await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" } });
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

test("Santa’s longest possible reply still prints on one sheet", async ({ page }) => {
  // The longest name and town the form allows, a child young enough that Santa thanks the grown-up too,
  // four sponsors in the foot, and the longest version of each of Santa's four parts.
  const child = { first_name: "Maximiliana-Josephine-Annabelle", age: 4, town: "Rhinelander-on-the-Wisconsin River Flats" };
  const words = (n: number) => {
    const reply = santaReply(child, n);
    return reply.paragraphs.join("").length + reply.postscript.length;
  };
  const parts = (n: number) => [n % 4, (n >>> 8) % 4, (n >>> 16) % 4, (n >>> 24) % 4].join();
  let longest = 0;
  for (let n = 0; n < 256; n++) {
    const number = (n & 3) | (((n >> 2) & 3) << 8) | (((n >> 4) & 3) << 16) | (((n >> 6) & 3) << 24);
    if (words(number) > words(longest)) longest = number;
  }
  // A letter whose id picks exactly those four versions (looks.ts's hashOf decides, as on the real page).
  let id = "";
  for (let i = 0; i < 200_000 && !id; i++) {
    const candidate = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    if (parts(hashOf(candidate)) === parts(longest)) id = candidate;
  }
  expect(id).not.toBe("");

  // A letter-size page less 0.6in margins is 700px wide and 940px tall, which is how wide print sets the sheet.
  await page.setViewportSize({ width: 700, height: 1100 });
  await mockBackend(page, { sponsors: FOUR_SPONSORS, letters: [{ id, ...child, photo_id: null, created_at: "2026-12-05T15:00:00Z", body: "Dear Santa" }] });
  await page.goto(`?letter=${id}&from=email#/reply`);
  await expect(page.getByText("Dear Maximiliana-Josephine-Annabelle,")).toBeVisible();
  await expect(page.locator(".reply-sheet")).toContainText("Thank you to the grown-up who helped you write it, too.");
  await settled(page);
  await page.emulateMedia({ media: "print" });
  const height = await page.locator(".reply-sheet").evaluate((sheet) => sheet.getBoundingClientRect().height);
  // With room to spare for a browser that sets type a little wider.
  expect(height).toBeLessThan(915);
  if (test.info().project.name === "chromium") expect(await printedPages(page)).toBe(1);
});


test("a half-written letter is kept across a reload, without the consent tick, and Start over clears it", async ({ page }) => {
  await open(page, "#/write", PHONE);
  const firstName = page.getByRole("textbox", { name: /^First name/ });
  const words = page.locator("textarea.ruled");
  await firstName.fill("Emma");
  await words.fill("Dear Santa, I wud like a pupy.");
  await page.getByRole("checkbox", { name: /parent or/ }).check();
  await expect(page.locator(".kept-letter")).toHaveCount(0);

  // The browser reloads the page (a phone does this when a parent comes back from another app).
  await page.reload();
  await expect(firstName).toHaveValue("Emma");
  await expect(words).toHaveValue("Dear Santa, I wud like a pupy.");
  await expect(page.locator(".kept-letter")).toContainText("We kept what you’d typed.");
  // Saying yes is done fresh each time.
  await expect(page.getByRole("checkbox", { name: /parent or/ })).not.toBeChecked();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(firstName).toHaveValue("");
  await expect(words).toHaveValue("");
  await expect(page.locator(".kept-letter")).toHaveCount(0);
  await page.reload();
  await expect(firstName).toHaveValue("");
});

// Several presenting sponsors --------------------------------------------------------------------

const FOUR_NAMES = "Northwoods Community Bank, Rib River Pizza, Evergreen Orthodontics and Marathon Toy Chest";

// Each sponsor's stamp, in the order they signed on, with every word of its name whole.
async function expectStampsWhole(page: Page, sponsors: { name: string }[]) {
  const stamps = await stampsWords(page);
  expect(stamps.map((words) => words.map((w) => w.word).join(" "))).toEqual(sponsors.map((s) => s.name));
  for (const word of stamps.flat()) expect(word, `"${word.word}" on its stamp`).toMatchObject({ lines: 1, inside: true });
}

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`four presenting sponsors, ${name}: every stamp is on the envelope`, async ({ page }) => {
    await open(page, "#/mailbag", size, { sponsors: FOUR_SPONSORS });
    const stamps = page.locator(".envelope .stamps");
    await expect(stamps.locator("li")).toHaveCount(4);
    await expect(stamps.locator(".stamp-caption")).toHaveText(`Presented by ${FOUR_NAMES}`);
    // A sponsor with a site is a link to it; one without is just its stamp.
    await expect(stamps.locator("a.stamp-face")).toHaveCount(3);
    // All four lead the thanks at the foot.
    await expect(page.locator(".sponsor-list li")).toHaveCount(4);

    await settled(page);
    await expectStampsWhole(page, FOUR_SPONSORS);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    if (test.info().project.name === "chromium") await expect(page.locator(".envelope")).toHaveScreenshot(`envelope-four-${name}.png`);
  });
}

test("two, three and four stamps fit the narrowest phone", async ({ page }) => {
  for (const count of [2, 3, 4]) {
    const sponsors = FOUR_SPONSORS.slice(0, count);
    // A fresh load each time: the same address again would leave the page as it was.
    await page.goto("about:blank");
    await open(page, "#/mailbag", { width: 320, height: 700 }, { sponsors });
    await expect(page.locator(".envelope .stamps li")).toHaveCount(count);
    await settled(page);
    await expectStampsWhole(page, sponsors);
    expect(await scrollsSideways(page), `${count} stamps`).toBe(false);
  }
});

for (const [name, size] of [["wide", { width: 1100, height: 340 }], ["phone", { width: 375, height: 620 }]] as const) {
  test(`four presenting sponsors on the front-page strip, ${name}`, async ({ page }) => {
    await open(page, "#/embed", size, { sponsors: FOUR_SPONSORS });
    await expect(page.locator(".strip .stamps li")).toHaveCount(4);
    await expect(page.locator(".strip-letters li:visible").first()).toBeVisible();
    await settled(page);
    await expectStampsWhole(page, FOUR_SPONSORS);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    await shot(page, `strip-four-${name}.png`);
  });
}

// Sponsors' logos -------------------------------------------------------------------------------

// Each logo is on its stamp, inside it, and as large as the stamp allows, whatever shape or size the file is.
async function expectLogosFill(page: Page, sponsors: { name: string }[]) {
  const logos = await stampLogos(page);
  expect(logos.map((logo) => logo.name)).toEqual(sponsors.map((s) => s.name));
  for (const logo of logos) {
    expect(logo, `${logo.name}’s logo`).toMatchObject({ loaded: true, inside: true });
    expect(logo.fills, `${logo.name}’s logo fills its stamp`).toBeGreaterThan(0.97);
  }
}

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`four sponsors’ logos, ${name}: a wide one, a tall one, a square one and a small file each fill a stamp`, async ({ page }) => {
    await open(page, "#/mailbag", size, { sponsors: LOGO_SPONSORS });
    await expect(page.locator(".envelope .stamps li")).toHaveCount(4);
    await settled(page);
    await expectLogosFill(page, LOGO_SPONSORS);
    // The wide wordmark would be a sliver on a stamp this size, so its name is set in type under it, whole.
    const named = await stampsWords(page);
    expect(named.map((words) => words.map((w) => w.word).join(" "))).toEqual(["Rib River Pizza"]);
    for (const word of named.flat()) expect(word, `"${word.word}" under its logo`).toMatchObject({ lines: 1, inside: true });
    // A logo is a picture: the line under the stamps is where every name can be read.
    await expect(page.locator(".envelope .stamp-caption")).toHaveText(`Presented by ${FOUR_NAMES}`);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    // The stamps alone: on a picture of the whole envelope, a change this small would pass as noise.
    if (test.info().project.name === "chromium") await expect(page.locator(".envelope .stamps")).toHaveScreenshot(`stamps-logos-${name}.png`);
  });
}

test("four sponsors’ logos on the front-page strip", async ({ page }) => {
  await open(page, "#/embed", { width: 1100, height: 340 }, { sponsors: LOGO_SPONSORS });
  await expect(page.locator(".strip .stamps li")).toHaveCount(4);
  await settled(page);
  await expectLogosFill(page, LOGO_SPONSORS);
  await expect(page.locator(".strip .stamp-wordmark .stamp-name")).toHaveText("Rib River Pizza");
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
  if (test.info().project.name === "chromium") await expect(page.locator(".strip .stamps")).toHaveScreenshot("stamps-logos-strip.png");
});

test("one sponsor’s logo fills the single stamp, wide on the envelope and a small file on Santa’s reply", async ({ page }) => {
  // The single stamp is large and has "Presented by" and the name right under it: the logo alone is enough.
  const wide = [LOGO_SPONSORS[1]];
  await open(page, "#/mailbag", PHONE, { sponsors: wide });
  await expect(page.locator(".envelope .stamp-face img")).toBeVisible();
  await settled(page);
  await expectLogosFill(page, wide);
  await expect(page.locator(".envelope .stamp-name")).toHaveCount(0);
  await expect(page.locator(".envelope .stamp-caption")).toHaveText("Presented by Rib River Pizza");
  // A small file is scaled up to the stamp rather than left small in the middle of it.
  const small = [LOGO_SPONSORS[3]];
  await open(page, `?letter=${LETTERS[0].id}&from=email#/reply`, { width: 900, height: 1100 }, { sponsors: small });
  await expect(page.getByText("Dear Emma,")).toBeVisible();
  await expect(page.locator(".reply .stamp-face img")).toBeVisible();
  await settled(page);
  await expectLogosFill(page, small);
});

test("with four presenting sponsors, Santa’s reply carries one stamp and names all four", async ({ page }) => {
  const seen = new Set<string>();
  for (const letter of LETTERS) {
    await open(page, `?letter=${letter.id}&from=email#/reply`, { width: 900, height: 1100 }, { sponsors: FOUR_SPONSORS });
    await expect(page.getByText(`Dear ${letter.first_name},`)).toBeVisible();
    await expect(page.locator(".reply .stamp-face")).toHaveCount(1);
    await expect(page.locator(".reply-foot")).toHaveText(`From Letters to Santa, Wausau Pilot & Review, presented by ${FOUR_NAMES}`);
    seen.add((await page.locator(".reply .stamp-name").textContent()) ?? "");
  }
  // They take turns by letter: across the mailbag's eight letters, more than one sponsor has had one.
  expect(seen.size).toBeGreaterThan(1);
  for (const name of seen) expect(FOUR_SPONSORS.map((s) => s.name)).toContain(name);
});

test("a sales preview shows all four places: the sponsors signed on, “Your business here”, and the rest open", async ({ page }) => {
  await open(page, "?demo#/mailbag", DESK, { sponsors: FOUR_SPONSORS.slice(0, 2) });
  const places = page.locator(".envelope .stamps li");
  await expect(places).toHaveCount(4);
  await expect(places.nth(2)).toHaveText("Your business here");
  await expect(places.nth(3).locator(".stamp-open")).toHaveCount(1);
  await expect(page.locator(".envelope .stamp-caption")).toHaveText("Presented by Northwoods Community Bank, Rib River Pizza and Your business here");
  await expectAccessible(page, ".envelope");

  // Before anyone has signed on: one named place and three open ones, and a letter's picture and Santa's
  // reply carry the stamp of the business being shown the page.
  await page.goto("about:blank");
  await open(page, "?demo#/mailbag", DESK, { sponsors: [] });
  await expect(places).toHaveCount(4);
  await expect(places.first()).toHaveText("Your business here");
  await expect(page.locator(".envelope .stamp-open")).toHaveCount(3);
  await expect(page.locator(".envelope .stamp-caption")).toHaveText("Presented by Your business here");
  // A supporting sponsor's place is shown too, under the envelope.
  await expect(page.locator(".supporters .supporter-open")).toHaveText("Your business here");
  await expectAccessible(page, ".supporters");
  await open(page, `?demo&letter=${LETTERS[0].id}&from=staff#/reply`, { width: 900, height: 1100 }, { sponsors: [] });
  await expect(page.locator(".reply .stamp-name")).toHaveText("Your business here");
  await expect(page.locator(".reply-foot")).toHaveText("From Letters to Santa, Wausau Pilot & Review, presented by Your business here");

  // With all four places taken there is nothing left to offer.
  await page.goto("about:blank");
  await open(page, "?demo#/mailbag", DESK, { sponsors: FOUR_SPONSORS });
  await expect(page.locator(".envelope .stamps li")).toHaveCount(4);
  await expect(page.locator(".envelope .stamps")).not.toContainText("Your business here");
});

test("the thank-you page after a letter carries every presenting sponsor’s stamp", async ({ page }) => {
  // A sales preview sends nothing and shows the page a parent would see: three sponsors and the open place.
  await open(page, "?demo#/write", PHONE, { sponsors: FOUR_SPONSORS.slice(0, 3) });
  await page.getByRole("textbox", { name: /^First name/ }).fill("Emma");
  await page.getByRole("combobox").first().selectOption({ index: 7 });
  await page.locator("textarea.ruled").fill("Dear Santa, I wud like a pupy.");
  await page.getByRole("textbox", { name: /^Your name/ }).fill("Pat Example");
  await page.getByRole("textbox", { name: /^Your email/ }).fill("pat@example.com");
  await page.getByRole("checkbox", { name: /parent or/ }).check();
  await page.locator("form button[type=submit]").click();

  await expect(page.getByRole("heading", { level: 1, name: "Emma’s letter is on its way" })).toBeVisible();
  await expect(page.locator(".sent .stamps li")).toHaveCount(4);
  await expect(page.locator(".sent .stamp-caption")).toHaveText(
    "Presented by Northwoods Community Bank, Rib River Pizza, Evergreen Orthodontics and Your business here",
  );
  await settled(page);
  // The stamps land one after another; look once the last one is down. (The snow behind them never
  // finishes falling, so it isn't waited for.)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
  await expectStampsWhole(page, [...FOUR_SPONSORS.slice(0, 3), { name: "Your business here" }]);
  expect(await scrollsSideways(page)).toBe(false);
  // The thank-you itself: the preview's sample letter under it is the sales page's, not a reader's.
  await expectAccessible(page, ".sent");
  // The envelope lies on the mailbag's night, with the horizon under it.
  await expect(page.locator(".sent-night .night-horizon")).toBeVisible();
  expect(await page.locator(".sent-night").evaluate((night) => getComputedStyle(night).backgroundColor)).toBe("rgb(16, 40, 58)");
  if (test.info().project.name === "chromium") await expect(page.locator(".sent-night")).toHaveScreenshot("sent-four-phone.png");
});

// The night scene -----------------------------------------------------------------------------------

// How far along the route the sleigh is, as a percentage of the way from Wausau to the North Pole.
const sleighAt = (page: Page) => page.locator(".route-track").evaluate((track) => parseFloat(getComputedStyle(track).getPropertyValue("--sleigh")));
const snowfall = (page: Page) => page.locator(".night").evaluate((night) => getComputedStyle(night, "::before").animationName);

test("the night scene: the route, the envelope’s postmark, the pick as a spread, and snow that stops when asked", async ({ page }) => {
  await open(page, "#/mailbag", DESK);
  // The route says what the countdown says, and draws it: Dec. 5 is about a third of the way from
  // Nov. 27 to Dec. 23.
  await expect(page.locator(".route .countdown")).toHaveText("13 days left to send a letter.");
  await expect(page.locator(".route-labels")).toHaveText(/Wausau\s*Nov\.\s27.*Last day to write\s*Dec\.\s18.*North Pole\s*Dec\.\s23/);
  const along = await sleighAt(page);
  expect(along).toBeGreaterThan(28);
  expect(along).toBeLessThan(36);
  await expect(page.locator(".route-sleigh")).toBeVisible();

  // The envelope is cancelled like real mail, where there's room for it.
  await expect(page.locator(".envelope-cancel")).toBeVisible();
  await expect(page.locator(".airmail-label")).toHaveText("Par avion · Air mail");

  // The editor's pick is a spread: the child's own page on the left, the typed words beside it.
  await settled(page);
  const [photo, words] = await Promise.all([".featured-card .letter-photo", ".featured-card .letter-body"].map((s) => page.locator(s).boundingBox()));
  expect(photo!.x + photo!.width).toBeLessThan(words!.x + 12);
  expect(Math.abs(photo!.y - words!.y)).toBeLessThan(160);

  // Snow falls, and hangs still for a reader who has asked for less motion.
  expect(await snowfall(page)).toBe("snowfall");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await snowfall(page)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // On a phone the postmark gives way to the title, and the photo sits above the words.
  await page.goto("about:blank");
  await open(page, "#/mailbag", PHONE);
  await expect(page.locator(".route-sleigh")).toBeVisible();
  await expect(page.locator(".envelope-cancel")).toBeHidden();
  await settled(page);
  const [above, below] = await Promise.all([".featured-card .letter-photo", ".featured-card .letter-body"].map((s) => page.locator(s).boundingBox()));
  expect(above!.y + above!.height).toBeLessThanOrEqual(below!.y + 1);
  expect(await scrollsSideways(page)).toBe(false);
});

for (const [name, size] of [["wide", { width: 1100, height: 340 }], ["phone", { width: 375, height: 620 }]] as const) {
  test(`before the first letter, the front-page strip holds the countdown and the horizon, ${name}`, async ({ page }) => {
    await open(page, "#/embed", size, { phase: "upcoming" });
    await expect(page.locator(".strip-line")).toContainText(/opens Nov\.\s27/);
    await expect(page.locator(".strip-letters")).toHaveCount(0);
    // Where the letters will be: the countdown, on its route, with the sleigh waiting in Wausau.
    await expect(page.locator(".strip-scene .countdown")).toHaveText("Santa’s mailbag opens in seven days.");
    expect(await sleighAt(page)).toBe(0);
    await expect(page.locator(".strip > .night-horizon")).toBeVisible();
    // The scene fits the frame WordPress gives the band: nothing is cut off and nothing scrolls.
    await settled(page);
    const [frame, route, horizon] = await Promise.all([".strip", ".strip-scene .route", ".strip > .night-horizon"].map((s) => page.locator(s).boundingBox()));
    expect(route!.y + route!.height).toBeLessThanOrEqual(horizon!.y + 8);
    expect(frame!.height).toBeLessThanOrEqual(size.height);
    expect(await scrollsSideways(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await expectAccessible(page);
    await shot(page, `strip-upcoming-${name}.png`);
  });
}

test("once letters are in, the strip shows them and not the scene", async ({ page }) => {
  await open(page, "#/embed", { width: 1100, height: 340 });
  await expect(page.locator(".strip-letters li:visible").first()).toBeVisible();
  await expect(page.locator(".strip-scene")).toHaveCount(0);
  await expect(page.locator(".strip > .night-horizon")).toHaveCount(0);
});

test("the sleigh waits in Wausau before letters open and is at the North Pole once they’re delivered", async ({ page }) => {
  await open(page, "#/mailbag", DESK, { phase: "upcoming" });
  await expect(page.locator(".route .countdown")).toHaveText("Santa’s mailbag opens in seven days.");
  expect(await sleighAt(page)).toBe(0);

  await page.goto("about:blank");
  await open(page, "#/mailbag", DESK, { phase: "closed" });
  await expect(page.locator(".route .countdown")).toHaveText("The letters go to the North Pole in three days.");
  // Past the last day to write, short of the Pole.
  const closed = await sleighAt(page);
  expect(closed).toBeGreaterThan(83);
  expect(closed).toBeLessThan(100);

  await page.goto("about:blank");
  await open(page, "#/mailbag", DESK, { phase: "delivered" });
  await expect(page.locator(".winners")).toBeVisible();
  expect(await sleighAt(page)).toBe(100);
  // Nothing left to count down to; the sleigh pulls up beside the star, not on it.
  await expect(page.locator(".countdown")).toHaveCount(0);
  const [sleigh, star] = await Promise.all([".route-sleigh", ".route-star"].map((s) => page.locator(s).boundingBox()));
  expect(sleigh!.x + sleigh!.width).toBeLessThanOrEqual(star!.x + star!.width / 2);
});

// Supporting sponsors, and the prizes ----------------------------------------------------------------

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`supporting sponsors, ${name}: named in a row under the envelope, before the letters`, async ({ page }) => {
    await open(page, "#/mailbag", size, { sponsors: [SPONSOR, ...SUPPORTERS] });
    const row = page.locator(".supporters");
    await expect(row.locator(".supporters-label")).toHaveText("With support from");
    await expect(row.locator("li")).toHaveCount(4);
    // A logo for those that have one, the name for those that don't, in the order they signed on.
    expect(await row.locator("li").evaluateAll((items) => items.map((li) => li.querySelector("img")?.alt ?? li.textContent))).toEqual(
      SUPPORTERS.map((s) => s.name),
    );
    // Those with a site link to it, marked as paid and tagged with where the click came from.
    const links = row.locator("a");
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("rel", /sponsored/);
      await expect(link).toHaveAttribute("href", /utm_content=supporters/);
    }
    // The foot still thanks everyone, the presenting sponsor first.
    await expect(page.locator(".sponsor-list li")).toHaveCount(5);

    await settled(page);
    const [envelope, at, pick] = await Promise.all([".envelope", ".supporters", ".featured-letter"].map((s) => page.locator(s).boundingBox()));
    expect(at!.y).toBeGreaterThanOrEqual(envelope!.y + envelope!.height);
    expect(at!.y + at!.height).toBeLessThanOrEqual(pick!.y + 1);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    if (test.info().project.name === "chromium") await expect(row).toHaveScreenshot(`supporters-${name}.png`);
  });
}

test("supporting sponsors fit the narrowest phone, and a mailbag without any has no row", async ({ page }) => {
  await open(page, "#/mailbag", { width: 320, height: 700 }, { sponsors: [SPONSOR, ...SUPPORTERS] });
  await expect(page.locator(".supporters li")).toHaveCount(4);
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await page.goto("about:blank");
  await open(page, "#/mailbag", DESK);
  await expect(page.locator(".letter-wall")).toBeVisible();
  await expect(page.locator(".supporters")).toHaveCount(0);
});

test("the envelope says there are prizes and takes a reader down to them", async ({ page }) => {
  // Four visits in one test.
  test.setTimeout(90_000);
  await open(page, "#/mailbag", DESK);
  await expect(page.locator(".envelope-prizes")).toContainText("Letters in the mailbag are entered in a drawing for a prize.");
  await expect(page.locator(".prize-list")).not.toBeInViewport();
  await page.getByRole("button", { name: "See the prize" }).click();
  await expect(page.locator(".prize-list")).toBeInViewport();
  await expect(page.locator(".prize-list")).toBeFocused();

  // Six to win, three of them alike: the line counts every one, the list groups them.
  await page.goto("about:blank");
  await open(page, "#/mailbag", PHONE, { sponsors: [SPONSOR, ...SUPPORTERS], prizes: SIX_PRIZES });
  await expect(page.locator(".envelope-prizes")).toContainText("entered in a drawing for six prizes.");
  await expect(page.getByRole("button", { name: "See the prizes" })).toBeVisible();
  await expect(page.locator(".prize-list li")).toHaveCount(4);
  await expect(page.locator(".prize-list")).toContainText("A $25 gift card from Rib River Pizza (three to win)");
  // Each prize is a gift tag: the giver's logo on it when they have one, and how many there are to win
  // without the parentheses a reader of the plain line gets.
  await expect(page.locator(".prize-tag")).toHaveCount(4);
  await expect(page.locator(".prize-tag img")).toHaveCount(3);
  await expect(page.locator(".prize-count")).toHaveText("(three to win)");
  expect(await page.locator(".prize-count .visually-hidden").evaluateAll((marks) => marks.map((mark) => [mark.textContent, Math.round(mark.getBoundingClientRect().width)]))).toEqual([
    ["(", 1],
    [")", 1],
  ]);
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
  if (test.info().project.name === "chromium") await expect(page.locator(".prize-list")).toHaveScreenshot("prizes-phone.png");
  // Side by side where there's room.
  await page.setViewportSize(DESK);
  const tagTops = await page.locator(".prize-tag").evaluateAll((tags) => tags.map((tag) => Math.round(tag.getBoundingClientRect().top / 10)));
  expect(new Set(tagTops).size).toBeLessThan(4);
  expect(await scrollsSideways(page)).toBe(false);
  if (test.info().project.name === "chromium") await expect(page.locator(".prize-list")).toHaveScreenshot("prizes-desk.png");

  // With no prizes there's nothing to say, and on delivery day the winners say it.
  await page.goto("about:blank");
  await open(page, "#/mailbag", DESK, { prizes: [] });
  await expect(page.locator(".countdown")).toBeVisible();
  await expect(page.locator(".envelope-prizes")).toHaveCount(0);
  await page.goto("about:blank");
  await open(page, "#/mailbag", DESK, { phase: "delivered" });
  await expect(page.locator(".winners")).toBeVisible();
  await expect(page.locator(".envelope-prizes")).toHaveCount(0);
});

// Logos beyond the stamps -------------------------------------------------------------------------------

// The made-up logos' own sizes (tests/fixtures/logo-*.png), as the staff page would measure them.
const LOGO_SIZES: Record<string, { width: number; height: number }> = {
  "logo-square.png": { width: 480, height: 480 },
  "logo-wide.png": { width: 800, height: 200 },
  "logo-tall.png": { width: 420, height: 560 },
  "logo-small.png": { width: 96, height: 96 },
};

test("the newsletter’s Presented by line sets four logos side by side, each in its own shape", async ({ page }) => {
  await page.route("https://logos.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(fileURLToPath(new URL(`./fixtures/${route.request().url().split("/").pop()}`, import.meta.url))) }),
  );
  const marks = LOGO_SPONSORS.map((sponsor) => ({
    name: sponsor.name,
    href: sponsor.website_url,
    logo: { src: `https://logos.test/${sponsor.logo_path}`, ...fitLogo(LOGO_SIZES[sponsor.logo_path]) },
  }));
  // As the section sets it: the newsletter's 600px column with 32px gutters (newsletter.ts).
  const column = (line: string) =>
    `<body style="margin:0; background:#ffffff;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;"><tr><td id="line" style="padding:8px 32px 8px; font-family:Helvetica,Arial,sans-serif; font-size:13px; color:#555555;">${line}</td></tr></table></body>`;
  await page.setViewportSize({ width: 640, height: 300 });
  await page.setContent(column(presentedBy(marks)));
  await settled(page);

  const shown = await page.locator("#line img").evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).map((img) => ({ name: img.alt, loaded: img.naturalWidth > 0, w: img.clientWidth, h: img.clientHeight, shape: img.naturalWidth / img.naturalHeight, top: img.getBoundingClientRect().top })),
  );
  expect(shown.map((logo) => logo.name)).toEqual(LOGO_SPONSORS.map((s) => s.name));
  for (const logo of shown) {
    expect(logo.loaded, logo.name).toBe(true);
    // In the room every logo gets, and not squeezed out of its own shape.
    expect(logo.w).toBeLessThanOrEqual(132);
    expect(logo.h).toBeLessThanOrEqual(40);
    expect(Math.max(logo.w / 132, logo.h / 40)).toBeGreaterThan(0.97);
    expect(Math.abs(logo.w / logo.h / logo.shape - 1)).toBeLessThan(0.04);
  }
  // All four on one row of the column.
  expect(Math.max(...shown.map((logo) => logo.top)) - Math.min(...shown.map((logo) => logo.top))).toBeLessThan(40);
  expect(await scrollsSideways(page)).toBe(false);
  if (test.info().project.name === "chromium") await expect(page.locator("#line")).toHaveScreenshot("newsletter-presented-by.png");

  // One sponsor still waiting on its logo is there by name, in its place among the pictures.
  await page.setContent(column(presentedBy([marks[0], { ...marks[1], logo: null }, marks[2]])));
  await expect(page.locator("#line img")).toHaveCount(2);
  await expect(page.locator("#line strong")).toHaveText("Rib River Pizza");
});

test("a saved picture is made with the sponsor’s logo, whatever its shape", async ({ page }, testInfo) => {
  // Four pictures made in one test: more time than a test that makes one (Safari's engine is the slow one).
  test.setTimeout(90_000);
  for (const sponsor of LOGO_SPONSORS) {
    await page.goto("about:blank");
    await open(page, "#/mailbag", DESK, { sponsors: [sponsor] });
    // The picture reads the logo back itself (a fetch), apart from the stamp already on the page.
    const fetched = page.waitForResponse((response) => response.url().endsWith(`sponsor-logos/${sponsor.logo_path}`) && response.request().resourceType() === "fetch");
    const download = page.waitForEvent("download");
    await page.locator(".featured-letter").getByRole("button", { name: "Save it as a picture" }).click();
    expect((await fetched).ok()).toBe(true);
    const saved = await download;
    await saved.saveAs(testInfo.outputPath(`picture-${sponsor.logo_path}.jpg`));
    const { size } = await import("node:fs").then((fs) => fs.statSync(testInfo.outputPath(`picture-${sponsor.logo_path}.jpg`)));
    expect(size).toBeGreaterThan(40_000);
    await expect(page.locator(".featured-letter .share-note")).toHaveText("Picture saved. It’s ready to post.");
  }
});

// The presenting sponsors' banner ads ------------------------------------------------------------

for (const [name, size] of [["desk", DESK], ["phone", PHONE], ["320", { width: 320, height: 700 }]] as const) {
  test(`a presenting sponsor’s banner ad sits above the letters, ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockBackend(page, { ads: ADS });
    await page.goto("?ad=1#/mailbag");
    const ad = page.locator(".sponsor-ad");
    await expect(ad).toHaveCount(1);
    // Whose it is, said and shown; and a paid link like every other here.
    await expect(ad).toHaveAttribute("aria-label", "Presenting sponsor: Pine Ridge Hardware");
    await expect(ad.locator(".sponsor-ad-label")).toHaveText("Presenting sponsor");
    const link = ad.getByRole("link", { name: "Happy holidays from Pine Ridge Hardware" });
    await expect(link).toHaveAttribute(
      "href",
      "https://example.com/pine-ridge?utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=letters-to-santa&utm_content=banner",
    );
    await expect(link).toHaveAttribute("rel", /\bsponsored\b/);
    await expect(link).toHaveAttribute("target", "_blank");

    // The artwork loads, keeps its shape at any width, and stands above the letters.
    await settled(page);
    const picture = ad.locator("img");
    expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(970);
    const box = (await picture.boundingBox())!;
    expect(Math.abs(box.width / box.height - 970 / 500)).toBeLessThan(0.02);
    expect(box.width).toBeLessThanOrEqual(770);
    expect(box.y + box.height).toBeLessThanOrEqual((await page.locator(".letter-wall").boundingBox())!.y);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    if (test.info().project.name === "chromium") await expect(ad).toHaveScreenshot(`ad-${name}.png`);
  });
}

test("each visit shows one sponsor’s ad, and a click on it is counted for that sponsor", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockBackend(page, { ads: ADS });
  // The page draws a number as it loads to choose the ad: here, one that lands on the second of two.
  await page.addInitScript(() => {
    Math.random = () => 0.9;
  });
  await page.goto("#/mailbag");
  const ad = page.locator(".sponsor-ad");
  await expect(ad).toHaveCount(1);
  await expect(ad).toHaveAttribute("aria-label", "Presenting sponsor: Larkspur Dental");

  // The click is counted before the sponsor's site opens (which the test doesn't let it).
  const link = ad.getByRole("link");
  await link.evaluate((a) => a.addEventListener("click", (event) => event.preventDefault()));
  await link.click();
  expect(await counted(page, "Sponsor Click")).toEqual([{ sponsor: "Larkspur Dental", placement: "banner" }]);

  // Asked for by its place in the list, the first shows whatever the draw.
  await page.goto("about:blank");
  await page.goto("?ad=1#/mailbag");
  await expect(page.locator(".sponsor-ad")).toHaveAttribute("aria-label", "Presenting sponsor: Pine Ridge Hardware");
});

test("the mailbag never depends on the ads: no list, a mistyped one, an ad past its last day; and before letters open the ad follows the three steps", async ({ page }) => {
  // Five visits in one test: more time than a test with one.
  test.setTimeout(90_000);
  await page.setViewportSize(DESK);
  const expired = { ...ADS[0], through: "2026-12-04" };
  for (const ads of [null, "<html>not a list</html>", [expired, { ...ADS[1], href: "http://example.com/" }]]) {
    await page.unrouteAll({ behavior: "wait" });
    await mockBackend(page, { ads });
    await page.goto("about:blank");
    await page.goto("#/mailbag");
    await expect(page.locator(".letter-wall .letter").first()).toBeVisible();
    await expect(page.locator(".sponsor-ad")).toHaveCount(0);
  }

  // One still running beside one that has ended: the one still running is the ad, whatever the draw.
  await page.unrouteAll({ behavior: "wait" });
  await mockBackend(page, { ads: [expired, ADS[1]] });
  await page.goto("about:blank");
  await page.goto("#/mailbag");
  await expect(page.locator(".sponsor-ad")).toHaveAttribute("aria-label", "Presenting sponsor: Larkspur Dental");

  // Before the first letter there is nothing for it to stand above: it comes after how the mailbag works.
  await page.unrouteAll({ behavior: "wait" });
  await mockBackend(page, { ads: ADS, phase: "upcoming" });
  await page.goto("about:blank");
  await page.goto("?ad=2#/mailbag");
  await expect(page.locator(".sponsor-ad")).toHaveAttribute("aria-label", "Presenting sponsor: Larkspur Dental");
  await settled(page);
  const [how, ad] = await Promise.all([".how", ".sponsor-ad"].map((part) => page.locator(part).boundingBox()));
  expect(ad!.y).toBeGreaterThanOrEqual(how!.y + how!.height);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
});

test("the season’s own ads: every one in the list would show, and its artwork is there in the shape the list gives", async ({ page, baseURL }) => {
  // The other tests never see the real list (fixtures.ts answers for it). This one reads it as it will be
  // published: a slip in it wouldn't break the mailbag, it would quietly drop a sponsor's ad.
  const folder = fileURLToPath(new URL("../public/ads/", import.meta.url));
  const listed = JSON.parse(readFileSync(`${folder}ads.json`, "utf8")) as unknown[];
  // As of a day before any could have ended: this checks the list, not the calendar.
  const ads = usableAds(listed, "2000-01-01");
  expect(ads.length).toBe(listed.length);
  expect(new Set(ads.map((ad) => ad.sponsor)).size).toBe(ads.length);

  const size = (name: string) =>
    page.evaluate(
      (src) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error(`${src} didn't load`));
          img.src = src;
        }),
      `${baseURL}ads/${name}`,
    );
  await page.goto(`${baseURL}ads/ads.json`);
  for (const ad of ads) {
    expect(await size(ad.image), ad.image).toEqual({ width: ad.width, height: ad.height });
    if (ad.sharp) expect(await size(ad.sharp), ad.sharp).toEqual({ width: ad.width * 2, height: ad.height * 2 });
    // A phone on a slow connection loads these too.
    for (const name of [ad.image, ad.sharp]) if (name) expect(statSync(folder + name).size, name).toBeLessThan(400_000);
  }
});

test("a prize donor is named with its prize and at the foot, not on a stamp or in the supporting sponsors’ row", async ({ page }) => {
  const donor = { id: "00000000-0000-4000-8000-0000000000e1", name: "Sugar Maple Sweets", tier: "donor", logo_path: "logo-wide.png", website_url: "https://example.com/sweets" };
  // The donor signed on first: the order at the foot is by level, then by who signed on first.
  await open(page, "#/mailbag", DESK, {
    sponsors: [donor, SUPPORTERS[0], SPONSOR],
    prizes: [PRIZE, { ...PRIZE, id: "00000000-0000-4000-8000-0000000000e2", sponsor_id: donor.id, description: "a candy basket" }],
  });
  await expect(page.locator(".prize-list li")).toHaveText(["A $50 savings starter from Northwoods Community Bank", "A candy basket from Sugar Maple Sweets"]);
  // One stamp, the presenting sponsor's, and one name in the row a supporting sponsor pays for.
  await expectStampWhole(page);
  await expect(page.locator(".envelope .stamp-caption")).not.toContainText("Sugar Maple");
  await expect(page.locator(".supporters li")).toHaveCount(1);
  await expect(page.locator(".supporters")).not.toContainText("Sugar Maple");
  expect(await page.locator(".sponsor-list li").evaluateAll((items) => items.map((li) => li.querySelector("img")?.alt ?? li.textContent))).toEqual([
    "Northwoods Community Bank",
    "Rib River Pizza",
    "Sugar Maple Sweets",
  ]);
  await expect(page.locator(".sponsor-list a").last()).toHaveAttribute("href", /utm_content=sponsor-list/);
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
});

// What's counted for a sponsor's report -----------------------------------------------------------

// What the page has counted under one name. Plausible's own script isn't loaded in tests, so every count
// waits in the page's queue (analytics.ts), exactly as it would be sent.
const counted = (page: Page, event: string) =>
  page.evaluate((name) => {
    const queue = (window as unknown as { plausible?: { q?: [string, { props?: Record<string, string> }?][] } }).plausible?.q ?? [];
    return queue.filter(([sent]) => sent === name).map(([, options]) => options?.props ?? {});
  }, event);

test("a saved picture and a printed reply count whose stamp they carried, and never which letter", async ({ page }) => {
  const names = FOUR_SPONSORS.map((s) => s.name);
  await page.addInitScript(() => {
    window.print = () => {};
  });

  await open(page, "#/mailbag", DESK, { sponsors: FOUR_SPONSORS });
  const download = page.waitForEvent("download");
  await page.locator(".featured-letter").getByRole("button", { name: "Save it as a picture" }).click();
  await download;
  await expect(page.locator(".featured-letter .share-note")).toHaveText("Picture saved. It’s ready to post.");
  const shared = await counted(page, "Letter Shared");
  expect(shared).toHaveLength(1);
  expect(shared[0].method).toBe("picture, saved");
  expect(names).toContain(shared[0].sponsor);
  expect(Object.keys(shared[0]).sort()).toEqual(["method", "sponsor"]);

  await open(page, `?letter=${LETTERS[0].id}&from=email#/reply`, { width: 900, height: 1100 }, { sponsors: FOUR_SPONSORS });
  await expect(page.getByText("Dear Emma,")).toBeVisible();
  const onTheReply = await page.locator(".reply .stamp-name").textContent();
  await page.getByRole("button", { name: "Print Santa’s reply" }).click();
  // The count names the sponsor whose stamp is on the sheet that was printed.
  expect(await counted(page, "Santa Reply Printed")).toEqual([{ from: "email", sponsor: onTheReply }]);

  // Before any sponsor has signed on, the same counts carry no sponsor at all.
  await open(page, `?letter=${LETTERS[1].id}&from=staff#/reply`, { width: 900, height: 1100 }, { sponsors: [] });
  await expect(page.getByText("Dear Liam,")).toBeVisible();
  await page.getByRole("button", { name: "Print Santa’s reply" }).click();
  expect(await counted(page, "Santa Reply Printed")).toEqual([{ from: "staff" }]);
});

// While the first request is in flight ----------------------------------------------------------

test("on a return visit with several sponsors, the stamps’ place is held while the mailbag loads", async ({ page }) => {
  // A first visit: four stamps in a row above the title, and the browser keeps their names.
  await open(page, "#/mailbag", PHONE, { sponsors: FOUR_SPONSORS });
  await expect(page.locator(".envelope .stamps li")).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("letters-to-santa:stamps"))).toContain("Marathon Toy Chest");

  // The next visit, with the season's answer held back: the envelope already has four blank stamps.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/rest/v1/current_season*", async (route) => {
    await held;
    await route.fallback();
  });
  await page.reload();
  const title = page.getByRole("heading", { level: 1, name: "Letters to Santa" });
  await expect(page.locator("main.mailbag")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".stamps-opening li")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  const before = await title.boundingBox();

  release();
  await expect(page.locator(".countdown")).toBeVisible();
  await expect(page.locator(".envelope .stamp-caption")).toHaveText(`Presented by ${FOUR_NAMES}`);
  const after = await title.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(2);
});

test("the form’s band of night is there before the form loads, and nothing under it moves when it does", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockBackend(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/rest/v1/current_season*", async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("#/write");

  const band = page.locator(".write-night");
  await expect(page.locator("main.write")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Write to Santa" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Loading the letter form…");
  await page.evaluate(() => document.fonts.ready);
  const before = await band.boundingBox();

  release();
  await expect(band.locator(".countdown")).toHaveText("13 days left to send a letter.");
  await expect(page.locator("main.write")).not.toHaveAttribute("aria-busy", "true");
  const after = await band.boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
});

test("the envelope and its title are there before the mailbag loads, and don't move when it does", async ({ page }) => {
  await page.setViewportSize(DESK);
  await mockBackend(page);
  // Hold the season's answer until the test has looked at the page without it.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/rest/v1/current_season*", async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto("#/mailbag");

  const title = page.getByRole("heading", { level: 1, name: "Letters to Santa" });
  await expect(page.locator("main.mailbag")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toHaveText("Opening Santa’s mailbag…");
  await expect(page.locator(".letters-opening .letter")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  const before = await title.boundingBox();

  release();
  await expect(page.locator(".countdown")).toBeVisible();
  await expect(page.locator("main.mailbag")).not.toHaveAttribute("aria-busy", "true");
  const after = await title.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(2);
});

// The season's other phases ----------------------------------------------------------------------

test("before letters open: a countdown to opening day, no form yet", async ({ page }) => {
  await open(page, "#/mailbag", PHONE, { phase: "upcoming" });
  await expect(page.locator(".countdown")).toHaveText("Santa’s mailbag opens in seven days.");
  await expect(page.locator(".lede")).toContainText(/opens Nov\.\s27/);
  await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
  // Where the letters will be: how the mailbag works, in three steps. No prizes are promised beyond the
  // drawing the envelope already names.
  const how = page.locator(".how");
  await expect(how.getByRole("heading", { level: 2 })).toHaveText("How Santa’s mailbag works");
  await expect(how.getByRole("listitem")).toHaveCount(3);
  await expect(how.getByRole("listitem").nth(0)).toContainText(/From Nov\.\s27 through Dec\.\s18, a parent or guardian sends/);
  await expect(how.getByRole("listitem").nth(1)).toContainText("first name, age and town only");
  await expect(how.getByRole("listitem").nth(2)).toHaveText(/On Dec\.\s23, we deliver every letter to the North Pole and name the winners of the prize drawing\./);
  await expect(page.locator(".empty-mailbag")).toHaveCount(0);
  await settled(page);
  await expectStampWhole(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
  if (test.info().project.name === "chromium") await expect(how).toHaveScreenshot("how-phone.png");

  // Side by side on a wide screen, on a line that ends in the route's star.
  await page.setViewportSize(DESK);
  await expect(page.locator(".how-star")).toBeVisible();
  const tops = await how.getByRole("listitem").evaluateAll((steps) => steps.map((step) => Math.round(step.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await scrollsSideways(page)).toBe(false);
  if (test.info().project.name === "chromium") await expect(how).toHaveScreenshot("how-desk.png");
  await page.setViewportSize(PHONE);

  // The form's page says when to come back, on the same night, and offers no boxes to fill in.
  await page.goto("#/write");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".write-night .countdown")).toHaveText("Santa’s mailbag opens in seven days.");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expectAccessible(page);
  await settled(page);
  await shot(page, "write-upcoming-phone.png");

  // The strip says the same, with no button to write and no letters.
  await page.goto("#/embed");
  await expect(page.locator(".strip-line")).toContainText(/opens Nov\.\s27/);
  await expect(page.locator(".strip-letters li")).toHaveCount(0);
});

test("after letters close: the letters stay up, the form is gone, and it counts down to delivery", async ({ page }) => {
  await open(page, "#/mailbag", DESK, { phase: "closed" });
  await expect(page.locator(".countdown")).toHaveText("The letters go to the North Pole in three days.");
  await expect(page.locator(".lede")).toContainText("The mailbag is closed for 2026.");
  await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
  await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length - 1);
  // Nothing more to send, so no other ways to send it; the prizes are still listed.
  await expect(page.getByRole("heading", { name: "Other ways to send a letter" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Prizes" })).toBeVisible();
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  await page.goto("#/write");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

for (const [name, size] of [["desk", DESK], ["phone", PHONE]] as const) {
  test(`delivery day, ${name}: the winners lead the mailbag`, async ({ page }) => {
    await open(page, "#/mailbag", size, { phase: "delivered" });
    const winners = page.locator(".winners");
    await expect(winners.getByRole("heading", { name: "Our 2026 prize winners" })).toBeVisible();
    // Each winner: a rosette, the line that names the prize, and the winning letter itself, which then
    // isn't repeated on the wall below.
    await expect(winners.locator(".winner")).toHaveCount(1);
    await expect(winners.locator(".winner-line")).toHaveText("Emma, 7, of Wausau, wins a $50 savings starter from Northwoods Community Bank.");
    await expect(winners.locator(".winner-rosette")).toBeVisible();
    await expect(winners.locator(".letter .blank-fill").first()).toHaveText("Emma");
    await expect(page.locator(`[data-letter-id="${LETTERS[0].id}"]`)).toHaveCount(1);
    await expect(page.locator(".lede")).toContainText("Every letter is on its way to the North Pole.");
    await expect(page.locator(".envelope-delivered")).toHaveText("Delivered · Dec. 23 · North Pole");
    // Delivered: nothing left to count down to, nothing to send, no prizes still to win.
    await expect(page.locator(".countdown")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Prizes" })).toHaveCount(0);
    // The wall holds every letter but the winner's and the editor's pick, each shown above it.
    await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length - 2);

    await settled(page);
    await expectStampWhole(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    if (test.info().project.name === "chromium") await expect(winners).toHaveScreenshot(`winners-${name}.png`);
    if (name === "desk") await shot(page, "mailbag-delivered-desk.png", { fullPage: true });
  });
}

test("delivery day with several prizes: every winning letter is shown once with its prize, whether it's also the pick or the letter a reader followed a link to", async ({ page }) => {
  // Three visits in one test.
  test.setTimeout(90_000);
  const sponsors = [SPONSOR, ...SUPPORTERS];
  // Emma, the editor's pick (Ava) and Mai, whose letter is a drawing.
  const winners = [LETTERS[0], PICK, LETTERS[4]].map((letter, i) => ({ prize_id: SIX_PRIZES[i].id, letter_id: letter.id }));
  const once = async () => {
    const ids = await page.locator("[data-letter-id]").evaluateAll((letters) => letters.map((letter) => letter.getAttribute("data-letter-id")));
    expect(ids.length).toBe(LETTERS.length);
    expect(new Set(ids).size).toBe(LETTERS.length);
  };

  await open(page, "#/mailbag", { width: 320, height: 700 }, { phase: "delivered", sponsors, prizes: SIX_PRIZES, winners });
  await expect(page.locator(".winner-line")).toHaveText([
    "Emma, 7, of Wausau, wins a $50 savings starter from Northwoods Community Bank.",
    "Ava, 9, of Schofield, wins a family pizza night from Rib River Pizza.",
    "Mai, 8, of Wausau, wins a $25 gift card from Rib River Pizza.",
  ]);
  await expect(page.locator(".winners .letter")).toHaveCount(3);
  // The pick won: it's with the winners, not set out a second time as the pick.
  await expect(page.locator(".featured-letter")).toHaveCount(0);
  await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length - 3);
  await once();
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  // At a desk the three stand side by side.
  await page.setViewportSize(DESK);
  const tops = await page.locator(".winner").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await scrollsSideways(page)).toBe(false);

  // A reader who followed a link to a winning letter has it at the top already: the winners name the
  // prize beside it and don't show the letter again.
  await page.goto("about:blank");
  await page.goto(`?letter=${LETTERS[0].id}&from=share#/mailbag`);
  await expect(page.locator(".linked-letter .letter .blank-fill").first()).toHaveText("Emma");
  await expect(page.locator(".winner-line")).toHaveCount(3);
  await expect(page.locator(".winners .letter")).toHaveCount(2);
  await once();
});

test("delivery day: the strip sends readers to the letters and the winners", async ({ page }) => {
  await open(page, "#/embed", { width: 1100, height: 340 }, { phase: "delivered" });
  await expect(page.locator(".strip-line")).toHaveText("Every letter is on its way to the North Pole. Read them all, and see who won the prizes.");
  await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the letters" })).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});
