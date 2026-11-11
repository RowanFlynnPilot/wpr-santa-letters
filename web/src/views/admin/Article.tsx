// The Dec. 23 article: every letter in the mailbag, oldest first, between an intro and a closing staff
// can edit. One button copies it so it pastes formatted into WordPress's editor, or as HTML into a
// Custom HTML block.
import { useState } from "react";
import { articleHtml } from "../../article";
import { loadPrizes, loadSponsors, loadStaffLetters, loadWinners } from "../../data";
import { env } from "../../env";
import { series } from "../../format";
import type { Letter, Season, Sponsor } from "../../types";
import { useDraft } from "../../useDraft";
import { useLoad } from "../../useLoad";

async function loadArticle(seasonId: string) {
  const [letters, sponsors, prizes, winners] = await Promise.all([
    loadStaffLetters(seasonId),
    loadSponsors(seasonId),
    loadPrizes(seasonId),
    loadWinners(seasonId),
  ]);
  const posted = letters.filter((l) => l.status === "approved");
  // Winners in prize order, first names only, as in 2024.
  const winnerNames = prizes
    .map((prize) => winners.find((w) => w.prize_id === prize.id))
    .map((winner) => winner && posted.find((l) => l.id === winner.letter_id)?.first_name)
    .filter((name): name is string => Boolean(name));
  return { letters: posted, sponsors: sponsors.filter((s) => !s.demo), winnerNames };
}

function defaultIntro(year: number, sponsors: Sponsor[]): string {
  const presenting = sponsors.find((s) => s.tier === "presenting");
  const others = sponsors.filter((s) => s.tier !== "presenting").map((s) => s.name);
  return [
    `Wausau-area children wrote to Santa this year, and Wausau Pilot & Review is delivering their ${year} letters to the North Pole. Here’s what they’re wishing for.`,
    presenting && `Letters to Santa is presented by ${presenting.name}.`,
    others.length > 0 && `Thanks also to ${series(others)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function defaultClosing(year: number, winnerNames: string[]): string {
  return [
    winnerNames.length > 0 && `Congratulations to our ${year} prize winners: ${series(winnerNames)}! We’ll be in touch about your prizes.`,
    "Merry Christmas from all of us at Wausau Pilot & Review.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function Article({ season }: { season: Season }) {
  const article = useLoad(() => loadArticle(season.id));
  if (article.status === "loading") return <p className="status">Gathering the letters…</p>;
  if (article.status === "failed") return <p className="status">Couldn’t gather the letters: {article.error.message}</p>;
  const { letters, sponsors, winnerNames } = article.data;
  return (
    <ArticleEditor
      key={letters.length}
      letters={letters}
      intro={defaultIntro(season.year, sponsors)}
      closing={defaultClosing(season.year, winnerNames)}
      drawn={winnerNames.length > 0}
    />
  );
}

function ArticleEditor(props: { letters: Letter[]; intro: string; closing: string; drawn: boolean }) {
  const { letters, drawn } = props;
  // Edits are kept across tab switches; untouched, each follows the letters and winners as they change.
  const [intro, setIntro] = useDraft("article:intro", props.intro);
  const [closing, setClosing] = useDraft("article:closing", props.closing);
  const [copied, setCopied] = useState<string | null>(null);
  const html = articleHtml({ intro, letters, closing, mailbagUrl: env.mailbagPageUrl });

  // Formatted for the visual editor, and as HTML source for a Custom HTML block or the code editor.
  const copy = async () => {
    setCopied(null);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([html], { type: "text/plain" }),
        }),
      ]);
      setCopied("Copied. Paste it into the post in WordPress.");
    } catch (err) {
      console.error(err);
      setCopied("This browser wouldn’t copy it. Open “HTML” below, select all of it and copy.");
    }
  };

  return (
    <div className="article-desk">
      <p className="hint">
        All {letters.length} letters in the mailbag, oldest first. Copy it after the drawing, so the closing names the
        winners{drawn ? "" : " (the drawing hasn’t run yet)"}.
      </p>
      <label>
        Intro (set in italics)
        <textarea rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
      </label>
      <label>
        Closing
        <textarea rows={3} value={closing} onChange={(e) => setClosing(e.target.value)} />
      </label>
      <div className="actions">
        <button type="button" className="button button-airmail" onClick={copy}>
          Copy the article
        </button>
        {copied && <p role="status">{copied}</p>}
      </div>
      <details>
        <summary>HTML</summary>
        <textarea readOnly rows={10} value={html} onFocus={(e) => e.target.select()} />
      </details>
      <article className="article-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
