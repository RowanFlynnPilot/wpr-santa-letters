import type { CSSProperties } from "react";
import { track } from "../analytics";
import { widestWord } from "../looks";
import { sponsorHref, type Placement } from "../sales";
import { logoUrl } from "../storage";
import type { Sponsor } from "../types";

// The postage stamp in the envelope's corner. The presenting sponsor's logo is the stamp; until the
// slot sells, it's WPR's own badge. A sponsor without a logo yet has its name set in type.
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
  return (
    <div className="stamp">
      {href ? (
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
      )}
      <p className="stamp-caption">Presented by {sponsor.name}</p>
    </div>
  );
}
