import { useId } from "react";

// A round postmark in red ink: where it was marked around the top, the day in the middle. Santa's reply
// carries the full one, with wavy cancellation lines, from the North Pole; each letter in the mailbag
// carries a small one with the day it arrived. Screen readers get `label` instead of the pieces.
export function Postmark({
  place,
  date,
  label,
  cancelled = false,
}: {
  place: string;
  date: string;
  label: string;
  // The wavy lines that run off across the stamp.
  cancelled?: boolean;
}) {
  // Several postmarks share a page (one per letter), so each one's arcs get ids of their own.
  const id = useId();
  // The lettering is spaced to fill the arc: fewer letters, wider apart.
  const spacing = Math.max(0.4, Math.min(1.2, (88 - place.length * 5.6) / place.length));
  return (
    <svg
      className={cancelled ? "postmark postmark-cancelled" : "postmark"}
      viewBox={cancelled ? "0 0 168 96" : "0 0 96 96"}
      role="img"
      aria-label={label}
    >
      <defs>
        <path id={`${id}-top`} d="M 17 48 A 31 31 0 0 1 79 48" />
        <path id={`${id}-bottom`} d="M 13 48 A 35 35 0 0 0 83 48" />
      </defs>
      <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="48" cy="48" r="25" fill="none" stroke="currentColor" strokeWidth="1" />
      <text fontSize="9.5" letterSpacing={spacing} fill="currentColor" textAnchor="middle">
        <textPath href={`#${id}-top`} startOffset="50%">
          {place.toUpperCase()}
        </textPath>
      </text>
      <text fontSize="8" letterSpacing="4" fill="currentColor" textAnchor="middle">
        <textPath href={`#${id}-bottom`} startOffset="50%">
          ★★★
        </textPath>
      </text>
      <text x="48" y="52" fontSize="11" textAnchor="middle" fill="currentColor" fontWeight="700">
        {date.toUpperCase()}
      </text>
      {cancelled &&
        [34, 44, 54, 64].map((y) => (
          <path key={y} d={`M 92 ${y} q 9 -6 18 0 t 18 0 t 18 0 t 18 0`} fill="none" stroke="currentColor" strokeWidth="2" />
        ))}
    </svg>
  );
}
