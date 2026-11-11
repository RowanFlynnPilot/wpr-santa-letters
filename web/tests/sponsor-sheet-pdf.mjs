// Prints the sponsor sheet (docs/sponsor-sheet, made by its build.py) to a letter-size PDF, and says how
// many pages it came to: it is meant to be one. Run with `scripts/browser-tests.sh sheet`.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const dir = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
await page.setContent(readFileSync(`${dir}/letters-to-santa-sponsor-sheet.html`, "utf8"));
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
});
// Letter size, shrunk a step at a time until the sheet fits one page: the layout widens as it shrinks,
// so the type stays as large as one page allows.
let pdf, pages, scale;
for (scale of [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72]) {
  pdf = await page.pdf({ format: "Letter", printBackground: true, scale, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages === 1) break;
}
writeFileSync(`${dir}/letters-to-santa-sponsor-sheet.pdf`, pdf);
// What the printed page looks like, to check by eye: the same width the PDF was laid out at.
await page.setViewportSize({ width: Math.round(816 / scale), height: Math.round(1056 / scale) });
await page.emulateMedia({ media: "print" });
await page.screenshot({ path: `${dir}/preview.png`, fullPage: true });
console.log(`PDF: ${pages} page(s) at ${Math.round(scale * 100)}% (body text ${(14.5 * scale * 0.75).toFixed(1)}pt)`);
await browser.close();
