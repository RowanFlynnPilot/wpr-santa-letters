// A reply from Santa, to print at home, for one letter in the mailbag. The family's "your letter is
// up" email links here (?letter=<id>&from=email#/reply), on its own page rather than inside WordPress
// so it prints as one sheet. It speaks to the child by first name and town and promises nothing:
// no gifts, no lists. The presenting sponsor's stamp sits in the corner, as on the mailbag's envelope.
import { track } from "../analytics";
import { Postmark } from "../components/Postmark";
import { Stamp } from "../components/Stamp";
import { apDate } from "../format";
import { hashOf } from "../looks";
import { LINKED_FROM, LINKED_LETTER } from "../linked";
import { loadLetter, loadSeason, loadSponsors } from "../reads";
import { presentingSponsor } from "../sales";
import { santaReply } from "../santaReply";
import type { Letter } from "../types";
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
  return <SantasReply letter={letter} sponsor={presentingSponsor(sponsors)} />;
}

function SantasReply({ letter, sponsor }: { letter: Letter; sponsor: ReturnType<typeof presentingSponsor> }) {
  const today = apDate(new Date().toISOString());
  // One of 256 wordings, by the letter: the same each time it's opened, different for a brother or sister.
  const reply = santaReply(letter, hashOf(letter.id));
  const print = () => {
    track("Santa Reply Printed", { from: LINKED_FROM });
    window.print();
  };
  return (
    <main className="reply">
      <div className="reply-tools">
        <button type="button" className="button button-airmail" onClick={print}>
          Print Santa’s reply
        </button>
        <span>It fits on one sheet of letter paper.</span>
      </div>
      <article className="reply-sheet">
        <h1 className="visually-hidden">Santa’s reply to {letter.first_name}</h1>
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
          From Letters to Santa, Wausau Pilot &amp; Review{sponsor ? `, presented by ${sponsor.name}` : ""}
        </footer>
      </article>
    </main>
  );
}
