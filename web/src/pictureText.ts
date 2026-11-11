// Laying a letter's words out in lines for the picture a family can share (picture.ts). The measuring is
// passed in (a canvas measures in the browser; a test counts letters), so there are no imports and Deno can
// test it as it is (pictureText_test.ts).

// Breaks text into lines no wider than `width`. The child's own line breaks are kept, a blank line stays a
// blank row (as on the ruled paper in the mailbag), and a word too long for a line ("Iwantatrainset") is
// broken where it has to be rather than run off the page.
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split("\n");
  let blank = false;
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      // Runs of blank lines count as one.
      if (!blank && lines.length > 0) lines.push("");
      blank = true;
      continue;
    }
    blank = false;
    let line = "";
    for (let word of words) {
      const joined = line ? `${line} ${word}` : word;
      if (measure(joined) <= width) {
        line = joined;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the line: fill lines with as much of it as fits.
      while (measure(word) > width && word.length > 1) {
        let fits = 1;
        while (fits < word.length && measure(word.slice(0, fits + 1)) <= width) fits++;
        lines.push(word.slice(0, fits));
        word = word.slice(fits);
      }
      line = word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// Keeps the first `max` lines. When some are left over, the last one kept ends in an ellipsis (made to
// fit), so the picture says there's more to read rather than stopping mid-thought.
export function firstLines(
  lines: string[],
  max: number,
  width: number,
  measure: (text: string) => number,
): { lines: string[]; cut: boolean } {
  if (lines.length <= max) return { lines, cut: false };
  const kept = lines.slice(0, max);
  // Don't end on a blank row.
  while (kept.length > 1 && kept[kept.length - 1] === "") kept.pop();
  let last = kept[kept.length - 1];
  while (last && measure(`${last}…`) > width) last = last.slice(0, -1).trimEnd();
  kept[kept.length - 1] = `${last.replace(/[\s.,;:!?]+$/, "")}…`;
  return { lines: kept, cut: true };
}
