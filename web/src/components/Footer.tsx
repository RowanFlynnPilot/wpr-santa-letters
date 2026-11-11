import { track } from "../analytics";
import { env } from "../env";
import { salesMailto } from "../sales";

const SUPPORT_URL =
  "https://wausaupilotandreview.com/support-our-publication/?utm_source=letters-to-santa&utm_medium=widget&utm_campaign=footer";

// Links open in a new tab so a half-written letter is never lost. `compact` inside a WordPress page:
// its own footer already has the badge and WPR's contact line.
export function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className="wpr-footer">
      <div className="wpr-footer-inner">
        {!compact && (
          <img src={`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`} alt="" width="44" height="44" loading="lazy" />
        )}
        <div className="wpr-footer-text">
          <p>
            Parents and guardians send their children’s letters, and a Wausau Pilot &amp; Review editor reads every one
            before it goes in the mailbag. We publish first names, ages and towns only.
          </p>
          {!compact && <p>Wausau Pilot &amp; Review, 715-301-5539, a nonprofit newsroom serving Marathon County.</p>}
          <p className="wpr-footer-links">
            <a href={env.rulesUrl} target="_blank" rel="noopener">
              Rules
            </a>
            <a href={salesMailto("Letters to Santa sponsorship")} onClick={() => track("Sponsor Inquiry", { slot: "footer" })}>
              Sponsor Letters to Santa
            </a>
            <a href={SUPPORT_URL} target="_blank" rel="noopener" onClick={() => track("Donate Click", { from: "footer" })}>
              Support local news (tax-deductible)
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
