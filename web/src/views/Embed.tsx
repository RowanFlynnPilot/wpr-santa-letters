// The front-page strip: a band on WPR's front page, in a frame whose height the page sets (README).
// The envelope again, small: the title, a line for the season, the stamp, and the newest letters on
// ruled paper, each linking to itself in the mailbag. The editor's pick, when there is one, leads them. Every link leaves the front page for WPR's
// Letters to Santa page (target _top); the strip never switches views inside itself.
import { Stamp } from "../components/Stamp";
import { letterLink } from "../components/ShareButton";
import { env } from "../env";
import { apDate, apLastDay, byline, capitalize, count } from "../format";
import { paperFor } from "../looks";
import { loadFeaturedId, loadLetter, loadNewest, loadSeason, loadSponsors, loadWinners } from "../reads";
import { DEMO, presentingSponsor } from "../sales";
import { photoUrl } from "../storage";
import type { Season } from "../types";
import { useLoad } from "../useLoad";

const NEWEST = 4;

async function loadStrip() {
  const season = await loadSeason();
  const [sponsors, newest, winners, pickId] = await Promise.all([
    loadSponsors(season.id),
    loadNewest(season.id, NEWEST),
    // Public from delivery day only; before then the answer is always none.
    season.phase === "delivered" ? loadWinners(season.id) : Promise.resolve([]),
    // Null when there's no pick, or it can't be read (reads.ts): the strip is then the newest letters.
    loadFeaturedId(season.id),
  ]);
  // The pick leads, ahead of the newest; it may be older than the newest few, so it's fetched on its own.
  const pick = pickId
    ? (newest.letters.find((l) => l.id === pickId) ?? (await loadLetter(pickId).catch(() => null)))
    : null;
  const letters = pick ? [pick, ...newest.letters.filter((l) => l.id !== pick.id)].slice(0, NEWEST) : newest.letters;
  return { season, sponsors, letters, total: newest.total, winners: winners.length, pickId: pick?.id ?? null };
}

function line(season: Season, total: number, winners: number): string {
  const lastDay = apLastDay(season.entries_close_at);
  switch (DEMO ? "open" : season.phase) {
    case "upcoming":
      return `Santa’s mailbag opens ${apDate(season.entries_open_at)}. Parents and guardians can send their child’s letter through ${lastDay}.`;
    case "open":
      return total > 0
        ? `${capitalize(count(total, "letter", "letters"))} so far from kids across the Wausau area. Parents and guardians, send yours through ${lastDay}.`
        : `Parents and guardians, send your child’s letter through ${lastDay}.`;
    case "closed":
      return `The mailbag is closed. Every letter goes to the North Pole on ${apDate(season.delivered_at)}.`;
    default:
      return winners > 0
        ? "Every letter is on its way to the North Pole. Read them all, and see who won the prizes."
        : "Every letter is on its way to the North Pole. Read them all.";
  }
}

export function Embed() {
  const strip = useLoad(loadStrip);
  if (strip.status === "loading") {
    // The band and its title at once, so the front page doesn't show a blank frame while it loads.
    return (
      <main className="strip" aria-busy="true">
        <div className="strip-head">
          <h1 className="strip-title">Letters to Santa</h1>
          <p className="strip-line" role="status">
            Opening Santa’s mailbag…
          </p>
        </div>
      </main>
    );
  }
  if (strip.status === "failed") return <p className="status">Letters to Santa isn’t loading right now.</p>;

  const { season, sponsors, letters, total, winners, pickId } = strip.data;
  const open = season.phase === "open" || DEMO;
  return (
    <main className="strip">
      <div className="strip-head">
        <Stamp sponsor={presentingSponsor(sponsors)} placement="front-page" />
        <h1 className="strip-title">
          <a href={env.mailbagPageUrl} target="_top">
            Letters to Santa
          </a>
        </h1>
        <p className="strip-line">{line(season, total, winners)}</p>
        <div className="actions">
          {open && (
            <a className="button button-airmail" href={env.writePageUrl} target="_top">
              Write a letter to Santa
            </a>
          )}
          {total > 0 && (
            <a className="button" href={env.mailbagPageUrl} target="_top">
              Read the letters
            </a>
          )}
        </div>
      </div>
      {letters.length > 0 && (
        <ol className="strip-letters" aria-label="Letters from the mailbag">
          {letters.map((letter) => (
            <li key={letter.id}>
              <a
                className="strip-letter"
                data-paper={paperFor(letter.id)}
                href={letterLink(letter.id, "front-page")}
                target="_top"
              >
                {letter.id === pickId && <span className="strip-pick">Editor’s pick</span>}
                <span className="strip-byline">{byline(letter)}</span>
                {/* The child's own hand, when there's a photo: the top of the page, as in the mailbag. The
                    link's words already say whose letter it is, so the picture needs none of its own. */}
                {letter.photo_id && <img className="strip-photo" src={photoUrl(letter.photo_id, "thumb")} alt="" />}
                <span className="strip-text">{letter.body}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
