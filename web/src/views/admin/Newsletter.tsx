// The Morning Update's Letters to Santa section. Pick up to three letters that went up since 6 a.m.
// the day before, check the preview, and save it for a morning: the wpr-newsletter build reads the
// saved section that morning (migration 0007) and adds it to the Morning Update, so there's nothing
// to paste. Each edition is built about an hour before it sends, so there's no campaign to paste into
// ahead of time (the Brag Board learned this on Nov. 6).
import { useState } from "react";
import {
  countByStatus,
  loadNewsletterSection,
  loadPostedSince,
  loadSeason,
  loadSponsors,
  saveNewsletterSection,
} from "../../data";
import { env } from "../../env";
import { apDate, byline } from "../../format";
import { MAX_LETTERS, newsletterRows, wrapBlock } from "../../newsletter";
import { describeFlags, privacyFlags } from "../../privacy";
import { presentingSponsor } from "../../sales";
import type { SavedNewsletterSection, Season } from "../../types";
import { useLoad } from "../../useLoad";

// "YYYY-MM-DD" in Wausau, `days` from today.
function wausauDay(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(date);
}

// The day before a "YYYY-MM-DD".
function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

// 6 a.m. Wausau time on a calendar day, as an ISO timestamp (Central time is UTC-6 all season).
function sixAm(day: string): string {
  return new Date(`${day}T06:00:00-06:00`).toISOString();
}

// The morning a save is for: tomorrow's edition (today's is built before 7 a.m. and gone by the time
// anyone's at the staff page).
const NEXT_MORNING = wausauDay(1);

export function Newsletter({ season }: { season: Season }) {
  const [edition, setEdition] = useState(NEXT_MORNING);
  return (
    <div className="newsletter-desk">
      <p className="hint">
        The Letters to Santa section for the Morning Update. Pick up to {MAX_LETTERS} letters and save it for a morning:
        the newsletter takes it on its own, with nothing to paste. Save by the evening before; the edition is built at
        about 7 a.m. and takes the section as it’s saved then. If a letter in it comes down before then, the section is
        left out. Links are tagged for newsletter analytics.
      </p>
      <label className="since">
        For the Morning Update on
        <input type="date" value={edition} min={wausauDay(0)} onChange={(e) => e.target.value && setEdition(e.target.value)} />
      </label>
      <Desk key={edition} season={season} edition={edition} />
    </div>
  );
}

function Desk({ season, edition }: { season: Season; edition: string }) {
  const saved = useLoad(() => loadNewsletterSection(season.id, edition));
  if (saved.status === "loading") return <p className="status">Loading…</p>;
  if (saved.status === "failed") return <p className="status">Couldn’t load the saved section: {saved.error.message}</p>;
  return <Window season={season} edition={edition} saved={saved.data} />;
}

// A saved section reopens on the letters it was saved from.
function Window({ season, edition, saved }: { season: Season; edition: string; saved: SavedNewsletterSection | null }) {
  const [since, setSince] = useState(saved?.posted_since ?? dayBefore(edition));
  return (
    <>
      <label className="since">
        Letters posted since 6 a.m. on
        <input type="date" value={since} max={edition} onChange={(e) => e.target.value && setSince(e.target.value)} />
      </label>
      <Picker key={since} season={season} edition={edition} since={since} saved={saved} />
    </>
  );
}

// The season is read fresh: a staff page left open overnight mustn't build from yesterday's.
async function loadPicker(seasonId: string, since: string) {
  const [season, posted, sponsors, counts] = await Promise.all([
    loadSeason(),
    loadPostedSince(seasonId, sixAm(since)),
    loadSponsors(seasonId),
    countByStatus(seasonId),
  ]);
  return { season, posted, sponsors, total: counts.approved };
}

function Picker({
  season,
  edition,
  since,
  saved,
}: {
  season: Season;
  edition: string;
  since: string;
  saved: SavedNewsletterSection | null;
}) {
  const page = useLoad(() => loadPicker(season.id, since));
  const [picked, setPicked] = useState<string[] | null>(saved && saved.posted_since === since ? saved.letter_ids : null);
  const [current, setCurrent] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (page.status === "loading") return <p className="status">Gathering the letters…</p>;
  if (page.status === "failed") return <p className="status">Couldn’t gather the letters: {page.error.message}</p>;
  const { season: now, posted, sponsors, total } = page.data;
  if (posted.length === 0) return <p className="empty">No letters went up since then.</p>;

  // The newest three the privacy check doesn't flag to start with, or the letters saved from this list.
  // A flagged letter is up in the mailbag because an editor decided so, but it only goes to every
  // newsletter reader if someone ticks it on purpose.
  const flags = new Map(posted.map((l) => [l.id, privacyFlags(l.body, l.first_name)]));
  const listed = new Set(posted.map((l) => l.id));
  const unflagged = posted.filter((l) => flags.get(l.id)!.length === 0);
  const chosen = (picked ?? unflagged.slice(0, MAX_LETTERS).map((l) => l.id)).filter((id) => listed.has(id));
  const toggle = (id: string) =>
    setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-MAX_LETTERS));
  const picks = posted.filter((l) => chosen.includes(l.id));
  const rows = newsletterRows({
    season: now,
    presenting: presentingSponsor(sponsors.filter((s) => !s.demo)),
    picks,
    posted: posted.length,
    total,
    edition,
    mailbagUrl: env.mailbagPageUrl,
    writeUrl: env.writePageUrl,
  });
  const html = wrapBlock(rows);
  const upToDate = current?.rows_html === rows;

  const save = async (rowsHtml: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await saveNewsletterSection(edition, rowsHtml, rowsHtml ? picks.map((l) => l.id) : [], since);
      setCurrent(rowsHtml ? await loadNewsletterSection(season.id, edition) : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    setCopied(null);
    try {
      await navigator.clipboard.writeText(html);
      setCopied("Copied. Paste it into a Custom HTML block.");
    } catch (err) {
      console.error(err);
      setCopied("This browser wouldn’t copy it. Open “HTML” below, select all of it and copy.");
    }
  };

  return (
    <>
      <fieldset>
        <legend>Pick up to {MAX_LETTERS}</legend>
        {posted.map((letter) => (
          <label key={letter.id} className="check">
            <input type="checkbox" checked={chosen.includes(letter.id)} onChange={() => toggle(letter.id)} />
            <span>
              <strong>{byline(letter)}</strong>: {letter.body.slice(0, 90)}
              {letter.body.length > 90 && "…"}
              {flags.get(letter.id)!.length > 0 && (
                <span className="privacy-flag">Check first: {describeFlags(flags.get(letter.id)!)}.</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button
          type="button"
          className="button button-airmail"
          disabled={busy || picks.length === 0 || upToDate}
          onClick={() => save(rows)}
        >
          Save for {apDate(`${edition}T12:00:00Z`)}
        </button>
        {current && (
          <button type="button" className="link-button" disabled={busy} onClick={() => save(null)}>
            Take it out of that morning
          </button>
        )}
        <p role="status">
          {current
            ? upToDate
              ? `Saved. The Morning Update on ${apDate(`${edition}T12:00:00Z`)} carries it.`
              : "What’s on screen isn’t saved yet; the saved section is different."
            : "Nothing saved for that morning yet."}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="newsletter-preview" dangerouslySetInnerHTML={{ __html: html }} />
      <details>
        <summary>Adding it to a campaign by hand instead</summary>
        <p className="hint">One Custom HTML block, for a campaign the build doesn’t make (a special send).</p>
        <div className="actions">
          <button type="button" className="button" onClick={copy}>
            Copy HTML
          </button>
          {copied && <p role="status">{copied}</p>}
        </div>
        <textarea readOnly rows={10} value={html} onFocus={(e) => e.target.select()} />
      </details>
    </>
  );
}
