// The staff page in a real browser. The reader pages' tests (pages.spec.ts) never signed in, so the tools
// the season is run from had no automated check; these give the page a stand-in sign-in and a stand-in
// for the staff side of Supabase (staff.ts), and go through each tool: what's on it, what it sends when a
// button is pressed, what it says when it's refused, that nothing scrolls sideways and that it passes the
// accessibility scan. The rules the functions enforce are the database's own and are tested there
// (supabase/tests); here the stand-in answers like them. No screenshots: the staff page isn't a design to
// hold still. Everything runs in Chrome's engine and in Safari's.
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { LETTERS, PICK, PRIZE, scrollsSideways, SEASON, settled, SIX_PRIZES, SPONSOR, SUPPORTERS } from "./fixtures";
import { type Desk, staffBackend, STAFF_LETTERS, WAITING } from "./staff";

const DESK = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };
const LOGO = fileURLToPath(new URL("./fixtures/logo-square.png", import.meta.url));

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

async function openDesk(page: Page, size: { width: number; height: number }, options?: Parameters<typeof staffBackend>[1]) {
  await page.setViewportSize(size);
  const desk = await staffBackend(page, options);
  await page.goto("#/admin");
  return desk;
}

const tool = (page: Page, name: string) => page.getByRole("navigation", { name: "Staff tools" }).getByRole("button", { name });
const sent = (desk: Desk, fn: string) => desk.calls.filter((call) => call.fn === fn).map((call) => call.args);
const item = (page: Page, firstName: string) => page.locator(".review-item").filter({ has: page.locator(".blank-fill", { hasText: new RegExp(`^${firstName}$`) }) });
const sponsor = (page: Page, name: string) => page.locator(".sponsor-row").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });

test("the staff page asks for a sign-in, and turns away an address that isn’t on the staff list", async ({ page }) => {
  await openDesk(page, PHONE, { signedIn: false });
  await expect(page.getByRole("heading", { level: 1, name: "Letters to Santa staff" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Staff email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send me a code" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Staff tools" })).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  // Signed in, but not staff: the page says so and shows none of the tools.
  await page.unrouteAll({ behavior: "wait" });
  await staffBackend(page, { staff: false });
  await page.goto("about:blank");
  await page.goto("#/admin");
  await expect(page.locator(".status")).toContainText("editor@example.test isn’t on the Letters to Santa staff list.");
  await expect(page.getByRole("navigation", { name: "Staff tools" })).toHaveCount(0);
});

test("Review letters: the waiting list, with what to check, and posting or not posting a letter", async ({ page }) => {
  const desk = await openDesk(page, PHONE);
  const tabs = page.getByRole("navigation", { name: "Review status" });
  await expect(tabs.getByRole("button")).toHaveText(["Waiting for review (2)", "In the mailbag (8)", "Not posted (1)"]);

  // The oldest waiting letter first; the privacy check's note; who sent it and how to reach them.
  await expect(page.locator(".review-item .blank-fill").first()).toHaveText("Nora");
  const nora = item(page, "Nora");
  await expect(nora.locator(".privacy-note")).toContainText("a school");
  await expect(nora.locator(".privacy-note")).toContainText("a phone number");
  await expect(nora.locator(".hint")).toContainText("Sent through the form by Parent 21 (parent21@example.test) on Dec. 5.");
  const eli = item(page, "Eli");
  await expect(eli.locator(".hint")).toContainText("Came in the mail; typed in Dec. 5.");
  await expect(eli.locator(".hint")).toContainText("Return address: 12 Elm St.");
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  // Posting sends the status this page showed, so a stale page can't undo another editor (invariant 5),
  // and then asks for the family's email.
  await nora.getByRole("button", { name: "Post it" }).click();
  await expect(tabs.getByRole("button")).toHaveText(["Waiting for review (1)", "In the mailbag (9)", "Not posted (1)"]);
  expect(sent(desk, "moderate_letter")).toEqual([{ p_letter_id: WAITING.id, p_from: "pending", p_decision: "approved", p_reason: null }]);
  expect(desk.invoked).toEqual([{ name: "letter-posted", body: { letter_id: WAITING.id } }]);

  // Not posting needs a reason; a mailed letter with no email sends no email either way.
  await eli.getByRole("button", { name: "Don’t post…" }).click();
  const decline = eli.getByRole("button", { name: "Don’t post it" });
  await expect(decline).toBeDisabled();
  await eli.getByRole("textbox", { name: "Reason" }).fill("One word, no name we can use.");
  await decline.click();
  await expect(page.locator(".empty")).toHaveText("Nothing here.");
  expect(sent(desk, "moderate_letter")[1]).toEqual({ p_letter_id: "00000000-0000-4000-8000-000000000022", p_from: "pending", p_decision: "rejected", p_reason: "One word, no name we can use." });
  expect(desk.invoked).toHaveLength(1);
});

test("Review letters: what’s in the mailbag, the editor’s pick, and Santa’s reply to print", async ({ page }) => {
  await openDesk(page, DESK);
  await page.getByRole("navigation", { name: "Review status" }).getByRole("button", { name: /^In the mailbag/ }).click();
  await expect(page.locator(".review-item")).toHaveCount(LETTERS.length);
  const pick = item(page, PICK.first_name);
  await expect(pick.locator(".done")).toContainText("The editor’s pick");
  await expect(pick.getByRole("button", { name: "Stop featuring it" })).toBeVisible();
  await expect(item(page, "Emma").getByRole("button", { name: "Make it the editor’s pick" })).toBeVisible();
  await expect(item(page, "Emma").getByRole("link", { name: "Santa’s reply to print" })).toHaveAttribute("href", new RegExp(`\\?letter=${LETTERS[0].id}&from=staff#/reply$`));
  // Taking a letter down says what it costs, and needs a reason.
  await item(page, "Emma").getByRole("button", { name: "Take down…" }).click();
  await expect(item(page, "Emma")).toContainText("It comes off the mailbag and loses its photo.");
  await expect(item(page, "Emma").getByRole("button", { name: "Take it down" })).toBeDisabled();
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
});

test("Sponsors and prizes: adding a sponsor with its logo, its prizes, moving it and taking it off", async ({ page }) => {
  test.setTimeout(90_000);
  const desk = await openDesk(page, DESK, { sponsors: [SPONSOR, ...SUPPORTERS], prizes: SIX_PRIZES });
  await tool(page, "Sponsors and prizes").click();
  await expect(page.locator(".sponsors-desk h2")).toHaveText(["Presenting sponsors (1 of 4)", "Supporting sponsors", "Prize donors", "Add a sponsor"]);
  await expect(sponsor(page, "Rib River Pizza").locator(".sponsor-prizes li")).toHaveText(["A family pizza nightTake it off", "A $25 gift card (three to win)Take one off", "A sledTake it off"]);
  await settled(page);
  await expectAccessible(page);

  // A new prize donor, with a logo: the file goes up under a name of its own, then the row is saved.
  const add = page.locator("section[aria-labelledby=sponsors-add] form");
  await add.getByRole("textbox", { name: /^The business’s name/ }).fill("  Larkspur   Dental ");
  await add.getByRole("combobox", { name: "Level" }).selectOption("donor");
  await add.getByRole("textbox", { name: /^Web address/ }).fill("https://example.com/larkspur");
  await add.locator("input[type=file]").setInputFiles(LOGO);
  await add.getByRole("button", { name: "Add the sponsor" }).click();
  await expect(page.locator(".sponsors-desk > .done")).toHaveText("Larkspur Dental is added, and on the mailbag now.");
  expect(desk.uploads).toHaveLength(1);
  expect(desk.uploads[0]).toMatch(/^larkspur-dental-[0-9a-f]{8}\.png$/);
  expect(sent(desk, "save_sponsor")).toEqual([
    { p_sponsor_id: null, p_name: "  Larkspur   Dental ", p_tier: "donor", p_website_url: "https://example.com/larkspur", p_logo_path: desk.uploads[0] },
  ]);
  const larkspur = sponsor(page, "Larkspur Dental");
  await expect(larkspur.locator(".sponsor-logo img")).toHaveAttribute("alt", "Larkspur Dental’s logo");
  await expect(larkspur.getByRole("link")).toHaveAttribute("href", "https://example.com/larkspur");
  // The form is cleared for the next one, on the level just used.
  await expect(add.getByRole("textbox", { name: /^The business’s name/ })).toHaveValue("");
  await expect(add.getByRole("combobox", { name: "Level" })).toHaveValue("donor");

  // A name already on the list is refused in the database's words, and the logo sent with it comes back down.
  await add.getByRole("textbox", { name: /^The business’s name/ }).fill("northwoods community bank");
  await add.locator("input[type=file]").setInputFiles(LOGO);
  await add.getByRole("button", { name: "Add the sponsor" }).click();
  await expect(add.locator(".error")).toHaveText("northwoods community bank is already on this year's list.");
  expect(desk.uploads).toHaveLength(2);
  expect(desk.removed).toEqual([desk.uploads[1]]);

  // A file that isn't a picture empties the box, and takes the earlier file with it: the next sponsor
  // saved doesn't carry a logo nobody can see chosen.
  await add.locator("input[type=file]").setInputFiles({ name: "logo.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a picture") });
  await expect(add.locator(".error")).toHaveText("A logo has to be a PNG, JPEG, WebP or SVG file.");
  await add.getByRole("textbox", { name: /^The business’s name/ }).fill("Pine Ridge Hardware");
  await add.getByRole("button", { name: "Add the sponsor" }).click();
  await expect(page.locator(".sponsors-desk > .done")).toHaveText("Pine Ridge Hardware is added, and on the mailbag now.");
  expect(desk.uploads).toHaveLength(2);
  expect(sent(desk, "save_sponsor").at(-1)).toMatchObject({ p_name: "Pine Ridge Hardware", p_logo_path: null });

  // Its prize: written to follow "wins", and as many of it as there are to win.
  await larkspur.getByRole("button", { name: "Add a prize" }).click();
  const prize = larkspur.locator("form");
  await prize.getByRole("textbox", { name: /^The prize/ }).fill("A toothbrush kit");
  await expect(larkspur.locator(".sponsor-reads")).toHaveText("As the winners will read: Mia, 6, of Weston, wins A toothbrush kit from Larkspur Dental.");
  await prize.getByRole("button", { name: "Add to the drawing" }).click();
  await expect(larkspur.locator(".error")).toContainText("Start the prize in lowercase");
  await prize.getByRole("textbox", { name: /^The prize/ }).fill("a toothbrush kit");
  await prize.getByRole("spinbutton").fill("2");
  await prize.getByRole("button", { name: "Add to the drawing" }).click();
  await expect(page.locator(".sponsors-desk > .done")).toHaveText("Added two of “a toothbrush kit” from Larkspur Dental to the drawing.");
  await expect(larkspur.locator(".sponsor-prizes li")).toHaveText(["A toothbrush kit (two to win)Take one off"]);
  // A sponsor with prizes can't be removed; its prizes come off one at a time.
  await expect(larkspur).toContainText("To remove it, take its prizes off first.");
  await larkspur.getByRole("button", { name: "Take one off" }).click();
  await expect(larkspur.locator(".sponsor-prizes li")).toHaveText(["A toothbrush kitTake it off"]);
  await larkspur.getByRole("button", { name: "Take it off" }).click();
  await expect(larkspur.locator(".sponsor-prizes")).toHaveCount(0);

  // Its place among the prize donors: the first can't move up, the last can't move down.
  const donors = page.locator("section[aria-labelledby=sponsors-donor] .sponsor-row h3");
  await expect(donors).toHaveText(["Larkspur Dental", "Pine Ridge Hardware"]);
  await expect(larkspur.getByRole("button", { name: "Move up" })).toHaveCount(0);
  await expect(sponsor(page, "Pine Ridge Hardware").getByRole("button", { name: "Move down" })).toHaveCount(0);
  await larkspur.getByRole("button", { name: "Move down" }).click();
  await expect(donors).toHaveText(["Pine Ridge Hardware", "Larkspur Dental"]);
  expect(sent(desk, "move_sponsor")).toHaveLength(1);
  expect(sent(desk, "move_sponsor")[0]).toMatchObject({ p_earlier: false });

  // Taking it off says what goes with it, and its logo's file is deleted.
  await larkspur.getByRole("button", { name: "Remove…" }).click();
  await expect(larkspur).toContainText("Larkspur Dental comes off the mailbag, and its logo is deleted.");
  await larkspur.getByRole("button", { name: "Remove Larkspur Dental" }).click();
  await expect(page.locator(".sponsors-desk > .done")).toHaveText("Larkspur Dental is off the list.");
  await expect(sponsor(page, "Larkspur Dental")).toHaveCount(0);
  expect(desk.removed).toEqual([desk.uploads[1], desk.uploads[0]]);

  // On a phone the cards stack and nothing scrolls sideways.
  await page.setViewportSize(PHONE);
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);
});

test("Sponsors and prizes: when all four presenting places are taken, and once the drawing has run", async ({ page }) => {
  const four = ["Northwoods Community Bank", "Pine Ridge Hardware", "Larkspur Dental", "Granite Peak Auto"].map((name, i) => ({
    ...SPONSOR,
    id: `00000000-0000-4000-8000-0000000000f${i}`,
    name,
  }));
  const prize = { ...PRIZE, sponsor_id: four[0].id };
  await openDesk(page, DESK, {
    sponsors: four,
    prizes: [prize],
    draws: [{ id: "00000000-0000-4000-8000-0000000000dd", prize_id: PRIZE.id, letter_id: LETTERS[0].id, drawn_at: "2026-12-20T18:00:00Z", forfeited_at: null }],
  });
  await tool(page, "Sponsors and prizes").click();
  await expect(page.locator("#sponsors-presenting")).toHaveText("Presenting sponsors (4 of 4)");
  // A new sponsor can't be a fifth presenting sponsor: the level is greyed out and the form sits on the next.
  const add = page.locator("section[aria-labelledby=sponsors-add] form");
  await expect(add.getByRole("combobox", { name: "Level" })).toHaveValue("supporting");
  await expect(add.getByRole("option", { name: /^Presenting sponsor/ })).toBeDisabled();
  await expect(add.getByRole("option", { name: /^Presenting sponsor/ })).toHaveText("Presenting sponsor (all four places are taken)");
  // The drawing has run: the page says what that means, and a drawn prize has no way off the list.
  await expect(page.locator(".sponsors-desk")).toContainText("The prize drawing has run.");
  const first = sponsor(page, "Northwoods Community Bank");
  await expect(first.locator(".sponsor-prizes li")).toHaveText(["A $50 savings starterDrawn"]);
  await expect(first.getByRole("button", { name: /^Take/ })).toHaveCount(0);
  await settled(page);
  await expectAccessible(page);
});

test("Prize drawing: it waits for the review, then draws, and shows how to reach the winner", async ({ page }) => {
  test.setTimeout(90_000);
  // Letters are closed, and two are still waiting for review.
  await openDesk(page, DESK, { phase: "closed" });
  await tool(page, "Prize drawing").click();
  await expect(page.locator(".prizes-desk")).toContainText("2 letters are still waiting for review. Post or decline them first.");
  await expect(page.getByRole("button", { name: "Run the drawing…" })).toHaveCount(0);

  // With every letter reviewed, the drawing can run: it asks first, since no letter can be added after.
  await page.unrouteAll({ behavior: "wait" });
  const desk = await staffBackend(page, { phase: "closed", letters: STAFF_LETTERS.filter((letter) => letter.status !== "pending") });
  await page.goto("about:blank");
  await page.goto("#/admin");
  await tool(page, "Prize drawing").click();
  await expect(page.locator(".prize-row")).toContainText("Not drawn yet.");
  await page.getByRole("button", { name: "Run the drawing…" }).click();
  await expect(page.locator(".prizes-desk")).toContainText("After this, no more letters can be added.");
  await page.getByRole("button", { name: "Draw 1 winner now" }).click();
  expect(sent(desk, "run_prize_drawing")).toEqual([{ p_season_id: SEASON.id }]);
  const row = page.locator(".prize-row");
  await expect(row.getByRole("heading", { level: 3 })).toHaveText("A $50 savings starter from Northwoods Community Bank");
  await expect(row).toContainText("Emma, 7, of Wausau, drawn Dec. 20.");
  // The family's email, ready to send from the staff member's own mail, with the day to reply by.
  const contact = row.getByRole("link", { name: "Email Parent 1 for a mailing address" });
  const href = decodeURIComponent((await contact.getAttribute("href")) ?? "");
  expect(href).toContain("mailto:parent1@example.test?subject=Emma’s Letters to Santa prize");
  expect(href).toContain("Emma wins a $50 savings starter from Northwoods Community Bank.");
  expect(href).toMatch(/Just reply to this email by Dec\.\s27\./);
  await expect(row.getByRole("button", { name: "Not claimed? Redraw…" })).toBeVisible();
  await expect(page.locator(".prizes-desk")).toContainText("Winners show in the mailbag on Dec. 23.");
  await settled(page);
  expect(await scrollsSideways(page)).toBe(false);
  await expectAccessible(page);

  // Once it has run, Add a letter says so in place of a form the database would refuse (invariant 17).
  await tool(page, "Add a letter").click();
  await expect(page.locator(".status")).toHaveText("The prize drawing has run, so no more letters can be added this year.");
});

for (const [name, opens] of [
  ["Add a letter", "form.add-letter"],
  ["Newsletter", ".newsletter-desk"],
  ["Dec. 23 article", ".article-desk"],
] as const) {
  test(`${name}: opens for a signed-in editor, fits a phone and passes the accessibility scan`, async ({ page }) => {
    await openDesk(page, PHONE);
    await tool(page, name).click();
    await expect(page.locator(opens)).toBeVisible();
    await expect(page.locator(".status")).toHaveCount(0);
    if (name === "Dec. 23 article") {
      // Every posted letter is in it, and the sponsor is named.
      await expect(page.locator(".article-preview")).toContainText("Letters to Santa is presented by Northwoods Community Bank.");
      await expect(page.getByRole("button", { name: "Copy the article" })).toBeVisible();
    }
    await settled(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expectAccessible(page);
  });
}
