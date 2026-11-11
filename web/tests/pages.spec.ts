// The reader's pages in a real browser, at a desk's width and a phone's: what's on them, that nothing
// scrolls sideways (invariant 16), that the sponsor's name sits whole on the stamp, that they pass an
// accessibility scan, and a screenshot of each compared with the last approved one (tests/__screenshots__).
// A screenshot that changes on purpose is re-approved with `npm run test:browser:update` (README).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LETTERS, mockBackend, PICK, scrollsSideways, settled, SPONSOR, stampWords } from "./fixtures";

const DESK = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

async function open(page: Page, path: string, size: { width: number; height: number }, options?: { pick?: boolean }) {
  await page.setViewportSize(size);
  await mockBackend(page, options);
  await page.goto(path);
}

const card = (page: Page, firstName: string) =>
  page.locator(".letter-wall .letter").filter({ has: page.locator(".blank-fill", { hasText: new RegExp(`^${firstName}$`) }) });

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
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
    await expect(page).toHaveScreenshot(`mailbag-${name}.png`, { fullPage: true });
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
    await expect(page).toHaveScreenshot(`strip-${name}.png`);
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
  await expect(page).toHaveScreenshot("write-phone.png");
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
  await expect(page).toHaveScreenshot("reply.png", { fullPage: true });
});
