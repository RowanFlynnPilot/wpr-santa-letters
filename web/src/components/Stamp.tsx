import type { CSSProperties } from "react";
import { track } from "../analytics";
import { series } from "../format";
import { widestWord } from "../looks";
import { sponsorHref, type Placement } from "../sales";
import { logoUrl } from "../storage";
import type { Sponsor } from "../types";

// A stamp's face: the sponsor's logo, or until the logo arrives its name set in type, linked to its site.
function Face({ sponsor, placement }: { sponsor: Sponsor; placement: Placement }) {
  // A sales preview's place that is still open: a blank stamp, there to show how many share the corner.
  if (sponsor.open) {
    return (
      <span className="stamp-face" aria-hidden="true">
        <span className="stamp-demo stamp-open" />
      </span>
    );
  }
  const face = sponsor.logo_path ? (
    <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} />
  ) : (
    // The type is sized so the name's widest word fits the stamp whole, at any stamp size (styles.css).
    <span
      className={sponsor.demo ? "stamp-name stamp-demo" : "stamp-name"}
      style={{ "--widest": widestWord(sponsor.name) } as CSSProperties}
    >
      {sponsor.name}
    </span>
  );
  const href = sponsorHref(sponsor, placement);
  return href ? (
    // Paid links are marked `sponsored` for search engines; each click is counted per sponsor and spot.
    <a
      className="stamp-face"
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => track("Sponsor Click", { sponsor: sponsor.name, placement })}
    >
      {face}
    </a>
  ) : (
    <span className="stamp-face">{face}</span>
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

// The envelope's corner: every presenting sponsor's stamp (four at most), side by side as on a letter
// that needed more postage, with one line naming them all. One sponsor, or none yet, is the single stamp.
export function Stamps({ sponsors, placement }: { sponsors: Sponsor[]; placement: Placement }) {
  if (sponsors.length < 2) return <Stamp sponsor={sponsors[0]} placement={placement} />;
  return (
    <div className="stamps" data-count={sponsors.length} style={{ "--count": sponsors.length } as CSSProperties}>
      <ul>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            <Face sponsor={sponsor} placement={placement} />
          </li>
        ))}
      </ul>
      <p className="stamp-caption">
        Presented by <span className="stamp-names">{series(sponsors.filter((s) => !s.open).map((s) => s.name))}</span>
      </p>
    </div>
  );
}
