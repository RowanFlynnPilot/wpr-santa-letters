// Everything the page does for selling and reporting the sponsorship.
import { createContext } from "react";
import { turnFor } from "./looks";
import type { Sponsor } from "./types";

export const SALES_EMAIL = "weber.chris@wausaupilotandreview.com";

export function salesMailto(subject: string): string {
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

// Where a sponsor's logo sits; it rides along as utm_content so each placement is reportable.
export type Placement = "mailbag-title" | "write-form" | "sponsor-list" | "front-page" | "newsletter" | "santa-reply";

// Tagged so the visit shows up in the sponsor's own analytics as coming from us.
export function sponsorHref(sponsor: Sponsor, placement: Placement): string | null {
  if (!sponsor.website_url) return null;
  let url: URL;
  try {
    url = new URL(sponsor.website_url);
  } catch {
    // A typo in one sponsor row must not take the mailbag down with it: show the logo unlinked.
    console.warn(`Sponsor ${sponsor.name} has an unusable website_url`, sponsor.website_url);
    return null;
  }
  url.searchParams.set("utm_source", "wausaupilotandreview");
  url.searchParams.set("utm_medium", "widget");
  url.searchParams.set("utm_campaign", "letters-to-santa");
  url.searchParams.set("utm_content", placement);
  return url.toString();
}

// How many presenting sponsors a season has at most: the envelope holds four stamps, the sponsor sheet
// says "limited to four", and the database refuses a fifth (migration 0011).
export const PRESENTING_LIMIT = 4;

// Sales previews: `?demo` on the page's address (before the #) shows all four presenting places, so a
// business sees its stamp at the size it would be: the sponsors already signed on, then "Your business
// here" in the next open place, then a blank stamp for each place still open after that. The form sends
// nothing. Readers never see it.
export const DEMO = /[?&]demo(?:[=&#]|$)/.test(window.location.search + window.location.hash);

export function withDemoSponsor(sponsors: Sponsor[]): Sponsor[] {
  const open = PRESENTING_LIMIT - presentingSponsors(sponsors).length;
  if (!DEMO || open <= 0) return sponsors;
  const place = { tier: "presenting", logo_path: null, website_url: null, demo: true } as const;
  return [
    ...sponsors,
    { ...place, id: "demo-presenting", name: "Your business here" },
    ...Array.from({ length: open - 1 }, (_, i) => ({ ...place, id: `demo-open-${i + 1}`, name: "", open: true })),
  ];
}

// The presenting sponsors, in the order they signed on: their stamps sit side by side on the envelope.
export function presentingSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors.filter((s) => s.tier === "presenting");
}

// The one whose stamp goes on a letter's picture or on Santa's reply to it, where there is room for one:
// the sponsors take turns by letter (looks.ts). A preview shows the business it's being shown to.
export function presentingFor(sponsors: Sponsor[], letterId: string): Sponsor | undefined {
  const presenting = presentingSponsors(sponsors);
  return presenting.find((s) => s.demo && !s.open) ?? presenting[turnFor(letterId, presenting.length)];
}

// The season's sponsors, for whatever sits deep in the page and carries a stamp (a letter's picture).
export const Sponsors = createContext<Sponsor[]>([]);
