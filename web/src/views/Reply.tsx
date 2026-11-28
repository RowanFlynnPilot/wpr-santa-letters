// A reply from Santa, to print at home, for one letter in the mailbag. The family's "your letter is
// up" email links here (?letter=<id>&from=email#/reply), on its own page rather than inside WordPress
// so it prints as one sheet. It speaks to the child by first name and town and promises nothing:
// no gifts, no lists. A presenting sponsor's stamp sits in the corner, as on the mailbag's envelope: with
// several, they take turns by letter, and the foot names them all.
//
// It arrives sealed (Nov. 28): an envelope addressed to the child, closed with a wax seal, which the child
// taps to open; the flap lifts, the envelope falls away and the sheet unfolds. The seal is one button, and
// that is all there is to it: the reply itself, how it prints and what it says are as they were. A reader
// who asks for less motion gets the sheet at the tap, without the unfolding. Staff, who print replies for
// mailed letters (from=staff), get the sheet straight away. And a sheet printed without opening it is
// still the sheet: the envelope is the screen's alone.
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { Horizon, NightSky } from "../components/Night";
import { Postmark } from "../components/Postmark";
import { Stamp } from "../components/Stamp";
import { apDate, series } from "../format";
import { hashOf } from "../looks";
import { LINKED_FROM, LINKED_LETTER } from "../linked";
import { loadLetter, loadSeason, loadSponsors } from "../reads";
import { presentingFor, presentingSponsors, stampedBy } from "../sales";
import { santaReply } from "../santaReply";
import type { Letter, Sponsor } from "../types";
import { useLoad } from "../useLoad";

async function loadReply(letterId: string) {
  const season = await loadSeason();
  const [letter, sponsors] = await Promise.all([loadLetter(letterId), loadSponsors(season.id)]);
  return { letter, sponsors };
}

export function Reply() {
  if (!LINKED_LETTER) {
    return <p className="status">Open Santa’s reply from the link in your email.</p>;
  }
  return <ReplyFor letterId={LINKED_LETTER} />;
}

function ReplyFor({ letterId }: { letterId: string }) {
  const page = useLoad(() => loadReply(letterId));
  if (page.status === "loading") return <p className="status">Opening Santa’s reply…</p>;
  if (page.status === "failed") return <p className="status">Santa’s reply didn’t load: {page.error.message}</p>;
  const { letter, sponsors } = page.data;
  if (!letter) return <p className="status">That letter isn’t in Santa’s mailbag.</p>;
  return <SantasReply letter={letter} sponsors={sponsors} />;
}

function SantasReply({ letter, sponsors }: { letter: Letter; sponsors: Sponsor[] }) {
  const sponsor = presentingFor(sponsors, letter.id);
  const presenters = presentingSponsors(sponsors)
    .filter((s) => !s.open)
    .map((s) => s.name);
  const today = apDate(new Date().toISOString());
  // One of 256 wordings, by the letter: the same each time it's opened, different for a brother or sister.
  const reply = santaReply(letter, hashOf(letter.id));
  const print = () => {
    track("Santa Reply Printed", { from: LINKED_FROM, ...stampedBy(sponsor) });
    window.print();
  };
  // Sealed, then opening (the envelope's flap lifts and it falls away), then open (the sheet unfolds).
  const [seal, setSeal] = useState<"sealed" | "opening" | "open">(LINKED_FROM === "staff" ? "open" : "sealed");
  const heading = useRef<HTMLHeadingElement>(null);
  const unseal = () => setSeal(matchMedia("(prefers-reduced-motion: reduce)").matches ? "open" : "opening");
  useEffect(() => {
    if (seal !== "opening") return;
    const timer = window.setTimeout(() => setSeal("open"), 900);
    return () => window.clearTimeout(timer);
  }, [seal]);
  // Once it's open, a screen reader is told what it's looking at. (Not for staff, who came for the sheet.)
  const wasSealed = useRef(seal === "sealed");
  useEffect(() => {
    if (seal === "open" && wasSealed.current) heading.current?.focus({ preventScroll: true });
  }, [seal]);
  return (
    <main className="reply night">
      <NightSky />
      <div className="reply-inner">
      {/* The page's heading, sealed or open: what a screen reader is told when the seal is broken. */}
      <h1 ref={heading} tabIndex={-1} className="visually-hidden">
        Santa’s reply to {letter.first_name}
      </h1>
      {seal !== "open" && (
        <div className="reply-envelope" data-opening={seal === "opening" || undefined}>
          <svg className="reply-envelope-back" viewBox="0 0 480 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="reply-envelope-folds" d="M0 320 204 124M480 320 276 124" />
            <path className="reply-envelope-flap" d="M0 0 240 150 480 0Z" />
          </svg>
          <p className="reply-envelope-to">
            <span>For {letter.first_name}</span>
            {letter.town && <span>{letter.town}</span>}
          </p>
          <button type="button" className="reply-seal" onClick={unseal} disabled={seal === "opening"} aria-label={`Open Santa’s reply to ${letter.first_name}`}>
            <span aria-hidden="true">S</span>
          </button>
          <p className="reply-envelope-hint" aria-hidden="true">
            From the North Pole. Tap the seal to open it.
          </p>
        </div>
      )}
      {seal === "open" && (
        <div className="reply-tools">
          <button type="button" className="button button-airmail" onClick={print}>
            Print Santa’s reply
          </button>
          <span>It fits on one sheet of letter paper.</span>
        </div>
      )}
      <article className="reply-sheet" data-sealed={seal !== "open" || undefined} data-unfolding={(seal === "open" && wasSealed.current) || undefined}>
        <header className="reply-head">
          <div>
            <p className="reply-from">Santa Claus</p>
            <p className="reply-place">The North Pole</p>
          </div>
          <div className="reply-marks">
            <Postmark place="North Pole" date={today} label={`Postmarked North Pole, ${today}`} cancelled />
            <Stamp sponsor={sponsor} placement="santa-reply" />
          </div>
        </header>
        <p className="reply-dear">Dear {letter.first_name},</p>
        {reply.paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
        <p className="reply-close">Merry Christmas,</p>
        <p className="reply-sign">Santa</p>
        <p className="reply-ps">P.S. {reply.postscript}</p>
        <footer className="reply-foot">
          From Letters to Santa, Wausau Pilot &amp; Review{presenters.length > 0 ? `, presented by ${series(presenters)}` : ""}
        </footer>
      </article>
      </div>
      <Horizon />
    </main>
  );
}
