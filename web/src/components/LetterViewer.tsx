// One letter, opened: the child's whole page (not the top of it, as the card shows a tall one) and the
// words, set large on the letter's own paper, over the rest of the mailbag. In the mailbag the words are
// written out as a reader watches, the way a letter is written; a click, or a reader who asks for less
// motion, has them all at once, and a screen reader is given the whole letter from the start. There, too,
// a reader goes on to the next letter or back to the one before without closing it (the buttons under
// the letter, or the keyboard's arrows), through every letter in the mailbag, newest first.
//
// It opens where the reader is, not in the middle of the window: inside WordPress the app is a frame as
// tall as the whole mailbag, so the middle of "the window" would be thousands of pixels from the letter
// that was clicked. The sheet is set at the card's own place on the page and brought to the top of the
// screen (host.ts, which asks the WordPress page to scroll when there is one).
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { byline, capitalize, paragraphs, possessive } from "../format";
import { scrollIntoView } from "../host";
import { paperFor } from "../looks";
import { photoUrl } from "../storage";
import type { Letter } from "../types";

// Every letter in the mailbag, newest first: what Next and Previous step through. The mailbag provides
// it; anywhere else (the staff page, the form's confirmation) there is none, and so no stepping.
export const Letters = createContext<Letter[]>([]);

// How long the writing takes: about 28ms a letter, never less than a moment or more than six seconds.
const writingMs = (letters: number) => Math.min(6000, Math.max(1200, letters * 28));
const STEP_MS = 30;

const Glyph = ({ path }: { path: string }) => (
  <svg className="chip-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={path} />
  </svg>
);

export function LetterViewer({
  letter,
  photo,
  written,
  top,
  onClose,
}: {
  letter: Letter;
  // The whole photo's address, when the letter has one.
  photo?: string;
  // Write the words out (the mailbag), or show them at once (the staff page, the form's confirmation).
  written: boolean;
  // Where on the page the card that was opened sits, in pixels from the top.
  top: number;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const all = useContext(Letters);
  // Which letter is on the sheet: the one that was opened, until the reader steps on from it.
  const [at, setAt] = useState(() => all.findIndex((l) => l.id === letter.id));
  const stepping = written && at >= 0 && all.length > 1;
  const current = stepping ? all[at] : letter;
  const whole = current.id === letter.id ? photo : current.photo_id ? photoUrl(current.photo_id, "full") : undefined;
  const step = (by: number) => {
    if (!stepping) return;
    setAt((now) => (now + by + all.length) % all.length);
    // Back to the top of the sheet, where the next letter starts.
    if (mark.current) void scrollIntoView(mark.current);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Opened: the keyboard is on Close, Escape closes, the arrows step, Tab stays on the sheet, and closing
  // hands the keyboard back to what opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        stepRef.current(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "Tab" && sheet.current) {
        const stops = [...sheet.current.querySelectorAll<HTMLElement>("button, a[href]")];
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  // The sheet at the top of the reader's screen; and if it runs past the foot of the page (the last
  // letter, opened), the page is held long enough for it, so a WordPress frame grows to show it all.
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const root = document.documentElement;
    const hold = () => {
      root.style.minHeight = `${Math.ceil(el.getBoundingClientRect().bottom + window.scrollY + 24)}px`;
    };
    hold();
    const watching = new ResizeObserver(hold);
    watching.observe(el);
    // Its resting place, a little above it: the sheet itself is still sliding in.
    if (mark.current) void scrollIntoView(mark.current);
    return () => {
      watching.disconnect();
      root.style.minHeight = "";
    };
  }, []);

  return createPortal(
    <div className="viewer" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={mark} className="viewer-mark" style={{ top: Math.max(0, top - 12) }} />
      <div
        ref={sheet}
        className="viewer-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${possessive(current.first_name)} letter to Santa`}
        style={{ top: Math.max(8, top) }}
      >
        <div className="viewer-head">
          {/* Said aloud when the reader steps to another letter. */}
          <h2 aria-live="polite">{capitalize(byline(current))}</h2>
          <button ref={close} type="button" className="chip" onClick={onClose}>
            <Glyph path="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            Close
          </button>
        </div>
        {whole && <img key={`photo-${current.id}`} className="viewer-photo" src={whole} alt={`${possessive(current.first_name)} letter, as written`} />}
        <Words key={current.id} letter={current} written={written} />
        {stepping && (
          <nav className="viewer-steps" aria-label="More letters">
            <button type="button" className="chip" onClick={() => step(-1)}>
              <Glyph path="M9.5 3.5 5 8l4.5 4.5" />
              Previous letter
            </button>
            <span>
              {at + 1} of {all.length}
            </span>
            <button type="button" className="chip" onClick={() => step(1)}>
              Next letter
              <Glyph path="M6.5 3.5 11 8l-4.5 4.5" />
            </button>
          </nav>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The words on their paper, written out (or all there). Each letter starts its own writing.
function Words({ letter, written }: { letter: Letter; written: boolean }) {
  const parts = useMemo(() => paragraphs(letter.body), [letter.body]);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const still = !written || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(still ? total : 0);
  const writing = shown < total;

  // The pen keeps time by the clock, not by counting ticks: a busy phone that skips a few still finishes
  // the letter when it should.
  useEffect(() => {
    if (!writing) return;
    const began = performance.now() - (shown / total) * writingMs(total);
    const timer = window.setInterval(() => {
      setShown(Math.min(total, Math.ceil(((performance.now() - began) / writingMs(total)) * total)));
    }, STEP_MS);
    return () => window.clearInterval(timer);
    // `shown` is read once, when the writing starts; it isn't what restarts the pen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing, total]);

  // Each paragraph as what's written so far and what's still to come; the rest keeps its room, unseen,
  // so the page is its final size from the first letter and nothing moves as the words arrive.
  let left = shown;
  const lines = parts.map((part) => {
    const here = Math.max(0, Math.min(part.length, left));
    left -= part.length;
    return { done: part.slice(0, here), rest: part.slice(here) };
  });
  const penAt = lines.findIndex((line) => line.rest.length > 0);

  return (
    <>
      <div className="viewer-paper letter" data-paper={paperFor(letter.id)}>
        {/* The whole letter, for a screen reader, from the start. */}
        <div className="visually-hidden">
          {parts.map((part, i) => (
            <p key={i}>{part}</p>
          ))}
        </div>
        <div className="letter-body viewer-words" aria-hidden="true" data-writing={writing || undefined} onClick={() => setShown(total)}>
          {lines.map((line, i) => (
            <p key={i}>
              {line.done}
              {writing && i === penAt && <span className="viewer-pen" />}
              <span className="viewer-rest">{line.rest}</span>
            </p>
          ))}
        </div>
      </div>
      {/* Its line is always there, so the buttons under it don't move when the writing is done. */}
      <p className="viewer-skip">
        {writing && (
          <button type="button" className="link-button" onClick={() => setShown(total)}>
            Show the whole letter
          </button>
        )}
      </p>
    </>
  );
}
