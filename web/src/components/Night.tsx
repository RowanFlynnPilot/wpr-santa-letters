// The winter night the envelope sits in: the moon, the horizon of pines with the North Pole's signpost,
// and the route the letters take, from Wausau to the North Pole, with the sleigh as far along it as the
// season is. All of it is drawn here (inline SVG and CSS): nothing is fetched, and none of it is content,
// so screen readers skip everything but the countdown's sentence.
import type { CSSProperties } from "react";
import { countdown, route } from "../countdown";
import { apDate, apLastDay } from "../format";
import type { Season } from "../types";

// Behind the envelope: the northern lights, faint across the top of the sky, and the moon in the corner.
// The snow is two CSS layers on .night itself (styles.css), and falls in front of both.
export function NightSky() {
  return (
    <>
      <div className="night-aurora" aria-hidden="true" />
      <div className="night-moon" aria-hidden="true" />
    </>
  );
}

// The foot of the scene: a far ridge, pines, a cabin with a lit window and a thread of smoke, the striped
// pole, and the snow the page itself is made of.
export function Horizon() {
  return (
    <svg className="night-horizon" viewBox="0 0 1280 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path className="night-ridge" d="M0 108 Q 320 58 640 98 T 1280 78 V170 H0 Z" />
      <g className="night-pines">
        <polygon points="70,40 44,92 96,92" />
        <polygon points="70,66 36,128 104,128" />
        <polygon points="150,62 130,104 170,104" />
        <polygon points="150,84 124,134 176,134" />
        <polygon points="232,30 204,88 260,88" />
        <polygon points="232,60 196,128 268,128" />
        <polygon points="318,72 300,108 336,108" />
        <polygon points="318,90 294,132 342,132" />
        <polygon points="560,74 544,106 576,106" />
        <polygon points="560,90 538,128 582,128" />
        <polygon points="880,58 858,102 902,102" />
        <polygon points="880,80 852,130 908,130" />
        <polygon points="1082,40 1056,92 1108,92" />
        <polygon points="1082,66 1048,128 1116,128" />
        <polygon points="1150,66 1132,104 1168,104" />
        <polygon points="1150,86 1126,130 1174,130" />
        <polygon points="1224,40 1198,92 1250,92" />
        <polygon points="1224,68 1190,126 1258,126" />
      </g>
      {/* A cabin among the pines, in the gap between two stands of them: dark like the trees, snow on its
          roof, one window lit, and smoke from the chimney (styles.css lets it drift). The snow in front
          covers its foot. */}
      <g className="night-cabin">
        <g className="night-smoke">
          <circle cx="469" cy="82" r="3" />
          <circle cx="473" cy="73" r="4" />
          <circle cx="470" cy="62" r="5" />
        </g>
        <rect x="466" y="88" width="6" height="12" />
        <rect x="430" y="104" width="46" height="30" />
        <polygon points="424,106 453,86 482,106" />
        <path className="night-cabin-snow" d="M427 104 453 86.5 479 104" />
        <rect className="night-cabin-glow" x="439" y="109" width="16" height="15" rx="2" />
        <rect className="night-cabin-window" x="442" y="112" width="10" height="9" />
        <path className="night-cabin-panes" d="M447 112v9M442 116.5h10" />
        <rect className="night-cabin-door" x="460" y="114" width="8" height="20" />
      </g>
      {/* The striped pole and its sign: low enough to clear the envelope's foot, and far enough in that a
          phone's narrower view of the horizon still shows them. */}
      <g>
        <rect x="966" y="92" width="8" height="42" fill="#fffdf8" />
        <rect x="966" y="100" width="8" height="8" fill="#b3261e" />
        <rect x="966" y="116" width="8" height="8" fill="#b3261e" />
        <rect x="928" y="70" width="84" height="24" fill="#fffdf8" />
        <text x="970" y="87" textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1" fill="#b3261e">
          NORTH POLE
        </text>
      </g>
      <path className="night-snow" d="M0 136 Q 200 104 460 128 T 900 122 T 1280 110 V170 H0 Z" />
    </svg>
  );
}

// The route above the envelope. Its one sentence is the countdown (countdown.ts: "13 days left to send a
// letter."); the track under it is a picture of the same thing, the sleigh as far along as the season is,
// with the season's three dates under it. Without a season (the mailbag is still loading) it is the bare
// track, the same height, so nothing moves when the season arrives. A sales preview counts as open, like
// the rest of the page. Once the letters are delivered the sleigh makes the whole trip as the page opens
// (styles.css: the send-off), from Wausau to the North Pole; the phase, which the database
// decides, is what says so (invariant 1), never the clock.
export function Route({ season }: { season?: Season }) {
  const at = season ? route(season) : null;
  const sentence = season ? countdown(season) : null;
  return (
    <div className="route" data-phase={season?.phase}>
      {/* The line is there, at its height, with or without the sentence (none while loading or once delivered). */}
      <div className="route-count">{sentence && <p className="countdown">{sentence}</p>}</div>
      <div
        className="route-track"
        aria-hidden="true"
        style={at ? ({ "--sleigh": `${(at.sleigh * 100).toFixed(2)}%`, "--last-day": `${(at.lastDay * 100).toFixed(2)}%` } as CSSProperties) : undefined}
      >
        <span className="route-line" />
        {at && <span className="route-done" />}
        <span className="route-stop route-start" />
        {at && <span className="route-stop route-last" />}
        <svg className="route-star" viewBox="0 0 24 24">
          <path d="M12 1.5l3 7.1 7.6.6-5.8 5 1.8 7.4L12 17.7 5.4 21.6l1.8-7.4-5.8-5 7.6-.6z" />
        </svg>
        {at && (
          <svg className="route-sleigh" viewBox="0 0 60 34">
            {/* Heading right: the sack of letters over the high back, the body with its curled front, the
                runner under it on two struts. */}
            <path d="M8 13c-3-6 1-12 8-12s11 5 9 12z" opacity="0.8" />
            <path d="M4 5h5c0 9 3 12 9 12h18c5 0 8-2 9-8 1-5 5-7 9-5 3 2 3 6 0 7-2 1-4 0-4-2 0 9-5 14-13 14H17C8 23 4 17 4 5z" />
            <path d="M5 31h36c7 0 11-3 12-8M16 23v8M36 23v8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="route-labels" aria-hidden="true">
        <span>
          <b>Wausau</b>
          {season && apDate(season.entries_open_at)}
        </span>
        {season && at && (
          <span className="route-last-label" style={{ "--last-day": `${(at.lastDay * 100).toFixed(2)}%` } as CSSProperties}>
            <b>Last day to write</b>
            {apLastDay(season.entries_close_at)}
          </span>
        )}
        <span>
          <b>North Pole</b>
          {season && apDate(season.delivered_at)}
        </span>
      </div>
    </div>
  );
}
