// Add a letter's "Read the letter for me": Claude reads the photo of a mailed letter and fills in the boxes
// that are still blank, in the child's own spelling. The staff member is still the reviewer (invariant 5):
// every word is checked against the photo, [?] marks what Claude couldn't read, and what shouldn't be
// published is listed with a button to take it out. Nothing is saved until Add to the mailbag.
import { useState } from "react";
import { transcribeLetter, type Reading, type TypedLetter } from "../data";
import { takeOut } from "../privacy";
import type { ChosenPhoto } from "./PhotoField";

type Fields = Omit<TypedLetter, "source">;

const LEGIBILITY: Record<Reading["legibility"], string> = {
  clear: "Claude read every word with confidence.",
  "some guesses": "Claude marked a few words it wasn’t sure of with [?].",
  "hard to read": "Much of this was hard to read: check it closely against the photo, word by word.",
};

export function ReadLetter({
  photo,
  mailed,
  fields,
  onFill,
  reading,
  onReading,
}: {
  photo: ChosenPhoto | null;
  // A return address belongs only to a mailed letter.
  mailed: boolean;
  fields: Fields;
  onFill: (fields: Partial<Fields>) => void;
  // Kept by Add a letter (useDraft), so the notes survive a look at another tab.
  reading: { result: Reading; filled: string[] } | null;
  onReading: (reading: { result: Reading; filled: string[] } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const result = await transcribeLetter(photo.full);
      // Only the blank boxes: what staff already typed stays as it is.
      const offered: [keyof Fields, string | null, string][] = [
        ["first_name", result.first_name, "first name"],
        ["age", result.age == null ? null : String(result.age), "age"],
        ["town", result.town, "town"],
        ["body", result.letter || null, "the letter"],
        ["mail_contact", mailed ? result.return_address : null, "return address"],
      ];
      const fill: Partial<Fields> = {};
      const filled: string[] = [];
      for (const [field, value, label] of offered) {
        if (value && !fields[field].trim()) {
          fill[field] = value;
          filled.push(label);
        }
      }
      onFill(fill);
      onReading({ result, filled });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const result = reading?.result;
  if (!photo && !result) {
    return <p className="hint">Add a photo of the letter and Claude can read it into the boxes below for you to check.</p>;
  }

  // What's still in the letter box to take out; each goes once it's gone.
  const toTakeOut = result?.privacy.filter((item) => fields.body.includes(item.text)) ?? [];
  const differs = result && result.letter && fields.body.trim() !== result.letter && !reading.filled.includes("the letter");

  return (
    <div className="read-letter" aria-live="polite">
      {photo && (
        <div className="actions">
          <button type="button" className="button" onClick={read} disabled={busy}>
            {busy ? "Reading the letter…" : result ? "Read it again" : "Read the letter for me"}
          </button>
          {busy && <span className="hint">This takes about 15 seconds.</span>}
        </div>
      )}
      {!result && !busy && (
        <p className="hint">
          Claude fills in the boxes that are still blank, keeping the child’s spelling. You check every word against the
          photo before it goes up.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="reading">
          <p>
            {reading.filled.length > 0
              ? `Filled in ${listed(reading.filled)}. ${LEGIBILITY[result.legibility]}`
              : `Every box already had something in it, so nothing was changed. ${LEGIBILITY[result.legibility]}`}
          </p>
          {result.notes && <p>Claude’s note: {result.notes}</p>}
          {differs && (
            <p>
              The letter box already had words in it.{" "}
              <button type="button" className="link-button" onClick={() => onFill({ body: result.letter })}>
                Use Claude’s reading instead
              </button>
            </p>
          )}
          {toTakeOut.length > 0 && (
            <div className="privacy-note">
              <p>Not for the mailbag:</p>
              <ul className="take-out">
                {toTakeOut.map((item) => (
                  <li key={item.text}>
                    <span>
                      “{item.text}” ({item.what})
                    </span>
                    <button type="button" className="link-button" onClick={() => onFill({ body: takeOut(fields.body, item.text) })}>
                      Take it out
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.photo_concerns.length > 0 && (
            <p className="privacy-note">
              Before the photo goes up with the letter: {listed(result.photo_concerns)}. Remove the photo, or take a new
              one that leaves it out.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function listed(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
