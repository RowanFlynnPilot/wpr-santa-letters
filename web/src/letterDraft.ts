// A letter half written on the form is kept for as long as its tab is open, so a parent who switches apps
// on a phone, or whose browser reloads the page, comes back to what they typed instead of an empty form.
// It lives in the tab's own storage (sessionStorage): it never leaves the device, other tabs can't see it,
// and it's gone when the tab closes or the letter is sent. Inside WPR's page the form is a frame from
// another site, and some browsers refuse a frame any storage (invariant 12); every call here is wrapped,
// so there the form simply works as it did, without the keeping.
const KEY = "letters-to-santa:draft";

export interface KeptLetter {
  // What was typed. The consent box is never kept: saying yes is done fresh, each time.
  words: Record<string, string | boolean>;
  // The letter's key for the server, so a send that got through before a reload isn't sent twice.
  submissionKey: string;
}

export function loadDraft(): KeptLetter | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!kept || typeof kept !== "object" || typeof kept.words !== "object" || !kept.words) return null;
    if (typeof kept.submissionKey !== "string" || !/^[0-9a-f-]{36}$/i.test(kept.submissionKey)) return null;
    return kept as KeptLetter;
  } catch {
    return null;
  }
}

export function saveDraft(draft: KeptLetter): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // No storage here (a blocked frame, a private window that's full): nothing is kept.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
