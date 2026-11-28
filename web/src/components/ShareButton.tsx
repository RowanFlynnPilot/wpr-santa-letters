import { useContext, useState } from "react";
import { track } from "../analytics";
import { env } from "../env";
import { possessive } from "../format";
import { presentingFor, Sponsors, stampedBy } from "../sales";
import type { Letter } from "../types";

// A link that opens the mailbag at one letter, on WPR's page (embed.js routes #letter=). The one Share
// hands out is the letter's share page instead (docs/cloudflare/letters-to-santa-host.js, on the same
// address): it sends a person on to #letter=<id>&from=share, and gives Facebook, iMessage and the rest a
// preview of that letter, which they can't take from anything after a #.
export function letterLink(id: string, from: "share" | "front-page"): string {
  return from === "share" ? new URL(`letter/${id}`, env.mailbagPageUrl).href : `${env.mailbagPageUrl}#letter=${id}&from=${from}`;
}

// Where there's a mouse, a phone's share sheet isn't there to offer Facebook, so the card does. Decided
// once: it doesn't change while the page is open.
const AT_A_DESK = typeof matchMedia === "function" && !matchMedia("(pointer: coarse)").matches;

// Share one letter: a phone's own share sheet (the WordPress frame needs allow="web-share"), or the
// link copied (allow="clipboard-write"). Families send it to grandparents; each share brings readers.
// Or as a picture to post (picture.ts): on a phone it goes to the share sheet, elsewhere it's saved.
// At a computer there is also Share on Facebook, which opens Facebook's own box with the letter's link in it.
export function ShareButton({ letter }: { letter: Letter }) {
  const [note, setNote] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const sponsor = presentingFor(useContext(Sponsors), letter.id);
  const url = letterLink(letter.id, "share");
  const title = `${possessive(letter.first_name)} letter to Santa`;

  const share = async () => {
    setNote(null);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
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

  const picture = async () => {
    setNote(null);
    setDrawing(true);
    try {
      // The drawing code loads only when someone asks for a picture.
      const { letterPicture } = await import("../picture");
      const file = new File([await letterPicture(letter, sponsor)], "letter-to-santa.jpg", { type: "image/jpeg" });
      // A phone hands the picture to its apps; a computer saves it, since its share sheet rarely has
      // anywhere useful to send a picture.
      if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        track("Letter Shared", { method: "picture, share sheet", ...stampedBy(sponsor) });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
        setNote("Picture saved. It’s ready to post.");
        track("Letter Shared", { method: "picture, saved", ...stampedBy(sponsor) });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      setNote("The picture couldn’t be made. Share the link instead.");
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="share">
      <button type="button" className="link-button" onClick={share}>
        Share {possessive(letter.first_name)} letter
      </button>
      {AT_A_DESK && (
        <a
          className="link-button"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener"
          onClick={() => track("Letter Shared", { method: "facebook" })}
        >
          Share on Facebook
        </a>
      )}
      <button type="button" className="link-button" onClick={picture} disabled={drawing}>
        {drawing ? "Making the picture…" : "Save it as a picture"}
      </button>
      {note && (
        <p className="share-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
