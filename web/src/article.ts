// The Dec. 23 article, in the 2024 format: an italic intro, then each letter under its bolded byline
// with a rule between letters, then the closing. Every word is escaped; paragraphs follow the blank
// lines in what was typed, and single line breaks stay line breaks, as children write them.
import { byline, paragraphs } from "./format";
import type { Letter } from "./types";

// An opening bracket gets an invisible word joiner after it, so a letter can't carry a WordPress
// shortcode ("[gallery …]", "[embed]") into the post. An entity alone isn't enough: pasted into the
// visual editor, the HTML is parsed, the entity becomes "[" again, and the post runs the shortcode.
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "[": "&#91;&#8288;",
  "]": "&#93;",
};
function escape(text: string): string {
  return text.replace(/[&<>"'[\]]/g, (c) => ESCAPES[c]);
}

function html(text: string, wrap: (inner: string) => string = (inner) => inner): string[] {
  return paragraphs(text).map((p) => `<p>${wrap(escape(p).replace(/\n/g, "<br>"))}</p>`);
}

export function articleHtml(options: { intro: string; letters: Letter[]; closing: string; mailbagUrl: string }): string {
  const { intro, letters, closing, mailbagUrl } = options;
  const blocks = [
    ...html(intro, (inner) => `<em>${inner}</em>`),
    letters
      .map((letter) => [`<p><strong>${escape(byline(letter))}</strong></p>`, ...html(letter.body)].join("\n"))
      .join("\n<hr>\n"),
    ...html(closing),
    // The photos and drawings stay in the mailbag; send readers there for them.
    ...(letters.some((l) => l.photo_id)
      ? [`<p>See the letters as they were written, drawings and all, in <a href="${escape(mailbagUrl)}">Santa’s mailbag</a>.</p>`]
      : []),
  ];
  return blocks.filter(Boolean).join("\n");
}
