// Type in a letter that came by email or in the mail. It goes straight into the mailbag: the staff
// member typing it is the reviewer. After each one the form clears for the next, keeping how it came.
import { useState, type FormEvent } from "react";
import { LetterFields } from "../../components/LetterFields";
import { PhotoField, type ChosenPhoto } from "../../components/PhotoField";
import { addLetter, loadDraws, notifyPosted, type TypedLetter } from "../../data";
import { apLastDay, possessive } from "../../format";
import type { Season } from "../../types";
import { useDraft } from "../../useDraft";
import { useLoad } from "../../useLoad";

type Source = TypedLetter["source"];

const BLANK = { first_name: "", age: "", town: "", body: "", parent_name: "", email: "", mail_contact: "" };

export function AddLetter({ season }: { season: Season }) {
  // Kept across tab switches, so looking up a family in Review doesn't lose a half-typed letter.
  const [source, setSource] = useDraft<Source>("add-letter:source", "mail");
  const [fields, setFields] = useDraft("add-letter:fields", BLANK);
  const [photo, setPhoto] = useDraft<ChosenPhoto | null>("add-letter:photo", null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  // add_letter refuses a letter once the drawing has run; say so before anyone types one.
  const draws = useLoad(() => loadDraws(season.id));
  const set = (field: keyof typeof BLANK, value: string) => setFields((current) => ({ ...current, [field]: value }));

  if (season.phase === "delivered") {
    return <p className="status">The {season.year} letters have gone to the North Pole. The mailbag is closed.</p>;
  }
  if (draws.status === "loading") return <p className="status">Loading…</p>;
  if (draws.status === "failed") return <p className="status">Couldn’t check the prize drawing: {draws.error.message}</p>;
  if (draws.data.length > 0) {
    return <p className="status">The prize drawing has run, so no more letters can be added this year.</p>;
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const id = await addLetter({ ...fields, source }, photo);
      // With an email for the family, they get the link to it too; the letter is up either way.
      const told = !fields.email.trim() ||
        (await notifyPosted(id).then(
          () => true,
          (err) => {
            console.error("Posted email:", err);
            return false;
          },
        ));
      const name = possessive(fields.first_name.trim());
      setAdded(
        told
          ? `Added ${name} letter to the mailbag.`
          : `Added ${name} letter to the mailbag, but the email telling the family didn’t send. It’s marked on ` +
            "the letter under Review letters > In the mailbag, with a button to send it again.",
      );
      setFields(BLANK);
      setPhoto(null);
      // Ready for the next one in the stack.
      document.querySelector<HTMLInputElement>(".add-letter input[name=first_name]")?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-letter" onSubmit={save}>
      <p className="hint">
        For letters that came by email or mail by {apLastDay(season.entries_close_at)} (the rules). They go straight
        into the mailbag, so check for last names, addresses and schools as you type. Letters can be added until the
        prize drawing runs.
      </p>
      <fieldset>
        <legend>How it came</legend>
        <div className="choice-group" role="radiogroup" aria-label="How it came">
          {(
            [
              ["mail", "In the mail"],
              ["email", "By email"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="source"
                checked={source === value}
                onChange={() => {
                  setSource(value);
                  // A return address belongs only to a mailed letter.
                  if (value === "email") set("mail_contact", "");
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>The letter</legend>
        <LetterFields
          words={fields}
          onChange={(words) => setFields((current) => ({ ...current, ...words }))}
        />
        <PhotoField
          photo={photo}
          onChange={setPhoto}
          onPreparing={setPreparing}
          label="Add a photo or scan of the letter (optional)"
          hint="It shows with the letter. Leave it out if it shows a last name, an address or a face."
        />
      </fieldset>

      <fieldset>
        <legend>The family</legend>
        <p className="hint">
          Never published. Without an email or a return address, the letter still goes in the mailbag but can’t win a
          prize.
        </p>
        <label>
          <span>
            Parent’s name <span className="optional">(optional)</span>
          </span>
          <input maxLength={100} value={fields.parent_name} onChange={(e) => set("parent_name", e.target.value)} />
        </label>
        <label>
          {source === "email" ? (
            "The email it came from"
          ) : (
            <span>
              Email <span className="optional">(optional)</span>
            </span>
          )}
          <input
            type="email"
            required={source === "email"}
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        {source === "mail" && (
          <label>
            <span>
              Return address <span className="optional">(optional)</span>
            </span>
            <textarea rows={2} maxLength={300} value={fields.mail_contact} onChange={(e) => set("mail_contact", e.target.value)} />
          </label>
        )}
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {added && (
        <p className="done" role="status">
          {added}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button-airmail" disabled={busy || preparing}>
          {busy ? "Adding…" : "Add to the mailbag"}
        </button>
      </div>
    </form>
  );
}
