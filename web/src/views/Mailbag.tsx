// Santa's mailbag: the envelope up top (the presenting sponsors' logos are its stamps), the letters as
// they're posted, and the prizes and sponsors at the foot. On delivery day the winners lead. A link
// to one letter (linked.ts) opens it under the envelope, before the rest.
import { type RefObject, useEffect, useRef } from "react";
import { pickAd } from "../ads";
import { LetterCard } from "../components/LetterCard";
import { LetterWall } from "../components/LetterWall";
import { Horizon, NightSky, Route } from "../components/Night";
import { Postmark } from "../components/Postmark";
import { SponsorAd } from "../components/SponsorAd";
import { Stamps, StampsOpening } from "../components/Stamp";
import { EDITOR_EMAIL, MAIL_TO } from "../contact";
import { apDate, apLastDay, apNumber, byline, capitalize, count, possessive, sentence } from "../format";
import { paperLink, scrollIntoView, viewLink } from "../host";
import { LINKED_LETTER } from "../linked";
import { loadMailbag } from "../reads";
import { DEMO, type Placement, presentingSponsors, sponsorHref, Sponsors, supportingSponsors } from "../sales";
import { track } from "../analytics";
import { keepStamps, keptStamps } from "../stampsKept";
import { logoUrl } from "../storage";
import type { Letter, Mailbag as MailbagData, Prize, Season, Sponsor } from "../types";
import { useLoad } from "../useLoad";

// Which presenting sponsor's banner ad this visit shows (ads.ts): drawn once as the page loads, so the ad
// doesn't change under a reader; `?ad=2` asks for the second in the list.
const AD_ROLL = Math.random();
const AD_WANTED = new URLSearchParams(window.location.search).get("ad");
// "Thanks to our sponsors" names the presenting sponsors first, then the supporting ones, then the prize
// donors, each in the order they signed on.
const TIER_ORDER = { presenting: 0, supporting: 1, donor: 2 } as const;

export function Mailbag() {
  const mailbag = useLoad(loadMailbag);
  const linkedRef = useRef<HTMLElement>(null);
  const prizesRef = useRef<HTMLElement>(null);
  const ready = mailbag.status === "ready";

  // A linked letter is what the reader came for: bring it into view once it's on the page.
  useEffect(() => {
    if (ready && linkedRef.current) void scrollIntoView(linkedRef.current);
  }, [ready]);

  // Whose stamps are on the envelope, for the next time it loads (a preview's placeholders aren't kept).
  const data = ready ? mailbag.data : null;
  useEffect(() => {
    if (data && !DEMO) keepStamps(presentingSponsors(data.sponsors).map((s) => s.name));
  }, [data]);

  if (mailbag.status === "loading") return <MailbagOpening />;
  if (mailbag.status === "failed") {
    return <p className="status">Santa’s mailbag isn’t loading right now. Try again in a few minutes.</p>;
  }

  const { season, sponsors, prizes, letters, winners } = mailbag.data;
  const open = season.phase === "open" || DEMO;
  const linked = LINKED_LETTER ? letters.find((l) => l.id === LINKED_LETTER) : undefined;
  // On delivery day each winning letter is shown with its prize, at the head of the mailbag.
  const won = new Set(season.phase === "delivered" ? winners.map((w) => w.letter_id) : []);
  // A letter is on the page once, in the first place that has it: the link a reader followed, the
  // winners, the editor's pick, then the wall.
  const featured = letters.find((l) => l.id === mailbag.data.featured && l !== linked && !won.has(l.id));
  // The route counts down to the next date on the calendar; a sales preview counts as open, like the rest of the page.
  const calendar = DEMO && season.phase === "upcoming" ? { ...season, phase: "open" as const } : season;
  const presenting = presentingSponsors(sponsors);
  const ad = pickAd(mailbag.data.ads, AD_ROLL, AD_WANTED);
  return (
    <Sponsors.Provider value={sponsors}>
      <main className="mailbag">
      <div className="night">
        <NightSky />
        <div className="night-inner">
          <Route season={calendar} />
      <header className="envelope" data-stamps={presenting.length > 1 ? "several" : "one"}>
        {/* First in the page, so on a phone one stamp floats in the corner and the title wraps around it;
            several sit in a row above the title. */}
        <Stamps sponsors={presenting} placement="mailbag-title" />
        {/* The post office's cancellation, run across the stamps: decoration, on a wide screen only. */}
        <div className="envelope-cancel" aria-hidden="true">
          <Postmark place="Wausau, Wis." date={String(season.year)} label="" cancelled />
        </div>
        <div className="envelope-address">
          <p className="airmail-label" aria-hidden="true">
            Par avion · Air mail
          </p>
          <h1>Letters to Santa</h1>
          <p className="address">
            <span>To Santa Claus, at the North Pole</span>
            <span>From the kids of the Wausau area</span>
          </p>
          <p className="lede">{lede(season)}</p>
          {season.phase === "delivered" && !DEMO && (
            // A rubber stamp across the envelope, saying what the line above it says: decoration.
            <p className="envelope-delivered" aria-hidden="true">
              Delivered · {apDate(season.delivered_at)} · North Pole
            </p>
          )}
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
          {prizes.length > 0 && season.phase !== "delivered" && (
            // The prizes are listed at the foot, a long way down: say so up here, with a way there.
            <p className="envelope-prizes">
              Letters in the mailbag are entered in a drawing for {prizes.length === 1 ? "a prize" : `${apNumber(prizes.length)} prizes`}.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  prizesRef.current?.focus({ preventScroll: true });
                  if (prizesRef.current) void scrollIntoView(prizesRef.current);
                }}
              >
                See the {prizes.length === 1 ? "prize" : "prizes"}
              </button>
            </p>
          )}
        </div>
      </header>
        </div>
        <Horizon />
      </div>

      <div className="mailbag-body">
      <Supporters sponsors={supportingSponsors(sponsors)} />

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

      {season.phase === "delivered" && winners.length > 0 && <Winners data={mailbag.data} linked={linked} />}

      {featured && (
        <section className="featured-letter" aria-labelledby="featured-heading">
          <h2 id="featured-heading">Editor’s pick</h2>
          <p className="hint">Chosen from Santa’s mailbag by our editors.</p>
          <div className="featured-card">
            <LetterCard letter={featured} share large />
          </div>
        </section>
      )}

      {/* A presenting sponsor's banner ad: above the letters, or under the three steps before there are any. */}
      {ad && letters.length > 0 && <SponsorAd ad={ad} />}

      {letters.length > 0 ? (
        <LetterWall letters={letters.filter((l) => l !== linked && l !== featured && !won.has(l.id))} />
      ) : season.phase === "upcoming" || open ? (
        // Nothing to read yet: the letters' place says how the mailbag works.
        <>
          {open && <p className="empty-mailbag">No letters yet. Yours could be the first one in the mailbag.</p>}
          <HowItWorks season={season} prizes={prizes.length} />
        </>
      ) : (
        <p className="empty-mailbag">No letters came in {season.year}.</p>
      )}

      {ad && letters.length === 0 && <SponsorAd ad={ad} />}

      {prizes.length > 0 && season.phase !== "delivered" && <PrizeList prizes={prizes} sponsors={sponsors} sectionRef={prizesRef} />}

      <footer className="mailbag-foot">
        {(season.phase === "upcoming" || season.phase === "open") && <OtherWays />}
        {sponsors.some((s) => !s.demo) && (
          <SponsorList sponsors={sponsors.filter((s) => !s.demo).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])} />
        )}
      </footer>
      </div>
      </main>
    </Sponsors.Provider>
  );
}

// While the mailbag loads: the envelope with its title, already where it will be, and blank sheets where
// the letters will land, so the page keeps its shape (inside WPR's page, a frame that jumps is the worst of it).
function MailbagOpening() {
  return (
    <main className="mailbag" aria-busy="true">
      <div className="night">
        <NightSky />
        <div className="night-inner">
          <Route />
      <header className="envelope">
        {/* One blank stamp, or the place of the several this browser saw here last time. */}
        <StampsOpening names={DEMO ? [] : keptStamps()} />
        <div className="envelope-address">
          <p className="airmail-label" aria-hidden="true">
            Par avion · Air mail
          </p>
          <h1>Letters to Santa</h1>
          <p className="address">
            <span>To Santa Claus, at the North Pole</span>
            <span>From the kids of the Wausau area</span>
          </p>
          <p className="lede" role="status">
            Opening Santa’s mailbag…
          </p>
        </div>
      </header>
        </div>
        <Horizon />
      </div>
      <div className="mailbag-body">
        <div className="letters-opening" aria-hidden="true">
          <div className="letter" />
          <div className="letter" />
          <div className="letter" />
        </div>
      </div>
    </main>
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

// Before the first letter is in, where the letters will be: the mailbag in three steps, along a dashed
// line like the route's that ends in its star. Each step says only what the site does (the reply to print
// goes with the email a family gets when the letter is up; winners are named on delivery day), and the
// drawing is mentioned only once there are prizes to draw, as on the envelope.
function HowItWorks({ season, prizes }: { season: Season; prizes: number }) {
  const lastDay = apLastDay(season.entries_close_at);
  const when = season.phase === "upcoming" && !DEMO ? `From ${apDate(season.entries_open_at)} through ${lastDay}` : `Through ${lastDay}`;
  return (
    <section className="how" aria-labelledby="how-heading">
      <h2 id="how-heading">How Santa’s mailbag works</h2>
      {/* role: Safari drops a list's meaning once its markers are styled away. */}
      <ol role="list">
        <li>
          <h3>A grown-up sends it</h3>
          <p>
            {when}, a parent or guardian sends their child’s letter, in the child’s own words: typed here, emailed or
            mailed. A photo of the handwritten page or a drawing can go with it.
          </p>
        </li>
        <li>
          <h3>An editor reads it</h3>
          <p>
            A Wausau Pilot &amp; Review editor reads every letter before it goes in the mailbag, with the child’s first
            name, age and town only. Families who give an email get a link when it’s up, and a reply from Santa to print.
          </p>
        </li>
        <li>
          <h3>Santa gets it</h3>
          <p>
            On {apDate(season.delivered_at)}, we deliver every letter to the North Pole
            {prizes > 0 && " and name the winners of the prize drawing"}.
          </p>
          <svg className="how-star" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 1.5l3 7.1 7.6.6-5.8 5 1.8 7.4L12 17.7 5.4 21.6l1.8-7.4-5.8-5 7.6-.6z" />
          </svg>
        </li>
      </ol>
    </section>
  );
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
      <p>
        Writing by hand? <a {...paperLink}>Print Santa’s letter paper</a> for your child to write on. It has a place
        for all of that.
      </p>
    </section>
  );
}

// The prizes in the drawing, each on a gift tag: what it is, who gives it (with their logo, when they have
// one: for a prize donor this is the place their name is seen) and, for a prize given more than once, how
// many there are to win. It reads as the plain list it was: "A $25 gift card from Rib River Pizza (three
// to win)"; the parentheses are there for a screen reader and a copied line, and the tag doesn't draw them.

function PrizeList({ prizes, sponsors, sectionRef }: { prizes: Prize[]; sponsors: Sponsor[]; sectionRef: RefObject<HTMLElement | null> }) {
  const groups = new Map<string, { prize: Prize; count: number }>();
  for (const prize of prizes) {
    const key = `${prize.sponsor_id}\n${prize.description}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { prize, count: 1 });
  }
  return (
    // Takes focus when a reader comes down from the envelope's "See the prizes".
    <section className="prize-list" ref={sectionRef} tabIndex={-1} aria-labelledby="prizes-heading">
      <h2 id="prizes-heading">Prizes</h2>
      <p>Letters in the mailbag are entered in a drawing for:</p>
      <ul className="prize-tags">
        {[...groups.values()].map(({ prize, count }) => {
          const sponsor = sponsors.find((s) => s.id === prize.sponsor_id);
          return (
            <li key={prize.id} className="prize-tag">
              <div>
                <span className="prize-what">{capitalize(prize.description)}</span>
                {sponsor && (
                  <span className="prize-from">
                    {" "}
                    from <b>{sponsor.name}</b>
                  </span>
                )}
                {count > 1 && (
                  <span className="prize-count">
                    {" "}
                    <span className="visually-hidden">(</span>
                    {apNumber(count)} to win
                    <span className="visually-hidden">)</span>
                  </span>
                )}
                {/* The giver's logo, at the tag's end; its name is in the line beside it. */}
                {sponsor?.logo_path && <img src={logoUrl(sponsor.logo_path)} alt="" loading="lazy" />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// A sponsor in a list: its logo or its name, linked to its site. Paid links are marked `sponsored` for
// search engines; each click is counted per sponsor and spot.
function SponsorMark({ sponsor, placement, lazy }: { sponsor: Sponsor; placement: Placement; lazy?: boolean }) {
  const face = sponsor.logo_path ? (
    <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} loading={lazy ? "lazy" : undefined} />
  ) : (
    <span>{sponsor.name}</span>
  );
  const href = sponsorHref(sponsor, placement);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer sponsored" onClick={() => track("Sponsor Click", { sponsor: sponsor.name, placement })}>
      {face}
    </a>
  ) : (
    face
  );
}

// The supporting sponsors, named right under the envelope, before the letters: at the foot alone they sat
// below every letter in the mailbag. A sales preview adds the place a business would take.
function Supporters({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <section className="supporters" aria-labelledby="supporters-label">
      <p id="supporters-label" className="supporters-label">
        With support from
      </p>
      <ul>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            {sponsor.demo ? <span className="supporter-open">{sponsor.name}</span> : <SponsorMark sponsor={sponsor} placement="supporters" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SponsorList({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <section className="sponsor-list">
      <h2>Thanks to our sponsors</h2>
      <ul>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            <SponsorMark sponsor={sponsor} placement="sponsor-list" lazy />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Delivery day: the winners lead the mailbag, each with a rosette, the line that names the prize, and the
// winning letter itself (which then isn't repeated on the wall below). The letter a reader followed a link
// to is already at the top of the page, so there the line stands alone.
function Winners({ data, linked }: { data: MailbagData; linked: Letter | undefined }) {
  const { season, sponsors, prizes, letters, winners } = data;
  const letterById = new Map<string, Letter>(letters.map((l) => [l.id, l]));
  return (
    <section className="winners" aria-labelledby="winners-heading">
      <h2 id="winners-heading">Our {season.year} prize winners</h2>
      <ul>
        {prizes.map((prize) => {
          const winner = winners.find((w) => w.prize_id === prize.id);
          const letter = winner && letterById.get(winner.letter_id);
          if (!letter) return null;
          const sponsor = sponsors.find((s) => s.id === prize.sponsor_id);
          return (
            <li key={prize.id} className="winner">
              <p className="winner-line">
                <Rosette />
                {/* AP: the age and town are set off by commas on both sides. */}
                <strong>{byline(letter)}</strong>
                {sentence(`, wins ${prize.description}${sponsor ? ` from ${sponsor.name}` : ""}`)}
              </p>
              {letter !== linked && <LetterCard letter={letter} share />}
            </li>
          );
        })}
      </ul>
      <p className="winners-note">We’re reaching out to each winner’s family. Congratulations, and Merry Christmas!</p>
    </section>
  );
}

// A prize ribbon: a scalloped rosette with a star and two tails, in the envelope's red.
function Rosette() {
  return (
    <svg className="winner-rosette" viewBox="0 0 44 58" aria-hidden="true">
      <path d="M13 30 7 56l8-6 6 8 3-26z" fill="#8f1e18" />
      <path d="M31 30l6 26-8-6-6 8-3-26z" fill="#b3261e" />
      <circle cx="22" cy="20" r="16.5" fill="none" stroke="#b3261e" strokeWidth="6" strokeDasharray="3.4 2.36" />
      <circle cx="22" cy="20" r="15" fill="#b3261e" />
      <circle cx="22" cy="20" r="11.5" fill="#fffdf8" />
      <path transform="translate(13.6 11.4) scale(0.7)" d="M12 1.5l3 7.1 7.6.6-5.8 5 1.8 7.4L12 17.7 5.4 21.6l1.8-7.4-5.8-5 7.6-.6z" fill="#b3261e" />
    </svg>
  );
}
