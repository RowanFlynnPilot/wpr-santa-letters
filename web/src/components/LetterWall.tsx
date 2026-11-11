// The mailbag's letters: the newest 24, then more on request, with a box to find one by first name
// or town. Letters are laid out row by row across as many columns as fit, each going to the shortest
// column so far (by an estimate of its height), so the newest read across the top and showing more
// adds below without moving any letter already on screen, as CSS columns would.
import { useEffect, useRef, useState } from "react";
import { capitalize, count } from "../format";
import type { Letter } from "../types";
import { LetterCard } from "./LetterCard";

const PAGE = 24;
const COLUMN_REM = 19;
const GAP_PX = 24;

function useColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      setColumns(Math.max(1, Math.floor((element.clientWidth + GAP_PX) / (COLUMN_REM * rem + GAP_PX))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return { ref, columns };
}

// Roughly how tall a letter will be, in ruled rows: enough to keep columns even without measuring.
function rows(letter: Letter): number {
  const lines = letter.body.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 34)), 0);
  // The blanks and the foot, the words, and a photo's frame (4:5 at most, the width of a column).
  return 5 + lines + (letter.photo_id ? 10 : 0);
}

function stack(letters: Letter[], columns: number): Letter[][] {
  const stacks: Letter[][] = Array.from({ length: columns }, () => []);
  const heights = new Array<number>(columns).fill(0);
  for (const letter of letters) {
    const shortest = heights.indexOf(Math.min(...heights));
    stacks[shortest].push(letter);
    heights[shortest] += rows(letter);
  }
  return stacks;
}

function matches(letter: Letter, words: string[]): boolean {
  const text = `${letter.first_name} ${letter.town ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

export function LetterWall({ letters }: { letters: Letter[] }) {
  const { ref, columns } = useColumns();
  const [shown, setShown] = useState(PAGE);
  const [find, setFind] = useState("");
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length > 0 ? letters.filter((letter) => matches(letter, words)) : letters;
  // A search shows every match; otherwise a page at a time.
  const visible = words.length > 0 ? found : found.slice(0, shown);
  // After Show more, focus moves to the first new letter, so keyboard and screen-reader users land on
  // what was added rather than on the button below it.
  const firstNew = useRef<string | null>(null);
  useEffect(() => {
    if (!firstNew.current) return;
    document.querySelector<HTMLElement>(`[data-letter-id="${firstNew.current}"]`)?.focus();
    firstNew.current = null;
  }, [shown]);

  return (
    <section className="letters" aria-labelledby="letters-heading">
      <h2 id="letters-heading" className="visually-hidden">
        Letters
      </h2>
      {letters.length > PAGE && (
        <div className="find">
          <label>
            Find a letter
            <input
              type="search"
              placeholder="First name or town"
              autoComplete="off"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </label>
          {words.length > 0 && (
            <p className="hint" role="status">
              {found.length === 0
                ? "No letters match. An editor reads every letter before it goes up, so a new one can take a day or two."
                : `${capitalize(count(found.length, "letter matches", "letters match"))}.`}
            </p>
          )}
        </div>
      )}
      <div className="letter-wall" ref={ref} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {stack(visible, columns).map((column, i) => (
          <div className="letter-column" key={i}>
            {column.map((letter) => (
              <LetterCard key={letter.id} letter={letter} share />
            ))}
          </div>
        ))}
      </div>
      {words.length === 0 && found.length > shown && (
        <div className="more">
          <button
            type="button"
            className="button"
            onClick={() => {
              firstNew.current = found[shown]?.id ?? null;
              setShown((n) => n + PAGE);
            }}
          >
            Show more letters
          </button>
          <p className="hint">
            Showing {shown} of {found.length}
          </p>
        </div>
      )}
    </section>
  );
}
