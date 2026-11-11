// WPR's flag, centered over the thick-over-thin rule, as on the rest of the contest series.
// The mailbag's own title sits below it, never above. Logos are committed copies in
// web/public: WordPress upload URLs broke in the Sept. 2026 CDN move.
const WPR_URL = "https://wausaupilotandreview.com/";
const BASE = import.meta.env.BASE_URL;

export function Masthead() {
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());

  return (
    <header className="wpr-masthead">
      <a className="wpr-flag" href={WPR_URL} target="_top" aria-label="Wausau Pilot & Review home">
        <img className="wpr-badge" src={`${BASE}wpr-typewriter-badge.png`} alt="" width="62" height="62" />
        <img className="wpr-wordmark" src={`${BASE}wpr-wordmark.png`} alt="Wausau Pilot & Review" width="421" height="54" />
      </a>
      <p className="wpr-tagline">Where Locals Look First For News</p>
      <p className="wpr-dateline">
        <span>{today}</span>
        <span>Wausau, Wisconsin</span>
      </p>
    </header>
  );
}
