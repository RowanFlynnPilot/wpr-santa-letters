// Cloudflare Turnstile on the letter form. The submit-letter function verifies the token before it
// stores the photo or the letter. Mount once per attempt; remount (change its key) to get a fresh
// token after a failed submission, since tokens are single-use.
//
// A failed check is reported through onError, never silently: the parent has just typed out the
// whole letter. Turnstile retries on its own, and a token that arrives later clears the message.
import { useEffect, useRef } from "react";
import { env } from "../env";

export const CHECK_FAILED =
  "The spam check above the button didn’t finish. Check your connection and try again in a moment, or open this page in another browser.";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "flexible" | "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not start.")));
    tag.onerror = () => reject(new Error("The spam check couldn’t load. Reload the page and try again."));
    document.head.append(tag);
  });
  return script;
}

export function Turnstile({ onToken, onError }: { onToken: (token: string | null) => void; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let mounted = true;
    loadTurnstile().then(
      (turnstile) => {
        if (!mounted || !container.current) return;
        // "flexible" fills the line but won't go under 300px; where the form is narrower than that
        // (a small phone inside WordPress's margins, or large text), the compact widget fits.
        const size = container.current.clientWidth < 300 ? "compact" : "flexible";
        widgetId = turnstile.render(container.current, {
          sitekey: env.turnstileSiteKey,
          action: "submit-letter",
          theme: "light",
          size,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            onError(CHECK_FAILED);
          },
        });
      },
      (error: Error) => onError(error.message),
    );
    return () => {
      mounted = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
    // Setters from the parent are stable; the widget is reset by remounting, not by props.
  }, []);

  return <div ref={container} className="turnstile" />;
}
