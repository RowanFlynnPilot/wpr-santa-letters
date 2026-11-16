// The reader's pages in a real browser, at a desk's width and a phone's: what's on them, that nothing
// scrolls sideways (invariant 16), that each sponsor's name sits whole on its stamp, that they pass an
// accessibility scan, and a screenshot of each compared with the last approved one (tests/__screenshots__).
// A screenshot that changes on purpose is re-approved with `scripts/browser-tests.sh update` (README).
// Everything runs in Chrome's engine and in Safari's; the season's other three phases (before letters open,
// after they close, delivery day) each get a test of their own at the foot.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FOUR_SPONSORS, LETTERS, LOGO_SPONSORS, mockBackend, type Phase, PICK, scrollsSideways, settled, SPONSOR, stampLogos, stampsWords, stampWords } from "./fixtures";

const DESK = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

// The approved screenshots are Chrome's. Safari's engine sets type a little differently, so there the
// tests check the page itself (what's on it, the stamp, sideways scroll, accessibility) and skip the picture.
async function shot(page: Page, name: string, options?: { fullPage?: boolean }) {
  if (test.info().project.name === "chromium") await expect(page).toHaveScreenshot(name, options);
}

async function open(page: Page, path: string, size: { width: number; height: number }, options?: { pick?: boolean; phase?: Phase; sponsors?: unknown[] }) {
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
