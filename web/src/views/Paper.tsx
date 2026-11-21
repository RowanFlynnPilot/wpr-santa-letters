// Santa's letter paper: one sheet to print for a child who would rather write by hand. It is the reply's
// stationery, blank: a place for a first name, an age and a town, ruled rows to write on, a box to draw in
// and, under a dashed fold line, a part for a grown-up (a name and an email, the mailing address, and what
// sending the letter agrees to). A mailed letter with no way to reach the family can't be told it's up, be
// sent Santa's reply or win a prize, so the sheet asks for one; and since a photo of the page is what the
// mailbag shows, that part sits at the foot, where it folds under.
//
// Like Santa's reply it is opened on its own page, not inside WordPress, so it prints as one sheet. It
// reads only the season (for the date mail has to arrive by, and to stop offering paper once the mailbag
// has closed), and never depends on it: if the season can't be read, the sheet is there without the date.
import { track } from "../analytics";
import { Horizon, NightSky } from "../components/Night";
import { EDITOR_EMAIL, MAIL_TO } from "../contact";
import { env } from "../env";
import { apLastDay } from "../format";
import { loadSeason } from "../reads";
import { useLoad } from "../useLoad";

// Rows to write on. A child who needs more turns the page over.
const ROWS = 7;

// An address as it's printed for someone to type: no "https://", no slash at the end.
const printed = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export function Paper() {
  const page = useLoad(loadSeason);
  if (page.status === "loading") return <p className="status">Getting Santa’s letter paper…</p>;
  const season = page.status === "ready" ? page.data : null;
  if (season && (season.phase === "closed" || season.phase === "delivered")) {
    return (
      <p className="status">
        Santa’s mailbag is closed for {season.year}. <a href={env.mailbagPageUrl}>Read the letters</a>.
      </p>
    );
  }
  return <LetterPaper arriveBy={season ? apLastDay(season.entries_close_at) : null} />;
}

function LetterPaper({ arriveBy }: { arriveBy: string | null }) {
  const print = () => {
    track("Letter Paper Printed");
    window.print();
  };
  return (
    <main className="reply paper night">
      <NightSky />
      <div className="reply-inner">
        <div className="reply-tools">
          <button type="button" className="button button-airmail" onClick={print}>
            Print Santa’s letter paper
          </button>
          <span>One sheet of letter paper. Print one for each child.</span>
        </div>
        <article className="reply-sheet paper-sheet">
          <h1 className="visually-hidden">Santa’s letter paper</h1>
          <header className="paper-head">
            <div>
              <p className="reply-from">To Santa Claus</p>
              <p className="reply-place">The North Pole</p>
            </div>
            <p className="paper-stamp">Draw your own stamp</p>
          </header>
          <p className="paper-blanks">
            <span className="paper-line">
              My name is{" "}
              <span className="paper-blank paper-blank-name">
                <small>first name only</small>
              </span>{" "}
              and I am <span className="paper-blank paper-blank-age" /> years old.
            </span>{" "}
            <span className="paper-line">
              I live in{" "}
              <span className="paper-blank paper-blank-town">
                <small>town</small>
              </span>
              .
            </span>
          </p>
          <p className="paper-dear">Dear Santa,</p>
          <div className="paper-rows" aria-hidden="true">
            {Array.from({ length: ROWS }, (_, row) => (
              <span key={row} />
            ))}
          </div>
          <div className="paper-drawing">
            <p>Draw Santa a picture</p>
            {/* Two pines and a star to color in. */}
            <svg viewBox="0 0 120 64" aria-hidden="true">
              <path d="M30 6 12 34h10L6 58h48L38 34h10z" />
              <path d="M84 22 72 42h7L68 58h32L89 42h7z" />
              <path d="M108 4l2.4 5.6 6 .5-4.6 4 1.4 5.9-5.2-3.1-5.2 3.1 1.4-5.9-4.6-4 6-.5z" />
            </svg>
          </div>
          <aside className="paper-grownup" aria-label="For a grown-up">
            <p className="paper-fold">
              <strong>Grown-ups, this part is for you.</strong> Fold it under before you photograph the letter. We do the
              same with a mailed one, so it is never shown.
            </p>
            <p className="paper-contact">
              <span>
                Your name <i />
              </span>
              <span>
                Your email <i />
              </span>
            </p>
            <p>
              We use these only to reach you about the letter and any prize: to tell you when it’s in Santa’s mailbag and
              to send Santa’s reply. We never publish them.
            </p>
            <p>
              <strong>Mail it to</strong> {MAIL_TO.join(", ")}
              {arriveBy ? `, to arrive by ${arriveBy}` : ""}. Or take a photo of the letter and send it at{" "}
              {printed(env.mailbagPageUrl)}.
            </p>
            <p>
              By sending this letter, a parent or legal guardian agrees to the rules ({printed(env.rulesUrl)}). Wausau Pilot
              &amp; Review may publish the letter and the child’s first name, age and town on its website, in its
              newsletters and on social media. To have it taken down, email {EDITOR_EMAIL}.
            </p>
          </aside>
        </article>
      </div>
      <Horizon />
    </main>
  );
}
