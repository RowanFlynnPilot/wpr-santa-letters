import { type CSSProperties, useState } from "react";
import { track } from "../analytics";
import { series } from "../format";
import { widestWord } from "../looks";
import { sponsorHref, type Placement } from "../sales";
import { logoUrl } from "../storage";
import type { Sponsor } from "../types";

// A logo this much wider than it is tall is a wordmark, which an upright stamp can only show small. It was
// 2 until the first real logos went up: Jones & Jones's, at 1.9 and drawn in thin pale lines, was a faint
// sliver beside three bolder ones with nothing under it to say whose it was.
const WORDMARK = 1.75;

// A stamp's face: the sponsor's logo, or until the logo arrives its name set in type, linked to its site.
// `named` is for the small stamps that share a corner: there a wordmark is a sliver, so the sponsor's name
// is set in type under it, where it can be read.
function Face({ sponsor, placement, named }: { sponsor: Sponsor; placement: Placement; named?: boolean }) {
  const [wordmark, setWordmark] = useState(false);
  // A sales preview's place that is still open: a blank stamp, there to show how many share the corner.
  if (sponsor.open) {
    return (
      <span className="stamp-face" aria-hidden="true">
        <span className="stamp-demo stamp-open" />
      </span>
    );
  }
  // Known once the logo has loaded (or straight away, when the browser already has it).
  const measure = (img: HTMLImageElement | null) => {
    if (img && img.naturalHeight > 0) setWordmark(img.naturalWidth / img.naturalHeight >= WORDMARK);
  };
  const withName = Boolean(named && wordmark);
  // The type is sized so the name's widest word fits the stamp whole, at any stamp size (styles.css).
  const name = (
    <span
      className={sponsor.demo ? "stamp-name stamp-demo" : "stamp-name"}
      style={{ "--widest": widestWord(sponsor.name) } as CSSProperties}
    >
      {sponsor.name}
    </span>
  );
  const face = sponsor.logo_path ? (
    <>
      {/* With its name beside it, the logo is decoration: the name is read once. */}
      <img ref={measure} onLoad={(e) => measure(e.currentTarget)} src={logoUrl(sponsor.logo_path)} alt={withName ? "" : sponsor.name} />
      {withName && name}
    </>
  ) : (
    name
  );
  const className = withName ? "stamp-face stamp-wordmark" : "stamp-face";
  const href = sponsorHref(sponsor, placement);
  return href ? (
    // Paid links are marked `sponsored` for search engines; each click is counted per sponsor and spot.
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => track("Sponsor Click", { sponsor: sponsor.name, placement })}
    >
      {face}
    </a>
  ) : (
    <span className={className}>{face}</span>
  );
}

// One postage stamp, where there is room for one (Santa's reply). A presenting sponsor's logo is the
// stamp; until one signs on, it's WPR's own badge.
export function Stamp({ sponsor, placement }: { sponsor: Sponsor | undefined; placement: Placement }) {
  if (!sponsor) {
    return (
      <div className="stamp stamp-house">
        <span className="stamp-face">
          <img src={`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`} alt="" width="64" height="64" />
        </span>
      </div>
    );
  }
  return (
    <div className="stamp">
      <Face sponsor={sponsor} placement={placement} />
      <p className="stamp-caption">Presented by {sponsor.name}</p>
    </div>
  );
}

// The stamps' place while the mailbag loads: as many blank stamps as it showed last time (stampsKept.ts),
// with the line that names them set but unseen, so the envelope is already the shape it will be.
export function StampsOpening({ names }: { names: string[] }) {
  if (names.length < 2) {
    return (
      <div className="stamp" aria-hidden="true">
        <span className="stamp-face" />
      </div>
    );
  }
  return (
    <div className="stamps stamps-opening" data-count={names.length} style={{ "--count": names.length } as CSSProperties} aria-hidden="true">
      <ul>
        {names.map((name) => (
          <li key={name}>
            <span className="stamp-face" />
          </li>
        ))}
      </ul>
      <p className="stamp-caption">Presented by {series(names)}</p>
    </div>
  );
}

// The envelope's corner: every presenting sponsor's stamp (four at most), side by side as on a letter
// that needed more postage, with one line naming them all. One sponsor, or none yet, is the single stamp.
export function Stamps({ sponsors, placement }: { sponsors: Sponsor[]; placement: Placement }) {
  if (sponsors.length < 2) return <Stamp sponsor={sponsors[0]} placement={placement} />;
  return (
    <div className="stamps" data-count={sponsors.length} style={{ "--count": sponsors.length } as CSSProperties}>
      <ul>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            <Face sponsor={sponsor} placement={placement} named />
          </li>
        ))}
      </ul>
      <p className="stamp-caption">
        Presented by <span className="stamp-names">{series(sponsors.filter((s) => !s.open).map((s) => s.name))}</span>
      </p>
    </div>
  );
}
