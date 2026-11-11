// The sales pictures in docs/media, for the sponsor sheet (docs/sponsor-sheet): the site in its preview mode
// (?demo, where the open presenting slot reads "Your business here") with the made-up mailbag from the
// browser tests. Taken from the real pages so they can't show a product that doesn't exist; retake them
// after the look changes:
//
//   scripts/browser-tests.sh shots
//
// Skipped everywhere else (CI included): these are pictures to send, not checks.
import { test } from "@playwright/test";
import { LETTERS, mockBackend, PICK, settled } from "./fixtures";

test.skip(!process.env.SPONSOR_SHOTS, "only when retaking the sales pictures");

const OUT = "sponsor-shots";

// No sponsor has signed on: the preview's placeholder takes the presenting slot.
const open = async (page: import("@playwright/test").Page, path: string, size: { width: number; height: number }) => {
  await page.setViewportSize(size);
  await mockBackend(page, { sponsors: [] });
  await page.goto(path);
};

test("the mailbag's envelope and its letters", async ({ page }) => {
  await open(page, "?demo#/mailbag", { width: 1200, height: 900 });
  await page.locator(".featured-letter").waitFor();
  await settled(page);
  await page.locator(".envelope").screenshot({ path: `${OUT}/envelope.png` });
  // The envelope with the first letters under it, the preview's ribbon left out.
  const top = await page.locator(".envelope").boundingBox();
  await page.screenshot({ path: `${OUT}/mailbag.png`, fullPage: true, clip: { x: 0, y: top!.y - 16, width: 1200, height: 1150 } });
});

test("the front-page strip", async ({ page }) => {
  await open(page, "?demo#/embed", { width: 1100, height: 340 });
  await page.locator(".strip-letters").waitFor();
  await settled(page);
  await page.locator(".strip").screenshot({ path: `${OUT}/strip.png` });
});

test("Santa's reply", async ({ page }) => {
  await open(page, `?demo&letter=${LETTERS[0].id}&from=staff#/reply`, { width: 900, height: 1100 });
  await page.getByText("Dear Emma,").waitFor();
  await settled(page);
  await page.locator(".reply-sheet").screenshot({ path: `${OUT}/reply.png` });
});

test("a letter saved as a picture", async ({ page }) => {
  await open(page, "?demo#/mailbag", { width: 1200, height: 900 });
  const download = page.waitForEvent("download");
  await page.locator(".featured-letter").getByRole("button", { name: "Save it as a picture" }).click();
  await (await download).saveAs(`${OUT}/picture-${PICK.first_name.toLowerCase()}.jpg`);
});
