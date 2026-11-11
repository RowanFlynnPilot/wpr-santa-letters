// Cookieless Plausible, on the same site as WPR's other tools (rowanflynnpilot.github.io). The hash
// script counts #/mailbag and #/write as separate pages.
const ANALYTICS = {
  domain: "rowanflynnpilot.github.io",
  src: "https://plausible.io/js/script.hash.js",
};

type Plausible = ((event: string, options?: { props: Record<string, string> }) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

export function initAnalytics(): void {
  if (window.plausible) return;
  // Queue events fired before the script arrives instead of dropping them.
  window.plausible = ((...args: unknown[]) => {
    (window.plausible!.q ??= []).push(args);
  }) as Plausible;
  const script = document.createElement("script");
  script.defer = true;
  script.src = ANALYTICS.src;
  script.dataset.domain = ANALYTICS.domain;
  document.head.append(script);
}

// Never pass anything about a child or a family; props are for sponsors, placements and pages.
export function track(event: string, props?: Record<string, string>): void {
  window.plausible?.(event, props && { props });
}
