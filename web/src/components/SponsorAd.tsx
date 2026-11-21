// A presenting sponsor's banner ad in the mailbag (ads.ts): the sponsor's own artwork, 970 by 500, linked
// where they asked, under a small label that says whose it is. It is marked `sponsored` for search engines
// like every paid link here, and a click is counted for the sponsor's report under the `banner` placement.
// The picture's room is held by its width and height, so the letters under it don't move when it arrives.
import { track } from "../analytics";
import type { Ad } from "../ads";
import { sponsorHref } from "../sales";

const FILES = `${import.meta.env.BASE_URL}ads/`;

export function SponsorAd({ ad }: { ad: Ad }) {
  const href = sponsorHref({ name: ad.sponsor, website_url: ad.href }, "banner") ?? ad.href;
  return (
    <section className="sponsor-ad" aria-label={`Presenting sponsor: ${ad.sponsor}`}>
      <p className="sponsor-ad-label" aria-hidden="true">
        Presenting sponsor
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => track("Sponsor Click", { sponsor: ad.sponsor, placement: "banner" })}
      >
        <img
          src={FILES + ad.image}
          // Twice the width, where the sponsor's file had it to give, for a sharp screen.
          srcSet={ad.sharp ? `${FILES + ad.image} ${ad.width}w, ${FILES + ad.sharp} ${ad.width * 2}w` : undefined}
          sizes={ad.sharp ? "(min-width: 50rem) 48rem, 100vw" : undefined}
          alt={ad.alt}
          width={ad.width}
          height={ad.height}
          loading="lazy"
        />
      </a>
    </section>
  );
}
