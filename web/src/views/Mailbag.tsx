// Santa's mailbag: the envelope up top (the presenting sponsor's logo is its stamp), the letters as
// they're posted, and the prizes and sponsors at the foot. On delivery day the winners lead. A link
// to one letter (linked.ts) opens it under the envelope, before the rest.
import { useEffect, useRef } from "react";
import { LetterCard } from "../components/LetterCard";
import { LetterWall } from "../components/LetterWall";
import { Stamp } from "../components/Stamp";
import { EDITOR_EMAIL, MAIL_TO } from "../contact";
import { countdown } from "../countdown";
import { apDate, apLastDay, apNumber, byline, capitalize, count, possessive } from "../format";
import { scrollIntoView, viewLink } from "../host";
import { LINKED_LETTER } from "../linked";
import { loadMailbag } from "../reads";
import { DEMO, PresentingSponsor, presentingSponsor, sponsorHref } from "../sales";
import { track } from "../analytics";
import { logoUrl } from "../storage";
import type { Letter, Mailbag as MailbagData, Prize, Season, Sponsor } from "../types";
import { useLoad } from "../useLoad";

export function Mailbag() {
  const mailbag = useLoad(loadMailbag);
  const linkedRef = useRef<HTMLElement>(null);
  const ready = mailbag.status === "ready";

  // A linked letter is what the reader came for: bring it into view once it's on the page.
  useEffect(() => {
    if (ready && linkedRef.current) void scrollIntoView(linkedRef.current);
  }, [ready]);

  if (mailbag.status === "loading") return <p className="status">Opening Santa’s mailbag…</p>;
  if (mailbag.status === "failed") {
    return <p className="status">Santa’s mailbag isn’t loading right now. Try again in a few minutes.</p>;
  }

  const { season, sponsors, prizes, letters, winners } = mailbag.data;
  const open = season.phase === "open" || DEMO;
  const linked = LINKED_LETTER ? letters.find((l) => l.id === LINKED_LETTER) : undefined;
  // How long until the next date on the calendar; a sales preview counts as open, like the rest of the page.
  const daysLeft = countdown(DEMO && season.phase === "upcoming" ? { ...season, phase: "open" } : season);
  return (
    <PresentingSponsor.Provider value={presentingSponsor(sponsors)}>
      <main className="mailbag">
      <header className="envelope">
        {/* First in the page, so on a phone it floats in the corner and the title wraps around it. */}
        <Stamp sponsor={presentingSponsor(sponsors)} placement="mailbag-title" />
        <div className="envelope-address">
          <h1>Letters to Santa</h1>
          <p className="address">
            <span>To Santa Claus, at the North Pole</span>
            <span>From the kids of the Wausau area</span>
          </p>
          <p className="lede">{lede(season)}</p>
          {(open || letters.length > 0) && (
            <div className="envelope-actions">
              {open && (
                <a className="button button-airmail" {...viewLink("write")}>
                  Write a letter to Santa
                </a>
              )}
              {letters.length > 0 && (
                <p className="count">
                  {capitalize(count(letters.length, "letter", "letters"))} in the mailbag
                </p>
              )}
            </div>
          )}
          {daysLeft && <p className="countdown">{daysLeft}</p>}
        </div>
      </header>

      {LINKED_LETTER && (
        <section className="linked-letter" ref={linkedRef} aria-label="The letter you followed a link to">
          {linked ? (
            <>
              <h2>{possessive(linked.first_name)} letter</h2>
              <div className="linked-card">
                <LetterCard letter={linked} share large />
              </div>
            </>
          ) : (
            <p>
              That letter isn’t in the mailbag. An editor reads every letter before it goes up, so a new one can take a
              day or two; a family can also ask us to take one down.
            </p>
          )}
        </section>
      )}

      {season.phase === "delivered" && winners.length > 0 && (
        <Winners data={mailbag.data} />
      )}

      {letters.length > 0 ? (
        <LetterWall letters={linked ? letters.filter((l) => l !== linked) : letters} />
      ) : (
        <p className="empty-mailbag">{emptyLine(season)}</p>
      )}

      <footer className="mailbag-foot">
        {(season.phase === "upcoming" || season.phase === "open") && <OtherWays />}
        {prizes.length > 0 && season.phase !== "delivered" && <PrizeList prizes={prizes} sponsors={sponsors} />}
        {sponsors.some((s) => !s.demo) && (
          // The presenting sponsor first, then the rest in the order they signed on.
          <SponsorList sponsors={sponsors.filter((s) => !s.demo).sort((a, b) => Number(b.tier === "presenting") - Number(a.tier === "presenting"))} />
        )}
      </footer>
      </main>
    </PresentingSponsor.Provider>
  );
}

function lede(season: Season): string {
  const lastDay = apLastDay(season.entries_close_at);
  const delivered = apDate(season.delivered_at);
  switch (DEMO ? "open" : season.phase) {
    case "upcoming":
      return `Santa’s mailbag opens ${apDate(season.entries_open_at)}. From then through ${lastDay}, parents and guardians can send their child’s letter here, and we’ll deliver every one on ${delivered}.`;
    case "open":
      return `Kids across the Wausau area are writing to Santa. Parents and guardians, send your child’s letter here through ${lastDay}. We post letters as they come in and deliver them all to the North Pole on ${delivered}.`;
    case "closed":
      return `The mailbag is closed for ${season.year}. Every letter goes to the North Pole on ${delivered}.`;
    default:
      return "Every letter is on its way to the North Pole. Thank you to all the kids who wrote, and to the grown-ups who helped.";
  }
}

function emptyLine(season: Season): string {
  if (season.phase === "upcoming" && !DEMO) return `The first letters come in ${apDate(season.entries_open_at)}.`;
  if (season.phase === "open" || DEMO) return "No letters yet. Yours could be the first one in the mailbag.";
  return `No letters came in ${season.year}.`;
}

function OtherWays() {
  return (
    <section className="other-ways">
      <h2>Other ways to send a letter</h2>
      <p>
        Email it to <a href={`mailto:${EDITOR_EMAIL}?subject=Letter%20to%20Santa`}>{EDITOR_EMAIL}</a>, or mail it to:
      </p>
      <p className="mailing-address">
        {MAIL_TO.map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </p>
      <p>Include your child’s first name, age and town, and a way to reach you if your child wins a prize.</p>
    </section>
  );
}

// Prizes given more than once are listed once, with how many there are to win.

function PrizeList({ prizes, sponsors }: { prizes: Prize[]; sponsors: Sponsor[] }) {
  const groups = new Map<string, { prize: Prize; count: number }>();
  for (const prize of prizes) {
    const key = `${prize.sponsor_id}\n${prize.description}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { prize, count: 1 });
  }
  return (
    <section className="prize-list">
      <h2>Prizes</h2>
      <p>Letters in the mailbag are entered in a drawing for:</p>
      <ul>
        {[...groups.values()].map(({ prize, count }) => {
          const sponsor = sponsors.find((s) => s.id === prize.sponsor_id);
          return (
            <li key={prize.id}>
              {capitalize(prize.description)}
              {sponsor && ` from ${sponsor.name}`}
              {count > 1 && ` (${apNumber(count)} to win)`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SponsorList({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <section className="sponsor-list">
      <h2>Thanks to our sponsors</h2>
      <ul>
        {sponsors.map((sponsor) => {
          const face = sponsor.logo_path ? (
            <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} loading="lazy" />
          ) : (
            <span>{sponsor.name}</span>
          );
          const href = sponsorHref(sponsor, "sponsor-list");
          return (
            <li key={sponsor.id}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={() => track("Sponsor Click", { sponsor: sponsor.name, placement: "sponsor-list" })}
                >
                  {face}
                </a>
              ) : (
                face
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Winners({ data }: { data: MailbagData }) {
  const { season, sponsors, prizes, letters, winners } = data;
  const letterById = new Map<string, Letter>(letters.map((l) => [l.id, l]));
  return (
    <section className="winners">
      <h2>Our {season.year} prize winners</h2>
      <ul>
        {prizes.map((prize) => {
          const winner = winners.find((w) => w.prize_id === prize.id);
          const letter = winner && letterById.get(winner.letter_id);
          if (!letter) return null;
          const sponsor = sponsors.find((s) => s.id === prize.sponsor_id);
          return (
            <li key={prize.id}>
              {/* AP: the age and town are set off by commas on both sides. */}
              <strong>{byline(letter)}</strong>, wins {prize.description}
              {sponsor && ` from ${sponsor.name}`}.
            </li>
          );
        })}
      </ul>
      <p>We’re reaching out to each winner’s family. Congratulations, and Merry Christmas!</p>
    </section>
  );
}
