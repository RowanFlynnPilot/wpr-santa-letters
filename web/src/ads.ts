// The presenting sponsors' banner ads, which the sponsor sheet promises on the Letters to Santa page: one
// place in the mailbag, above the letters, showing one sponsor's ad a visit, in turn. The ads are files of
// our own beside the app (web/public/ads: the artwork, and ads.json listing them), not rows in the
// database: a new ad is a picture and a few lines in a pull request, and nothing in production to run.
// This file is the part with no imports, so Deno tests it; reads.ts fetches the list.

export interface Ad {
  // The business, as its sponsor row names it: what a click is counted under.
  sponsor: string;
  // Where the ad links: the address the sponsor asked for.
  href: string;
  // The artwork's file in web/public/ads, 970 pixels wide, and optionally the same at twice the width.
  image: string;
  sharp?: string;
  width: number;
  height: number;
  // What the ad says, for a reader who can't see it.
  alt: string;
  // The last day it shows, a Wausau calendar day ("2027-01-01"); without one it shows until it's removed.
  through?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// A file of ours, by name alone: never a path, never another site's address.
const FILE = /^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp|gif)$/i;

// Today in Wausau, as "2026-12-05".
export function wausauDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function usable(entry: unknown, today: string): entry is Ad {
  if (typeof entry !== "object" || entry === null) return false;
  const ad = entry as Record<string, unknown>;
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const size = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!text(ad.sponsor) || !text(ad.alt) || !size(ad.width) || !size(ad.height)) return false;
  if (typeof ad.image !== "string" || !FILE.test(ad.image)) return false;
  if (ad.sharp !== undefined && (typeof ad.sharp !== "string" || !FILE.test(ad.sharp))) return false;
  try {
    if (typeof ad.href !== "string" || new URL(ad.href).protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (ad.through !== undefined && (typeof ad.through !== "string" || !DAY.test(ad.through) || ad.through < today)) return false;
  return true;
}

// The ads to show today, from whatever ads.json held: a mistyped entry, or one past its last day, is left
// out, and the mailbag is never the worse for it.
export function usableAds(listed: unknown, today: string): Ad[] {
  return Array.isArray(listed) ? listed.filter((entry): entry is Ad => usable(entry, today)) : [];
}

// The one ad a visit shows. `roll` is a number from 0 up to 1, drawn once as the page loads, so every
// sponsor gets an even share of visits and the ad doesn't change under a reader. `?ad=2` on the page's
// address asks for the second in the list: for looking at one sponsor's ad, or showing it to them.
export function pickAd(ads: Ad[], roll: number, wanted?: string | null): Ad | undefined {
  const asked = wanted && /^\d{1,2}$/.test(wanted) ? ads[Number(wanted) - 1] : undefined;
  return asked ?? ads[Math.min(ads.length - 1, Math.floor(roll * ads.length))];
}
