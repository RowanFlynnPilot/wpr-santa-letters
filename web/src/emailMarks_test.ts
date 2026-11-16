// Run with Deno (CI's database job: `deno test web/src`); the web build leaves *_test.ts out.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { EMAIL_LOGO, fitLogo, type Mark, presentedBy } from "./emailMarks.ts";

const named = (name: string, href: string | null = null): Mark => ({ name, href, logo: null });
const withLogo = (name: string, width: number, height: number): Mark => ({
  name,
  href: `https://example.com/${name.toLowerCase().replaceAll(" ", "-")}`,
  logo: { src: `https://example.com/${name}.png`, ...fitLogo({ width, height }) },
});

Deno.test("sponsors without logos are named in a sentence, each linked if it has a site", () => {
  assertEquals(presentedBy([named("Rib River Pizza")]), 'Presented by <strong style="color:#1a1a1a;">Rib River Pizza</strong>');
  const three = presentedBy([named("A Bank", "https://example.com/a"), named("B Pizza"), named("C Toys")]);
  assertStringIncludes(three, '<a href="https://example.com/a" style="text-decoration:none;"><strong');
  assert(/A Bank<\/strong><\/a>, <strong[^>]*>B Pizza<\/strong> and <strong[^>]*>C Toys<\/strong>$/.test(three), three);
});

Deno.test("a logo is shown in its own shape, in the room every logo gets", () => {
  // A wide wordmark meets the sides, a square or tall one the top and bottom, and a small file is scaled up.
  assertEquals(fitLogo({ width: 800, height: 200 }), { width: 132, height: 33 });
  assertEquals(fitLogo({ width: 480, height: 480 }), { width: 40, height: 40 });
  assertEquals(fitLogo({ width: 420, height: 560 }), { width: 30, height: 40 });
  assertEquals(fitLogo({ width: 16, height: 16 }), { width: 40, height: 40 });
  // A banner far wider than any logo still gets a pixel of height.
  assertEquals(fitLogo({ width: 5000, height: 10 }), { width: 132, height: 1 });
});

Deno.test("once any sponsor has a logo they sit side by side, each with its size written on it", () => {
  const line = presentedBy([withLogo("Rib River Pizza", 800, 200), named("Marathon Toy Chest"), withLogo("NCB", 480, 480)]);
  assert(line.startsWith("Presented by<br>"), line);
  // Outlook shows a picture at its own size unless the size is on the tag itself.
  assertStringIncludes(line, 'alt="Rib River Pizza" width="132" height="33"');
  assertStringIncludes(line, 'alt="NCB" width="40" height="40"');
  // The one still waiting on its logo is there by name, in its place.
  assert(line.indexOf("Rib River Pizza") < line.indexOf("Marathon Toy Chest") && line.indexOf("Marathon Toy Chest") < line.indexOf("NCB"));
  // No commas between pictures.
  assert(!line.includes(","), line);
});

Deno.test("a sponsor's name can't carry markup or a merge tag into the newsletter", () => {
  const line = presentedBy([named('Bob\'s "Best" <b>Pizza</b> [[first_name]] & Subs')]);
  assertStringIncludes(line, "Bob's &quot;Best&quot; &lt;b&gt;Pizza&lt;/b&gt; [&#8288;[&#8288;first_name]] &amp; Subs");
  const logo = presentedBy([{ name: 'A "B"', href: 'https://example.com/?a="b"', logo: { src: "https://example.com/x.png", width: 40, height: 40 } }]);
  assertStringIncludes(logo, 'alt="A &quot;B&quot;"');
  assertStringIncludes(logo, 'href="https://example.com/?a=&quot;b&quot;"');
});

Deno.test("only pictures every mail program shows count as a logo", () => {
  for (const path of ["logo.png", "LOGO.JPG", "a/b.jpeg", "x.gif"]) assert(EMAIL_LOGO.test(path), path);
  for (const path of ["logo.svg", "logo.webp", "logo.png.svg", "logo"]) assert(!EMAIL_LOGO.test(path), path);
});
