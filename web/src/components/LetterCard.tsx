import { useState } from "react";
import { ageLabel, apDate, paragraphs, possessive } from "../format";
import { paperFor } from "../looks";
import { photoUrl } from "../storage";
import type { Letter } from "../types";
import { Postmark } from "./Postmark";
import { ShareButton } from "./ShareButton";

// One letter, with its name, age and town filled into the blanks across the top. When there's a photo of
// the handwritten letter it leads, since the child's own hand is the letter; the typed words follow on
// ruled paper (one of three kinds, by the letter: looks.ts), and a small postmark carries the day it
// reached the mailbag. The photo opens to its whole height in place (a pop-over would land off screen
// inside a tall WordPress frame). `preview` is the form's own photo, before anything is uploaded;
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
  return (
    <article className="letter" data-paper={paperFor(letter.id)} data-letter-id={letter.id} tabIndex={-1}>
      <h3 className="letter-head">
        <Blank label="Name" value={letter.first_name} />
        <Blank label="Age" value={ageLabel(letter.age)} />
        {letter.town && <Blank label="Town" value={letter.town} />}
      </h3>
      {(preview || letter.photo_id) && (
        <LetterPhoto
          name={letter.first_name}
          thumb={preview ?? photoUrl(letter.photo_id!, large ? "full" : "thumb")}
          full={preview ?? photoUrl(letter.photo_id!, "full")}
        />
      )}
      <div className="letter-body">
        {paragraphs(letter.body).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <div className="letter-foot">
        {share && <ShareButton letter={letter} />}
        <Postmark place="Santa’s mailbag" date={arrived} label={`Arrived ${arrived}`} />
      </div>
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
// (a drawing) shows whole. Only a cropped photo gets the button, which shows all of it from the full-size
// file; the photo itself can be clicked too.
const TALLEST = 4 / 5;

function LetterPhoto({ name, thumb, full }: { name: string; thumb: string; full: string }) {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(TALLEST);
  const [cropped, setCropped] = useState(false);
  const toggle = () => setOpen((now) => !now);
  return (
    <figure className="letter-photo" data-cropped={cropped || undefined} data-open={open || undefined}>
      <img
        src={open ? full : thumb}
        alt={`${possessive(name)} letter, as written`}
        loading="lazy"
        style={open ? undefined : { aspectRatio: String(ratio) }}
        onClick={cropped ? toggle : undefined}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (open || !naturalWidth || !naturalHeight) return;
          const natural = naturalWidth / naturalHeight;
          // A hair taller than 4:5 shows whole; a button is only worth it when a real part is out of view.
          const tall = natural < TALLEST * 0.95;
          setRatio(tall ? TALLEST : natural);
          setCropped(tall);
        }}
      />
      {cropped && (
        <button type="button" className="link-button" aria-expanded={open} onClick={toggle}>
          {open ? "Show less" : `See all of ${possessive(name)} letter`}
        </button>
      )}
    </figure>
  );
}
