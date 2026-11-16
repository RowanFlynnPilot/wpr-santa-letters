// The reader's pages in a real browser, at a desk's width and a phone's: what's on them, that nothing
// scrolls sideways (invariant 16), that each sponsor's name sits whole on its stamp, that they pass an
// accessibility scan, and a screenshot of each compared with the last approved one (tests/__screenshots__).
// A screenshot that changes on purpose is re-approved with `scripts/browser-tests.sh update` (README).
// Everything runs in Chrome's engine and in Safari's; the season's other three phases (before letters open,
// after they close, delivery day) each get a test of their own at the foot.
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { fitLogo, presentedBy } from "../src/emailMarks";
import {
  FOUR_SPONSORS,
  LETTERS,
  LOGO_SPONSORS,
  mockBackend,
  type Phase,
  PICK,
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
  options?: { pick?: boolean; phase?: Phase; sponsors?: unknown[]; prizes?: unknown[] },
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
  // The stamps land one after another; look once the last one is down.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  await expectStampsWhole(page, [...FOUR_SPONSORS.slice(0, 3), { name: "Your business here" }]);
  expect(await scrollsSideways(page)).toBe(false);
  // The thank-you itself: the preview's sample letter under it is the sales page's, not a reader's.
  await expectAccessible(page, ".sent");
  if (test.info().project.name === "chromium") await expect(page.locator(".sent")).toHaveScreenshot("sent-four-phone.png");
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
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

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
  await expect(page.locator(".empty-mailbag")).toHaveText(/The first letters come in Nov\.\s27\./);
  await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
  await settled(page);
  await expectStampWhole(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  // The form's page says when to come back, and offers no boxes to fill in.
  await page.goto("#/write");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expectAccessible(page);

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
    await expect(winners.getByRole("listitem")).toHaveText("Emma, 7, of Wausau, wins a $50 savings starter from Northwoods Community Bank.");
    await expect(page.locator(".lede")).toContainText("Every letter is on its way to the North Pole.");
    // Delivered: nothing left to count down to, nothing to send, no prizes still to win.
    await expect(page.locator(".countdown")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Prizes" })).toHaveCount(0);
    await expect(page.locator(".letter-wall .letter")).toHaveCount(LETTERS.length - 1);

    await settled(page);
    await expectStampWhole(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
    if (name === "desk") await shot(page, "mailbag-delivered-desk.png", { fullPage: true });
  });
}

test("delivery day: the strip sends readers to the letters and the winners", async ({ page }) => {
  await open(page, "#/embed", { width: 1100, height: 340 }, { phase: "delivered" });
  await expect(page.locator(".strip-line")).toHaveText("Every letter is on its way to the North Pole. Read them all, and see who won the prizes.");
  await expect(page.getByRole("link", { name: "Write a letter to Santa" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the letters" })).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});
