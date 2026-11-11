import { useEffect } from "react";
import { env } from "./env";
import { DEMO } from "./sales";

// Messages to the WordPress page that embeds us, for the site-wide host script, embed.js (README
// "WordPress embed"). The page itself carries only our iframe, since WPR's firewall refuses a page
// save with script in it, so nothing may depend on anyone listening: without embed.js the frame
// keeps its own height and scrolls inside itself.
const SOURCE = "wpr-santa-letters";

function tellHost(message: { height: number } | { scrollToTop: true } | { scrollTo: number }) {
  window.parent.postMessage({ source: SOURCE, ...message }, "*");
}

// In a frame on WPR's WordPress page, which already carries WPR's header and footer.
export const embedded = window.parent !== window;

// Report our content height so embed.js can size the iframe. The root element's box is its content
// height, so the frame shrinks as well as grows. embed.js asks again once it's listening, in case it
// loaded after our first report.
export function useAutoHeight() {
  useEffect(() => {
    if (!embedded) return;
    const report = () => tellHost({ height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    const asked = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.source === `${SOURCE}-host` && event.data.measure) report();
    };
    window.addEventListener("message", asked);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", asked);
    };
  }, []);
}

// A link between the mailbag and the form. Inside a frame it switches views in place, so it works
// with no script on the WordPress page, and the `?demo` preview stays in the preview; opened on its
// own, it sends readers to WPR's page.
export function viewLink(view: "mailbag" | "write"): { href: string; target?: string; onClick?: () => void } {
  if (embedded || DEMO) return { href: `#/${view}`, onClick: scrollToTop };
  return { href: view === "write" ? env.writePageUrl : env.mailbagPageUrl, target: "_top" };
}

// Bring an element to the top of the reader's screen, on the host page if we're embedded (embed.js
// scrolls the page; without it, the frame scrolls itself). Waits for the web fonts first, since the
// fallback fonts wrap the title differently and would move the element after measuring.
export async function scrollIntoView(element: HTMLElement) {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  const top = Math.round(element.getBoundingClientRect().top + window.scrollY);
  if (embedded) tellHost({ scrollTo: top });
  window.scrollTo(0, top);
}

// After the form gives way to its short confirmation (or a view switch), bring the top back into
// view: the page scrolls if embed.js is there to do it, and a frame at its own height scrolls itself.
export function scrollToTop() {
  if (embedded) tellHost({ scrollToTop: true });
  window.scrollTo(0, 0);
}
