// The prize drawing: once letters close and every letter is reviewed, one winner per prize and one
// prize per family. Then each winner's family is contacted from here, and an unclaimed prize is
// redrawn. Winners are public from delivery day.
import { useState } from "react";
import { countWaiting, loadDraws, loadPrizes, loadSeason, loadSponsors, loadStaffLetters, redrawPrize, runDrawing } from "../../data";
import { apDate, apLastDay, byline, capitalize, possessive } from "../../format";
import type { Draw, Prize, Sponsor, StaffLetter } from "../../types";
import { useLoad } from "../../useLoad";

// A winner's family has this long to reply before the prize can be redrawn (RULES.md says the same).
// Seven days leaves time for a round of redraws before families' details are cleared, two weeks after
// delivery (migration 0006).
const REPLY_DAYS = 7;

// The season is read fresh with everything else: the staff page may have been open since before
// letters closed, and the drawing depends on the phase now.
async function loadDesk(seasonId: string) {
  const [season, prizes, sponsors, draws, letters, waiting] = await Promise.all([
    loadSeason(),
    loadPrizes(seasonId),
    loadSponsors(seasonId),
    loadDraws(seasonId),
    loadStaffLetters(seasonId),
    countWaiting(seasonId),
  ]);
  return { season, prizes, sponsors, draws, letters, waiting };
}

export function Prizes({ seasonId }: { seasonId: string }) {
  const desk = useLoad(() => loadDesk(seasonId));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (desk.status === "loading") return <p className="status">Loading the drawing…</p>;
  if (desk.status === "failed") return <p className="status">Couldn’t load the drawing: {desk.error.message}</p>;

  const { season, prizes, sponsors, draws, letters, waiting } = desk.data;
  if (prizes.length === 0) {
    return (
      <p className="status">
        No prizes yet. Add them in Supabase’s SQL editor when Chris confirms them (CLAUDE.md, Operations).
      </p>
    );
  }

  const drawn = draws.length > 0;
  // Prizes with no draw yet: all of them at first, or one a sponsor added after the drawing.
  const undrawn = prizes.filter((prize) => !draws.some((d) => d.prize_id === prize.id));
  const draw = async () => {
    setBusy(true);
    setError(null);
    try {
      await runDrawing(season.id);
      desk.reload();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
    setConfirming(false);
  };

  return (
    <div className="prizes-desk">
      {undrawn.length > 0 && (
        <section>
          <p className="hint">
            {drawn
              ? "A prize was added after the drawing. Drawing it gives it to a family that holds no prize yet; the other winners stay as they are."
              : `The drawing gives each prize to a random letter in the mailbag, one prize per family. Letters from staff households and letters with no way to reach the family are left out. It runs after letters close at the end of ${apLastDay(season.entries_close_at)}, when no letter is waiting for review. Letters can't be added once it has run. Winners show in the mailbag on ${apDate(season.delivered_at)}.`}
          </p>
          {season.phase === "upcoming" || season.phase === "open" ? (
            <p>The drawing opens once letters close.</p>
          ) : waiting > 0 ? (
            <p>
              {waiting} {waiting === 1 ? "letter is" : "letters are"} still waiting for review. Post or decline{" "}
              {waiting === 1 ? "it" : "them"} first.
            </p>
          ) : confirming ? (
            <div className="actions">
              <span>
                {drawn
                  ? "The new prize goes to a family that holds no prize yet."
                  : `After this, no more letters can be added. Is all the mail that came by ${apLastDay(season.entries_close_at)} typed in?`}
              </span>
              <button type="button" className="button button-airmail" disabled={busy} onClick={draw}>
                Draw {undrawn.length} {undrawn.length === 1 ? "winner" : "winners"} now
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="button button-airmail" onClick={() => setConfirming(true)}>
                {drawn ? "Draw the new prize…" : "Run the drawing…"}
              </button>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      {drawn && (
        <p className="hint">
          {season.phase === "delivered"
            ? "Winners are in the mailbag."
            : `Winners show in the mailbag on ${apDate(season.delivered_at)}.`}
        </p>
      )}
      <ol className="prize-rows">
        {prizes.map((prize) => (
          <PrizeRow
            key={prize.id}
            prize={prize}
            sponsor={sponsors.find((s) => s.id === prize.sponsor_id)}
            draws={draws.filter((d) => d.prize_id === prize.id)}
            letters={letters}
            onChange={desk.reload}
          />
        ))}
      </ol>
    </div>
  );
}

function PrizeRow({
  prize,
  sponsor,
  draws,
  letters,
  onChange,
}: {
  prize: Prize;
  sponsor: Sponsor | undefined;
  draws: Draw[];
  letters: StaffLetter[];
  onChange: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const letterById = (id: string) => letters.find((l) => l.id === id);
  const current = draws.find((d) => !d.forfeited_at);
  const winner = current && letterById(current.letter_id);
  const forfeits = draws.filter((d) => d.forfeited_at);
  // As it follows "wins": "a family pizza night from Angelo's Pizza".
  const label = `${prize.description}${sponsor ? ` from ${sponsor.name}` : ""}`;

  const redraw = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await redrawPrize(current.id);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="prize-row">
      <h3>{capitalize(label)}</h3>
      {winner ? (
        <>
          <p>
            <strong>{byline(winner)}</strong>, drawn {apDate(current.drawn_at)}.{" "}
            <Contact letter={winner} prize={label} replyBy={replyBy(current.drawn_at)} />
          </p>
          {confirming ? (
            <div className="actions">
              <span>The family gives up the prize for good, and it goes to another family. This can’t be undone.</span>
              <button type="button" className="button" disabled={busy} onClick={redraw}>
                Redraw it
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="link-button" onClick={() => setConfirming(true)}>
              Not claimed? Redraw…
            </button>
          )}
        </>
      ) : (
        <p className="hint">Not drawn yet.</p>
      )}
      {forfeits.map((d) => {
        const letter = letterById(d.letter_id);
        return (
          <p key={d.id} className="hint">
            Given up by {letter ? byline(letter) : "a letter no longer listed"}, on {apDate(d.forfeited_at!)}.
          </p>
        );
      })}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function replyBy(drawnAt: string): string {
  return apDate(new Date(Date.parse(drawnAt) + REPLY_DAYS * 24 * 60 * 60 * 1000).toISOString());
}

// How to reach a winner's family: an email ready to send from the staff member's own mail program,
// or the return address for a mailed letter. Either way the family hears the date to reply by.
function Contact({ letter, prize, replyBy }: { letter: StaffLetter; prize: string; replyBy: string }) {
  const p = letter.letter_private;
  if (p.forgotten_at) return <span>The family’s details were cleared {apDate(p.forgotten_at)}.</span>;
  if (!p.email) {
    return (
      <span>
        Write to the family at the return address, and ask them to reply by {replyBy}:
        <span className="return-address">{p.mail_contact}</span>
      </span>
    );
  }
  const greeting = p.parent_name ? p.parent_name.split(/\s+/)[0] : "there";
  const body = [
    `Hi ${greeting},`,
    `Congratulations! ${possessive(letter.first_name)} letter to Santa was drawn in our Letters to Santa prize drawing, and ${letter.first_name} wins ${prize}.`,
    `What mailing address should we send it to? Just reply to this email by ${replyBy}.`,
    "Merry Christmas,\nWausau Pilot & Review",
  ].join("\n\n");
  const href = `mailto:${p.email}?subject=${encodeURIComponent(`${possessive(letter.first_name)} Letters to Santa prize`)}&body=${encodeURIComponent(body)}`;
  return (
    <a href={href}>
      Email {p.parent_name ?? p.email} for a mailing address
    </a>
  );
}
