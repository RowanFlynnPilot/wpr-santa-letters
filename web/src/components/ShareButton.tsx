import { useState } from "react";
import { track } from "../analytics";
import { env } from "../env";
import { possessive } from "../format";
import type { Letter } from "../types";

// A link that opens the mailbag at one letter, on WPR's page (embed.js routes #letter=).
export function letterLink(id: string, from: "share" | "front-page"): string {
  return `${env.mailbagPageUrl}#letter=${id}&from=${from}`;
}

// Share one letter: a phone's own share sheet (the WordPress frame needs allow="web-share"), or the
// link copied (allow="clipboard-write"). Families send it to grandparents; each share brings readers.
export function ShareButton({ letter }: { letter: Letter }) {
  const [note, setNote] = useState<string | null>(null);
  const url = letterLink(letter.id, "share");

  const share = async () => {
    setNote(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${possessive(letter.first_name)} letter to Santa`, url });
        track("Letter Shared", { method: "share sheet" });
      } else {
        await navigator.clipboard.writeText(url);
        setNote("Link copied.");
        track("Letter Shared", { method: "copy link" });
      }
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      setNote(`Copy this link: ${url}`);
    }
  };

  return (
    <div className="share">
      <button type="button" className="link-button" onClick={share}>
        Share {possessive(letter.first_name)} letter
      </button>
      {note && (
        <p className="share-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
