// Two small decisions about how things look, kept apart from the components so Deno can test them as they
// are (looks_test.ts). No imports.

// The paper a letter is set on in the mailbag: the primary-ruled sheet children learn to print on, a
// notebook page or a yellow pad. Chosen from the letter's id, so a letter always looks the same (in the
// mailbag, under a shared link, on the staff page) and a wall of them reads as a pile of different mail.
export const PAPERS = ["primary", "notebook", "pad"] as const;
export type Paper = (typeof PAPERS)[number];

// A whole number from a letter's id, the same every time: what picks its paper here and the wording of
// Santa's reply (santaReply.ts). FNV-1a, which spreads consecutive and similar ids evenly.
export function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function paperFor(letterId: string): Paper {
  return PAPERS[hashOf(letterId) % PAPERS.length];
}

// How wide a sponsor's longest word sets, in units of an average lowercase letter, so the stamp can size
// its type to fit the word whole (styles.css, .stamp-name). Capitals and m/w run wide, i/l/t and
// punctuation narrow: "KWIK" needs more room than "bank".
export function widestWord(name: string): number {
  const width = (word: string) =>
    [...word].reduce((sum, char) => {
      if (/[mwMW@&%]/.test(char)) return sum + 1.5;
      if (/[A-Z0-9]/.test(char)) return sum + 1.25;
      if (/[iljtfr.,'’!:;|\-]/.test(char)) return sum + 0.6;
      return sum + 1;
    }, 0);
  const widest = Math.max(0, ...name.split(/\s+/).filter(Boolean).map(width));
  // Never less than a short word, so a two-letter name isn't set enormous.
  return Math.max(4, Math.round(widest * 10) / 10);
}
