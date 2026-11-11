import { useState } from "react";
import { ageLabel, paragraphs, possessive } from "../format";
import { photoUrl } from "../storage";
import type { Letter } from "../types";
import { ShareButton } from "./ShareButton";

// One letter, set on the ruled writing paper kids learn to print on, with its name, age and town
// filled into the blanks across the top. A photo of the handwritten letter sits under the words, and
// opens to full size in place (a pop-over would land off screen inside a tall WordPress frame).
// `preview` is the form's own photo, before anything is uploaded; `share` adds the Share link (the
// mailbag only).
export function LetterCard({ letter, preview, share = false }: { letter: Letter; preview?: string; share?: boolean }) {
  return (
    <article className="letter" data-letter-id={letter.id} tabIndex={-1}>
      <h3 className="letter-head">
        <Blank label="Name" value={letter.first_name} />
        <Blank label="Age" value={ageLabel(letter.age)} />
        {letter.town && <Blank label="Town" value={letter.town} />}
      </h3>
      <div className="letter-body">
        {paragraphs(letter.body).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      {(preview || letter.photo_id) && (
        <LetterPhoto
          name={letter.first_name}
          thumb={preview ?? photoUrl(letter.photo_id!, "thumb")}
          full={preview ?? photoUrl(letter.photo_id!, "full")}
        />
      )}
      {share && <ShareButton letter={letter} />}
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

function LetterPhoto({ name, thumb, full }: { name: string; thumb: string; full: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="letter-photo" aria-expanded={open} onClick={() => setOpen(!open)}>
      <img src={open ? full : thumb} alt={`${possessive(name)} letter, as written`} loading="lazy" />
      <span className="letter-photo-label">{open ? "Show smaller" : `See ${possessive(name)} letter`}</span>
    </button>
  );
}
