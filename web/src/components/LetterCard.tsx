import { useCallback, useRef, useState } from "react";
import { ageLabel, apDate, paragraphs, possessive } from "../format";
import { paperFor } from "../looks";
import { photoUrl } from "../storage";
import type { Letter } from "../types";
import { LetterViewer } from "./LetterViewer";
import { Postmark } from "./Postmark";
import { ShareButton } from "./ShareButton";

// One letter, with its name, age and town filled into the blanks across the top. When there's a photo of
// the handwritten letter it leads, since the child's own hand is the letter; the typed words follow on
// ruled paper (one of three kinds, by the letter: looks.ts), and a small postmark carries the day it
// reached the mailbag. The photo, and in the mailbag an Open button, open the letter over the page
// (LetterViewer): the whole photo and the words set large, written out as a reader watches. `preview` is
// the form's own photo, before anything is uploaded;
// `share` adds the Share link (the mailbag only); `large` is the one letter a reader followed a link to,
// set wide, so its photo comes from the full-size file.
export function LetterCard({
  letter,
  preview,
  share = false,
  large = false,
}: {
  letter: Letter;
  preview?: string;
  share?: boolean;
  large?: boolean;
}) {
  const arrived = apDate(letter.created_at);
  const card = useRef<HTMLElement>(null);
  // Where the card sits on the page when it's opened: the letter opens there (LetterViewer).
  const [openAt, setOpenAt] = useState<number | null>(null);
  const open = () => setOpenAt(Math.round((card.current?.getBoundingClientRect().top ?? 0) + window.scrollY));
  const close = useCallback(() => setOpenAt(null), []);
  const whole = preview ?? (letter.photo_id ? photoUrl(letter.photo_id, "full") : undefined);
  return (
    <article
      ref={card}
      className="letter"
      data-paper={paperFor(letter.id)}
      data-letter-id={letter.id}
      // The editor's pick lays a letter with a photo out as a spread (styles.css).
      data-photo={preview || letter.photo_id ? "" : undefined}
      tabIndex={-1}
    >
      <h3 className="letter-head">
        <Blank label="Name" value={letter.first_name} />
        <Blank label="Age" value={ageLabel(letter.age)} />
        {letter.town && <Blank label="Town" value={letter.town} />}
      </h3>
      {(preview || letter.photo_id) && (
        <LetterPhoto
          name={letter.first_name}
          thumb={preview ?? photoUrl(letter.photo_id!, large ? "full" : "thumb")}
          onOpen={open}
        />
      )}
      <div className="letter-body">
        {paragraphs(letter.body).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <div className="letter-foot">
        {share && (
          <ShareButton
            letter={letter}
            lead={
              <button type="button" className="chip" onClick={open} aria-label={`Open ${possessive(letter.first_name)} letter`}>
                <svg className="chip-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
                </svg>
                Open
              </button>
            }
          />
        )}
        <Postmark place="Santa’s mailbag" date={arrived} label={`Arrived ${arrived}`} />
      </div>
      {openAt !== null && <LetterViewer letter={letter} photo={whole} written={share} top={openAt} onClose={close} />}
    </article>
  );
}

function Blank({ label, value }: { label: string; value: string }) {
  return (
    <span className="blank">
      <span className="blank-label">{label} </span>
      <span className="blank-fill">{value}</span>{" "}
    </span>
  );
}

// The photo fills the card's width. A tall page shows its top (the greeting and the first lines) in a
// frame no taller than 4:5, held open before the photo loads so the letters below don't jump; a wide one
// (a drawing) shows whole. The photo is a button: it opens the letter (LetterViewer), where the whole page
// is shown. Until Nov. 28 a cropped photo had a "See all of …'s letter" link under it that lengthened the
// photo in place, which showed more of the page at the same small size and helped nobody read it.
const TALLEST = 4 / 5;

function LetterPhoto({ name, thumb, onOpen }: { name: string; thumb: string; onOpen: () => void }) {
  const [ratio, setRatio] = useState(TALLEST);
  return (
    <figure className="letter-photo">
      <button type="button" className="letter-photo-open" onClick={onOpen} aria-label={`Open ${possessive(name)} letter, as written`}>
        <img
          src={thumb}
          alt=""
          loading="lazy"
          style={{ aspectRatio: String(ratio) }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!naturalWidth || !naturalHeight) return;
            const natural = naturalWidth / naturalHeight;
            // A hair taller than 4:5 shows whole.
            setRatio(natural < TALLEST * 0.95 ? TALLEST : natural);
          }}
        />
        <span className="letter-photo-hint" aria-hidden="true">
          <svg className="chip-icon" viewBox="0 0 16 16" focusable="false">
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </svg>
        </span>
      </button>
    </figure>
  );
}
