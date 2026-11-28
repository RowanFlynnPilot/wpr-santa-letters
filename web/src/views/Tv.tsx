// The lobby screen (Nov. 27): the mailbag as a slideshow for a TV where people wait, at a sponsor's
// counter or in a bank's lobby, opened full screen in the TV's own browser (or a streaming stick's) and
// left running. One letter at a time on the mailbag's winter night: the child's own page as a taped print
// when the letter has one, its words on ruled paper, and whose letter it is; beside it the feature's name,
// how many letters are in, the countdown, a QR code to the form and the presenting sponsors.
//
//   /wpr-santa-letters/#/tv
//
// It shows only what the mailbag shows (first name, age, town, the letter, its photo), read the same way,
// without the Supabase client (invariant 12). It re-reads the mailbag every five minutes, so a new letter
// joins the loop and one that's taken down leaves it; a failed read keeps what's on screen. It holds the
// screen awake where the browser allows it, reloads itself every six hours for a new build, and a remote's
// arrow keys step through the letters. Nothing on it is a link: there is nothing to press on a lobby wall.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Horizon, NightSky } from "../components/Night";
import { countdown } from "../countdown";
import { apDate, apLastDay, byline, capitalize, paragraphs, series } from "../format";
import { paperFor } from "../looks";
import { loadLetters, loadSeason, loadSponsors } from "../reads";
import { presentingSponsors } from "../sales";
import { logoUrl, photoUrl } from "../storage";
import type { Letter, Season, Sponsor } from "../types";

const BASE = import.meta.env.BASE_URL;
const REFRESH_MS = 5 * 60_000;
const RELOAD_MS = 6 * 60 * 60_000;
// Long enough to read: a short note gets 12 seconds, a long letter up to 28.
const seconds = (letter: Letter) => Math.min(28, 12 + Math.round(letter.body.length / 40));
// The type starts large and steps down until the letter fits its page (TvLetter), so a three-word note is
// as large as the room allows and a long one still shows all of itself. These are the largest and the
// smallest it's set, in the screen's own unit (styles.css: --u); a letter too long even for the smallest
// fades out at the foot of the page.
const LARGEST = 3.4;
const SMALLEST = 1.5;

interface Mail {
  season: Season;
  sponsors: Sponsor[];
  letters: Letter[];
}

async function loadMail(): Promise<Mail> {
  const season = await loadSeason();
  const [sponsors, letters] = await Promise.all([loadSponsors(season.id), loadLetters(season.id)]);
  return { season, sponsors, letters };
}

function invitation(season: Season): { ask: string; scan: string } {
  const lastDay = apLastDay(season.entries_close_at);
  switch (season.phase) {
    case "upcoming":
      return { ask: `Santa’s mailbag opens ${apDate(season.entries_open_at)}.`, scan: "Scan to see Santa’s mailbag" };
    case "open":
      return { ask: `Parents and guardians, send your child’s letter through ${lastDay}.`, scan: "Scan to write to Santa. It’s free." };
    case "closed":
      return { ask: `Every letter goes to the North Pole on ${apDate(season.delivered_at)}.`, scan: "Scan to read the letters" };
    default:
      return { ask: "Every letter is on its way to the North Pole.", scan: "Scan to read the letters" };
  }
}

export function Tv() {
  const [mail, setMail] = useState<Mail | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  // A TV browser shows its own bars; the first press of OK on the remote fills the screen. The button
  // goes once it's used, or after half a minute.
  const fullRef = useRef<HTMLButtonElement>(null);
  const [offerFull, setOfferFull] = useState(() => !!document.fullscreenEnabled && !document.fullscreenElement);
  useEffect(() => {
    if (!offerFull) return;
    fullRef.current?.focus();
    const done = () => document.fullscreenElement && setOfferFull(false);
    const timer = window.setTimeout(() => setOfferFull(false), 30_000);
    document.addEventListener("fullscreenchange", done);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("fullscreenchange", done);
    };
  }, [offerFull, mail]);

  // The mailbag, now and every five minutes; a failed read keeps what's on screen.
  useEffect(() => {
    let live = true;
    const read = () =>
      loadMail().then(
        (next) => live && (setMail(next), setFailed(false)),
        (error: Error) => {
          console.error(error);
          if (live) setFailed(true);
        },
      );
    void read();
    const timer = window.setInterval(() => void read(), REFRESH_MS);
    const reload = window.setTimeout(() => navigator.onLine && window.location.reload(), RELOAD_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.clearTimeout(reload);
    };
  }, []);

  const letters = mail?.letters ?? [];
  const total = letters.length;
  const current = total ? index % total : 0;
  const letter = total ? letters[current] : null;

  // The next letter when this one has had its time; a step by remote starts the time over.
  useEffect(() => {
    if (total < 2 || !letter) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % total), seconds(letter) * 1000);
    return () => window.clearTimeout(timer);
  }, [letter?.id, total, tick]);

  // A remote's arrow keys (most TV browsers send them) step through the letters.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!total || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      e.preventDefault();
      setIndex((i) => (i + (e.key === "ArrowRight" ? 1 : total - 1)) % total);
      setTick((t) => t + 1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [total]);

  // Keep the screen on where the browser allows it (it lets go when the page is hidden).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const hold = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        // Not allowed here; the TV's own settings decide.
      }
    };
    const again = () => document.visibilityState === "visible" && void hold();
    void hold();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, []);

  // The next letter's photo, fetched ahead so it's there when its turn comes.
  const next = total > 1 ? letters[(current + 1) % total] : null;
  useEffect(() => {
    if (next?.photo_id) new Image().src = photoUrl(next.photo_id, "full");
  }, [next?.id]);

  if (!mail) {
    return (
      <main className="tv night tv-waiting">
        <NightSky />
        <p role="status">{failed ? "Santa’s mailbag isn’t loading right now. Trying again soon." : "Opening Santa’s mailbag…"}</p>
        <Horizon />
      </main>
    );
  }

  const { season } = mail;
  const presenting = presentingSponsors(mail.sponsors);
  const { ask, scan } = invitation(season);
  const days = countdown(season);

  return (
    <main className="tv night">
      <NightSky />
      {offerFull && (
        <button
          ref={fullRef}
          type="button"
          className="tv-full"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => setOfferFull(false))}
        >
          Full screen
        </button>
      )}

      <section className="tv-stage" aria-label={letter ? "A letter from Santa’s mailbag" : undefined}>
        {letter ? (
          <TvLetter key={letter.id} letter={letter} />
        ) : (
          <div className="tv-empty">
            <p className="tv-airmail">Par avion · Air mail</p>
            <p className="tv-empty-to">
              To Santa Claus, at the North Pole
              <br />
              From the kids of the Wausau area
            </p>
            <p className="tv-empty-line">{season.phase === "open" ? "Yours could be the first letter in the mailbag." : ask}</p>
          </div>
        )}
      </section>

      <aside className="tv-side">
        <header className="tv-flag">
          <img className="tv-badge" src={`${BASE}wpr-typewriter-badge.png`} alt="" />
          <span>Wausau Pilot &amp; Review</span>
        </header>
        <h1 className="tv-title">Letters to Santa</h1>
        {total > 0 && (
          <p className="tv-count">
            <strong>{total.toLocaleString("en-US")}</strong> <span>{total === 1 ? "letter" : "letters"} in Santa’s mailbag</span>
          </p>
        )}
        {days && <p className="tv-days">{days}</p>}

        <div className="tv-cta">
          <p className="tv-ask">{ask}</p>
          <div className="tv-scan">
            <img className="tv-qr" src={`${BASE}tv-qr.svg`} alt="" />
            <p className="tv-scan-label">{scan}</p>
          </div>
          <p className="tv-address">wausaupilotandreview.com/letters-to-santa</p>
        </div>

        {presenting.length > 0 && (
          <div className="tv-presented">
            <p>Presented by</p>
            <ul aria-label={`Presented by ${series(presenting.map((s) => s.name))}`}>
              {presenting.map((sponsor) => (
                <li key={sponsor.id} className={sponsor.logo_path ? undefined : "tv-named"}>
                  {sponsor.logo_path ? <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} /> : sponsor.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {total > 1 && total <= 40 && (
        <p className="tv-dots" aria-hidden="true">
          {letters.map((l, i) => (
            <span key={l.id} className={i === current ? "on" : undefined} />
          ))}
        </p>
      )}
      <Horizon />
    </main>
  );
}

// One letter: the child's own page as a print taped to the night, when there is one, beside the words on
// the letter's own kind of paper, under whose letter it is.
function TvLetter({ letter }: { letter: Letter }) {
  const paper = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  // Before it's painted: the largest type at which the whole letter is on the page. The page's own height
  // is its limit (styles.css), so "fits" is simply that nothing runs past its foot.
  useLayoutEffect(() => {
    const page = paper.current;
    if (!page) return;
    let fs = LARGEST;
    const set = () => page.style.setProperty("--fs", `calc(var(--u) * ${fs.toFixed(2)})`);
    set();
    while (page.scrollHeight > page.clientHeight + 1 && fs > SMALLEST) {
      fs = Math.max(SMALLEST, fs * 0.94);
      set();
    }
    setClipped(page.scrollHeight > page.clientHeight + 1);
  }, [letter.id]);
  return (
    <article className="tv-letter" data-photo={letter.photo_id ? "" : undefined} data-clipped={clipped ? "" : undefined}>
      {letter.photo_id && (
        <figure className="tv-print">
          <img src={photoUrl(letter.photo_id, "full")} alt="" />
        </figure>
      )}
      <div ref={paper} className="tv-paper letter" data-paper={paperFor(letter.id)}>
        <h2 className="tv-from">{capitalize(byline(letter))}</h2>
        <div className="tv-words letter-body">
          {paragraphs(letter.body).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
