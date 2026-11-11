// The letter form. A parent or guardian fills it in for the child, on a phone most likely: the child,
// the letter (typed onto ruled paper, in the child's words), an optional photo of the handwritten
// letter or a drawing, the parent, then consent. In a `?demo` preview (/wpr-santa-letters/?demo#/write)
// the form is open whatever the date and works as it does for readers, photo included, but sends
// nothing, and ends on the letter as it would look in the mailbag.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { track } from "../analytics";
import { LetterCard } from "../components/LetterCard";
import { PhotoField, type ChosenPhoto } from "../components/PhotoField";
import { Stamp } from "../components/Stamp";
import { Turnstile } from "../components/Turnstile";
import { EDITOR_EMAIL } from "../contact";
import { loadSeason, loadSponsors } from "../reads";
import { submitLetter, type LetterSubmission } from "../send";
import { env } from "../env";
import { AGES, apDate, apLastDay, possessive } from "../format";
import { scrollToTop, viewLink } from "../host";
import { describeFlags, privacyFlags } from "../privacy";
import { DEMO, presentingSponsor } from "../sales";
import type { Letter } from "../types";
import { useLoad } from "../useLoad";

const LETTER_LIMIT = 2000;
// Checked in the browser, so a blank answer is caught before the photo uploads.
const NOT_BLANK = String.raw`.*\S.*`;
const STILL_CHECKING = "The spam check above the button is still running. Give it a few seconds, then try again.";

// Facebook, Instagram and other apps open links in their own browser, where attaching a photo often
// fails. A frame has the same user agent as the page around it, so this works inside WordPress too.
const IN_APP = [
  [/Instagram/, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Orca-Android/, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/, "TikTok"],
  [/Snapchat/, "Snapchat"],
] as const;
const inApp = IN_APP.find(([pattern]) => pattern.test(navigator.userAgent))?.[1];
const realBrowser = /iPhone|iPad|iPod/.test(navigator.userAgent) ? "Safari" : "Chrome";
const IN_APP_TIP = inApp
  ? `You’re in ${inApp}’s built-in browser, which can have trouble attaching photos. If yours won’t attach, tap the ••• menu and open this page in ${realBrowser}.`
  : null;

const BLANK: LetterSubmission = {
  first_name: "",
  age: "",
  town: "",
  body: "",
  parent_name: "",
  email: "",
  consent: false,
  newsletter_opt_in: false,
};

async function loadWritePage() {
  const season = await loadSeason();
  return { season, sponsors: await loadSponsors(season.id) };
}

function charactersLeft(left: number): string {
  if (left > 200) return "";
  if (left === 0) return "No characters left.";
  if (left <= 20) return "Fewer than 20 characters left.";
  return `Fewer than ${Math.ceil(left / 50) * 50} characters left.`;
}

export function Write() {
  const page = useLoad(loadWritePage);
  const [letter, setLetter] = useState<LetterSubmission>(BLANK);
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Letter | null>(null);
  // One key per letter, kept across retries; a new letter gets a new one.
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  // The spam check's own trouble, shown under it and cleared when a token arrives. Kept apart from
  // `error`, so a refused letter's message survives the fresh widget's new token.
  const [checkError, setCheckError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasSent = useRef(sent);

  // Sending, or starting another letter, swaps the whole page: bring its top into view and focus its
  // heading so a screen reader says so.
  useEffect(() => {
    if (wasSent.current !== sent) {
      scrollToTop();
      headingRef.current?.focus({ preventScroll: true });
    }
    wasSent.current = sent;
  }, [sent]);

  if (page.status === "loading") return <p className="status">Loading the letter form…</p>;
  if (page.status === "failed") return <p className="status">The letter form isn’t loading right now. Try again in a few minutes.</p>;

  const { season, sponsors } = page.data;
  const presenting = presentingSponsor(sponsors);
  const flags = privacyFlags(letter.body, letter.first_name);
  const set = <K extends keyof LetterSubmission>(field: K, value: LetterSubmission[K]) =>
    setLetter((current) => ({ ...current, [field]: value }));

  if (season.phase !== "open" && !DEMO) {
    return (
      <main className="write">
        <h1>Write to Santa</h1>
        <p>
          {season.phase === "upcoming"
            ? `Santa’s mailbag opens ${apDate(season.entries_open_at)}. Come back then to send your child’s letter.`
            : season.phase === "closed"
              ? `The mailbag is closed for ${season.year}. Every letter goes to the North Pole on ${apDate(season.delivered_at)}.`
              : `The mailbag is closed for ${season.year}, and every letter is on its way to the North Pole.`}
        </p>
        <div className="actions">
          <a className="button" {...viewLink("mailbag")}>
            See the mailbag
          </a>
        </div>
      </main>
    );
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    // A textarea can't take `pattern`; catch a letter of only spaces here, before the photo uploads.
    if (!letter.body.trim()) {
      setError("The letter is empty.");
      return;
    }
    const preview = asLetter(letter, photo);
    if (DEMO) {
      setSending(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      setSending(false);
      setSent(preview);
      return;
    }
    if (!token) {
      // A failed check already says so just above the button.
      if (!checkError) setError(STILL_CHECKING);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitLetter(letter, photo, token, submissionKey);
      track("Letter Sent", { photo: photo ? "yes" : "no" });
      setSent(preview);
    } catch (err) {
      setError((err as Error).message);
      // The token was spent on that attempt; a fresh widget fetches a new one.
      setToken(null);
      setAttempt((n) => n + 1);
    } finally {
      setSending(false);
    }
  };

  // Another child's letter: the parent's own answers stay.
  const writeAnother = () => {
    setLetter((current) => ({ ...BLANK, parent_name: current.parent_name, email: current.email }));
    setSubmissionKey(crypto.randomUUID());
    setPhoto(null);
    setToken(null);
    setCheckError(null);
    setError(null);
    setSent(null);
  };

  if (sent) {
    return (
      <main className="write">
        <section className="sent">
          <Stamp sponsor={presenting} placement="write-form" />
          <h1 ref={headingRef} tabIndex={-1}>
            {possessive(sent.first_name)} letter is on its way
          </h1>
          <p>
            {!DEMO && "We’re emailing you a confirmation. "}An editor reads every letter before it goes in Santa’s mailbag.
            We’ll deliver them all to the North Pole on {apDate(season.delivered_at)}.
          </p>
        </section>
        {DEMO && (
          <>
            <p className="demo-note">Preview only: nothing was sent. Here’s how this letter would look in the mailbag.</p>
            <div className="letter-preview">
              <LetterCard letter={sent} preview={photo?.preview} />
            </div>
          </>
        )}
        <div className="actions">
          <button type="button" className="button button-airmail" onClick={writeAnother}>
            Write another letter
          </button>
          <a className="button" {...viewLink("mailbag")}>
            See the mailbag
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="write">
      <header className="write-head">
        <h1 ref={headingRef} tabIndex={-1}>
          Write to Santa
        </h1>
        <p>
          Parents and guardians: type your child’s letter here, in their own words, through{" "}
          {apLastDay(season.entries_close_at)}. We’ll put it in Santa’s mailbag on our site with your child’s first name,
          age and town.
        </p>
      </header>

      <form onSubmit={send}>
        <fieldset>
          <legend>Your child</legend>
          <label>
            First name
            <input
              required
              pattern={NOT_BLANK}
              maxLength={30}
              autoComplete="off"
              value={letter.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
            <span className="hint">First name only. We never publish last names.</span>
          </label>
          <div className="field-row">
            <label>
              Age
              <select required value={letter.age} onChange={(e) => set("age", e.target.value)}>
                <option value="">Choose</option>
                {AGES.map((age) => (
                  <option key={age} value={age}>
                    {age === 0 ? "Under 1" : age}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Town <span className="optional">(optional)</span>
              </span>
              <input maxLength={40} autoComplete="address-level2" value={letter.town} onChange={(e) => set("town", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>The letter</legend>
          <textarea
            className="ruled"
            aria-label="The letter"
            required
            rows={10}
            maxLength={LETTER_LIMIT}
            placeholder="Dear Santa,"
            value={letter.body}
            onChange={(e) => set("body", e.target.value)}
          />
          <p className="hint counter">
            Type it in your child’s words, spelling and all, and leave out last names, addresses and school names.{" "}
            <span className={letter.body.length > LETTER_LIMIT - 200 ? "counter-near" : undefined}>
              {letter.body.length.toLocaleString("en-US")} of {LETTER_LIMIT.toLocaleString("en-US")} characters.
            </span>
          </p>
          {/* Screen readers hear the count only near the limit, and only as it crosses a step, not every key. */}
          <p className="visually-hidden" aria-live="polite">
            {charactersLeft(LETTER_LIMIT - letter.body.length)}
          </p>
          {flags.length > 0 && (
            <p className="privacy-note" role="status">
              This letter seems to include {describeFlags(flags)}. Letters are published on our website, so please take{" "}
              {flags.length === 1 ? "it" : "them"} out. An editor checks every letter too.
            </p>
          )}
          <PhotoField
            photo={photo}
            onChange={setPhoto}
            onPreparing={setPreparing}
            label="Add a photo of the handwritten letter or a drawing (optional)"
            hint="We’ll show it with the letter. Make sure it doesn’t show a last name, an address or anyone’s face."
          />
          {IN_APP_TIP && <p className="hint">{IN_APP_TIP}</p>}
        </fieldset>

        <fieldset>
          <legend>About you</legend>
          <label>
            Your name
            <input
              required
              pattern={NOT_BLANK}
              maxLength={100}
              autoComplete="name"
              value={letter.parent_name}
              onChange={(e) => set("parent_name", e.target.value)}
            />
          </label>
          <label>
            Your email
            <input
              type="email"
              required
              autoComplete="email"
              value={letter.email}
              onChange={(e) => set("email", e.target.value)}
            />
            <span className="hint">For a confirmation, and to reach you if your child wins a prize. We never publish it.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={letter.newsletter_opt_in}
              onChange={(e) => set("newsletter_opt_in", e.target.checked)}
            />
            <span>Also send me Wausau Pilot &amp; Review’s free newsletter.</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Permission</legend>
          <label className="check">
            <input type="checkbox" required checked={letter.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>
              I’m this child’s parent or legal guardian, and I agree to the{" "}
              <a href={env.rulesUrl} target="_blank" rel="noreferrer">
                rules
              </a>
              . Wausau Pilot &amp; Review may publish the letter, the photo if I added one, and my child’s first name, age
              and town on its website, in its newsletters and on social media. I can have the letter taken down anytime
              by emailing {EDITOR_EMAIL}.
            </span>
          </label>
        </fieldset>

        {!DEMO && (
          <Turnstile
            key={attempt}
            onToken={(next) => {
              setToken(next);
              if (!next) return;
              setCheckError(null);
              setError((current) => (current === STILL_CHECKING ? null : current));
            }}
            onError={setCheckError}
          />
        )}
        {checkError && (
          <p className="error" role="alert">
            {checkError}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {/* Never disabled for a missing token: the parent would see a dead button and no reason. */}
        <button type="submit" className="button button-airmail" disabled={sending || preparing}>
          {sending ? "Sending…" : "Send to Santa"}
        </button>
      </form>
    </main>
  );
}

// The answers as the mailbag would show them (the database tidies the same way).
function asLetter(letter: LetterSubmission, photo: ChosenPhoto | null): Letter {
  return {
    id: "preview",
    first_name: letter.first_name.trim(),
    age: Number(letter.age),
    town: letter.town.trim() || null,
    body: letter.body.trim(),
    photo_id: photo ? "preview" : null,
    created_at: new Date().toISOString(),
  };
}
