// The presenting sponsors' names from the last time this browser opened the mailbag, so the envelope
// shown while it loads can hold the stamps' place: with several sponsors the stamps sit in a row above
// the title on a phone, and without this the title jumps down when they arrive. Only names already
// printed on the page are kept, on the device (localStorage). Inside WPR's page the mailbag is a frame
// from another site, and some browsers refuse a frame any storage (invariant 12); every call here is
// wrapped, so there the envelope loads as it always did, with one blank stamp.
const KEY = "letters-to-santa:stamps";

export function keptStamps(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(kept) || kept.length > 4) return [];
    return kept.every((name) => typeof name === "string" && name.length > 0 && name.length <= 80) ? kept : [];
  } catch {
    return [];
  }
}

export function keepStamps(names: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // No storage here (a blocked frame, a private window that's full): nothing is kept.
  }
}
