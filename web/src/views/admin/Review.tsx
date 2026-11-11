// Form letters wait here for a staff member to post them. Posted letters can be taken down, edited,
// or lose their photo; letters staff typed in are already posted.
import { useEffect, useState, type FormEvent } from "react";
import { LetterCard } from "../../components/LetterCard";
import { LetterFields } from "../../components/LetterFields";
import {
  countByStatus,
  declineLetters,
  deleteQueuedPhotos,
  editLetter,
  featureLetter,
  loadFeaturedId,
  loadReview,
  moderate,
  notifyPosted,
  removePhoto,
  setPrizeEligible,
  unfeatureLetter,
  type LetterWords,
} from "../../data";
import { apDate, byline, count } from "../../format";
import { describeFlags, privacyFlags } from "../../privacy";
import type { LetterStatus, Season, StaffLetter } from "../../types";
import { useLoad } from "../../useLoad";

const TABS: { status: LetterStatus; label: string }[] = [
  { status: "pending", label: "Waiting for review" },
  { status: "approved", label: "In the mailbag" },
  { status: "rejected", label: "Not posted" },
];

export function Review({ season }: { season: Season }) {
  const [tab, setTab] = useState<LetterStatus>("pending");
  const counts = useLoad(() => countByStatus(season.id));
  // Posted letters whose family email didn't send have left the waiting list, so the page names them
  // up here (each is also marked on its letter, under In the mailbag).
  const [unsent, setUnsent] = useState<string[]>([]);
  // Finish deleting any photo whose delete was cut short on an earlier visit.
  const [leftover, setLeftover] = useState<string | null>(null);
  useEffect(() => {
    deleteQueuedPhotos().catch((err) => setLeftover((err as Error).message));
  }, []);
  return (
    <>
      <p className="hint">
        Before posting, check the letter and any photo for a last name, a street address, a school or a child’s face.
        Fix the words with Edit; take a photo off with Remove photo. Keep the child’s spelling. Not posting needs a
        reason; the family doesn’t see it, but the next editor does. A letter that isn’t posted, or comes down, loses
        its photo for good.
      </p>
      <nav className="filters" aria-label="Review status">
        {TABS.map(({ status, label }) => (
          <button key={status} type="button" aria-pressed={tab === status} onClick={() => setTab(status)}>
            {label}
            {counts.status === "ready" && ` (${counts.data[status]})`}
          </button>
        ))}
      </nav>
      {leftover && (
        <p className="error" role="alert">
          {leftover}
        </p>
      )}
      {unsent.length > 0 && (
        <p className="error" role="alert">
          Posted, but the email telling the family didn’t send: {unsent.join(", ")}. Each is marked on its letter under
          In the mailbag, with a button to send it again.
        </p>
      )}
      <ReviewList
        key={tab}
        seasonId={season.id}
        status={tab}
        onChange={counts.reload}
        onUnsent={(name) => setUnsent((names) => [...names, name])}
      />
    </>
  );
}

// Staff search their own lists by what they know: the child's name or town, or the family's name,
// email or return address.
function staffMatch(letter: StaffLetter, words: string[]): boolean {
  const p = letter.letter_private;
  const text = [letter.first_name, letter.town, p.parent_name, p.email, p.mail_contact].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

function ReviewList({
  seasonId,
  status,
  onChange,
  onUnsent,
}: {
  seasonId: string;
  status: LetterStatus;
  onChange: () => void;
  onUnsent: (byline: string) => void;
}) {
  const list = useLoad(() => loadReview(seasonId, status));
  // The editor's pick, to mark it and offer the button on the others (In the mailbag only).
  const featured = useLoad(() => (status === "approved" ? loadFeaturedId(seasonId) : Promise.resolve(null)));
  const [find, setFind] = useState("");
  // Letters picked for declining at once (Waiting for review only).
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (list.status === "loading") return <p className="status">Loading letters…</p>;
  if (list.status === "failed") return <p className="status">Couldn’t load letters: {list.error.message}</p>;
  if (list.data.length === 0) return <p className="empty">Nothing here.</p>;

  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length > 0 ? list.data.filter((letter) => staffMatch(letter, words)) : list.data;
  const done = () => {
    list.reload();
    featured.reload();
    onChange();
  };
  return (
    <>
      <label className="find">
        Find
        <input
          type="search"
          placeholder="Child, town, parent, email or address"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
      </label>
      {shown.length === 0 && <p className="empty">No letters here match.</p>}
      {status === "pending" && shown.length > 1 && (
        <BulkDecline shown={shown} picked={picked} onPick={setPicked} onDone={done} />
      )}
      <div className="review-grid">
        {shown.map((letter) => (
          <ReviewItem
            key={letter.id}
            letter={letter}
            onDone={done}
            onUnsent={onUnsent}
            featured={featured.status === "ready" && featured.data === letter.id}
            picked={status === "pending" ? picked.has(letter.id) : undefined}
            onPick={(on) =>
              setPicked((current) => {
                const next = new Set(current);
                if (on) next.add(letter.id);
                else next.delete(letter.id);
                return next;
              })}
          />
        ))}
      </div>
    </>
  );
}

// Declining many waiting letters at once, for a flood of junk: Find narrows the list (a name, an email
// domain), Select all shown picks them, and one reason declines them all.
function BulkDecline({
  shown,
  picked,
  onPick,
  onDone,
}: {
  shown: StaffLetter[];
  picked: Set<string>;
  onPick: (picked: Set<string>) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = shown.filter((letter) => picked.has(letter.id));

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await declineLetters(chosen.map((letter) => letter.id), reason);
      onPick(new Set());
      setReason("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulk-decline">
      <button type="button" className="link-button" onClick={() => onPick(new Set(shown.map((letter) => letter.id)))}>
        Select all {count(shown.length, "letter", "letters")} shown
      </button>
      {picked.size > 0 && (
        <button type="button" className="link-button" onClick={() => onPick(new Set())}>
          Clear the selection
        </button>
      )}
      {chosen.length > 0 && (
        <>
          <label>
            Reason
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="button" disabled={busy || !reason.trim()} onClick={decline}>
            Don’t post {count(chosen.length, "letter", "letters")}
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Where the letter came from and how to reach the family, in a sentence.
function provenance(letter: StaffLetter): string {
  const p = letter.letter_private;
  const received = apDate(letter.created_at);
  const from = p.forgotten_at
    ? `${p.source === "form" ? "Sent through the form on" : p.source === "email" ? "Emailed; typed in" : "Came in the mail; typed in"} ${received}. The family’s details were cleared ${apDate(p.forgotten_at)}, as the rules promise.`
    : p.source === "form"
    ? `Sent through the form by ${p.parent_name} (${p.email}) on ${received}.`
    : p.source === "email"
      ? `Emailed by ${p.parent_name ? `${p.parent_name}, ` : ""}${p.email}; typed in ${received}.`
      : `Came in the mail; typed in ${received}.${p.parent_name ? ` Parent: ${p.parent_name}.` : ""}${p.email ? ` Email: ${p.email}.` : ""}${p.mail_contact ? ` Return address: ${p.mail_contact}.` : ""}`;
  const notes = [
    !p.forgotten_at && !p.email && !p.mail_contact && "No way to reach the family, so it can’t win a prize.",
    !p.prize_eligible && "Staff household: in the mailbag, but can’t win.",
    p.edited_at && `Edited ${apDate(p.edited_at)}.`,
    letter.status === "approved" && p.email && !p.posted_notice_at && "The family hasn’t been emailed that it’s up.",
    p.rejection_reason && `Not posted: ${p.rejection_reason}`,
  ].filter(Boolean);
  return [from, ...notes].join(" ");
}

type Mode = "idle" | "rejecting" | "editing" | "removing-photo";

function ReviewItem({
  letter,
  onDone,
  onUnsent,
  featured,
  picked,
  onPick,
}: {
  letter: StaffLetter;
  onDone: () => void;
  onUnsent: (byline: string) => void;
  // This letter is the editor's pick, set large at the top of the mailbag.
  featured: boolean;
  // Set on Waiting for review, where letters can be picked for declining at once.
  picked?: boolean;
  onPick: (picked: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = letter.letter_private.prize_eligible;
  const flags = privacyFlags(letter.body, letter.first_name);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode("idle");
      setReason("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const p = letter.letter_private;

  return (
    <div className="review-item">
      {picked !== undefined && (
        <label className="check pick">
          <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} />
          Select<span className="visually-hidden"> {byline(letter)}</span>
        </label>
      )}
      <LetterCard letter={letter} />
      {featured && <p className="done">The editor’s pick: it leads the mailbag, set large, until another letter is picked.</p>}
      {flags.length > 0 && <p className="privacy-note">Check before {letter.status === "approved" ? "leaving it up" : "posting"}: {describeFlags(flags)}. Fix it with Edit.</p>}
      <p className="hint">{provenance(letter)}</p>
      {mode === "editing" ? (
        <EditForm
          letter={letter}
          onSaved={() => {
            setMode("idle");
            onDone();
          }}
          onCancel={() => setMode("idle")}
        />
      ) : mode === "rejecting" ? (
        <div className="actions">
          {letter.status === "approved" && (
            <p>It comes off the mailbag and loses its photo. If it ran in a newsletter or the article, take it out there too.</p>
          )}
          <label>
            Reason
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !reason.trim()}
            onClick={() => act(() => moderate(letter.id, letter.status, "rejected", reason))}
          >
            {letter.status === "approved" ? "Take it down" : "Don’t post it"}
          </button>
          <button type="button" className="link-button" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      ) : mode === "removing-photo" ? (
        <div className="actions">
          <p>The photo is deleted for good; the words stay.</p>
          <button type="button" className="button" disabled={busy} onClick={() => act(() => removePhoto(letter.id))}>
            Remove the photo
          </button>
          <button type="button" className="link-button" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="actions">
          {letter.status !== "approved" && (
            <button
              type="button"
              className="button button-airmail"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await moderate(letter.id, letter.status, "approved", null);
                  // The family's email with a link to the letter; the letter is up either way.
                  if (p.email) {
                    await notifyPosted(letter.id).catch((err) => {
                      console.error("Posted email:", err);
                      onUnsent(byline(letter));
                    });
                  }
                })
              }
            >
              Post it
            </button>
          )}
          {letter.status !== "rejected" && (
            <button type="button" className="button" disabled={busy} onClick={() => setMode("rejecting")}>
              {letter.status === "approved" ? "Take down…" : "Don’t post…"}
            </button>
          )}
          <button type="button" className="link-button" disabled={busy} onClick={() => setMode("editing")}>
            Edit…
          </button>
          {letter.photo_id && (
            <button type="button" className="link-button" disabled={busy} onClick={() => setMode("removing-photo")}>
              Remove photo…
            </button>
          )}
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => act(() => setPrizeEligible(letter.id, !eligible))}
          >
            {eligible ? "Mark this family a staff household" : "This family can win after all"}
          </button>
          {letter.status === "approved" && p.email && !p.posted_notice_at && (
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const { sent, reason } = await notifyPosted(letter.id);
                  if (!sent) throw new Error(`No email went out: ${reason}`);
                })}
            >
              Email the family the link
            </button>
          )}
          {letter.status === "approved" && (
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => act(() => (featured ? unfeatureLetter(letter.id) : featureLetter(letter.id)))}
            >
              {featured ? "Stop featuring it" : "Make it the editor’s pick"}
            </button>
          )}
          {letter.status === "approved" && (
            // The family's email links to the same page. For a mailed letter, print it and mail it back.
            <a
              className="link-button"
              href={`${import.meta.env.BASE_URL}?letter=${letter.id}&from=staff#/reply`}
              target="_blank"
              rel="noopener"
            >
              Santa’s reply to print
            </a>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({ letter, onSaved, onCancel }: { letter: StaffLetter; onSaved: () => void; onCancel: () => void }) {
  const [words, setWords] = useState<LetterWords>({
    first_name: letter.first_name,
    age: String(letter.age),
    town: letter.town ?? "",
    body: letter.body,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await editLetter(letter.id, letter.letter_private.edited_at, words);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="edit-letter" onSubmit={save}>
      {letter.status === "approved" && (
        <p className="hint">
          If it’s in a newsletter section saved for a morning still to come, saving takes that section out; save it
          again under Newsletter.
        </p>
      )}
      <LetterFields words={words} onChange={setWords} />
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          Save
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
