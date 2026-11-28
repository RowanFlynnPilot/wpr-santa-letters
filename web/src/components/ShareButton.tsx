import { type ReactNode, useContext, useState } from "react";
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
// The controls are small pills with a glyph each, not a column of underlined links: the letter is the
// card, and these are its buttons. Each is 32px tall to the eye and a thumb (44px) to a tap (styles.css).
const Icon = ({ path }: { path: string }) => (
  <svg className="chip-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={path} />
  </svg>
);
// The share sheet's own glyph (a box with an arrow out of it), Facebook's letter, and a picture frame.
const SHARE = "M8 10V1.75M5 4.5l3-3 3 3M4 7.5H3.25v7h9.5v-7H12";
const FACEBOOK = "M9.25 14.5V8.75h2l.3-2.25h-2.3V5.1c0-.7.3-1.1 1.15-1.1h1.2V2.05a9 9 0 0 0-1.7-.1c-1.75 0-2.9 1.05-2.9 2.95V6.5h-2v2.25h2v5.75";
const PICTURE = "M2.25 3.25h11.5v9.5H2.25zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6.25h.01";

// `lead` is the card's own first control (Open), set in the same row.
export function ShareButton({ letter, lead }: { letter: Letter; lead?: ReactNode }) {
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
      {lead}
      <button type="button" className="chip" onClick={share} aria-label={`Share ${possessive(letter.first_name)} letter`}>
        <Icon path={SHARE} />
        Share
      </button>
      {AT_A_DESK && (
        <a
          className="chip"
          aria-label="Share on Facebook"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener"
          onClick={() => track("Letter Shared", { method: "facebook" })}
        >
          <Icon path={FACEBOOK} />
          Facebook
        </a>
      )}
      <button type="button" className="chip" onClick={picture} disabled={drawing}>
        <Icon path={PICTURE} />
        {drawing ? "Making the picture…" : "Save picture"}
      </button>
      {note && (
        <p className="share-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
