// Everything the page does for selling and reporting the sponsorship.
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

// Sales previews: `?demo` on the page's address (before the #) puts "Your business here" in the
// presenting sponsor's place while it's unsold, and the form sends nothing. Readers never see it.
export const DEMO = /[?&]demo(?:[=&#]|$)/.test(window.location.search + window.location.hash);

export function withDemoSponsor(sponsors: Sponsor[]): Sponsor[] {
  if (!DEMO || sponsors.some((s) => s.tier === "presenting")) return sponsors;
  return [
    ...sponsors,
    { id: "demo-presenting", name: "Your business here", tier: "presenting", logo_path: null, website_url: null, demo: true },
  ];
}

export function presentingSponsor(sponsors: Sponsor[]): Sponsor | undefined {
  return sponsors.find((s) => s.tier === "presenting");
}
