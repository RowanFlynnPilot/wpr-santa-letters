// The newsletter section's "Presented by" line, as email HTML: the presenting sponsors' names, or their
// logos once they have them. Kept apart from newsletter.ts, with no imports, so Deno can test it as it is
// (emailMarks_test.ts) and the browser tests can look at it set in a 600px column.

// An opening bracket gets an invisible word joiner after it, so nothing here can form a merge tag
// ("[[…]]") the newsletter would fill in for each subscriber.
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\[/g, "[&#8288;");
}

export interface Size {
  width: number;
  height: number;
}

// One sponsor in the line. A logo comes with the size it's shown at: Outlook ignores CSS limits and shows
// a picture at its own size unless the width and height are written on it.
export interface Mark {
  name: string;
  href: string | null;
  logo: ({ src: string } & Size) | null;
}

// Logos in email: PNG, JPEG or GIF only (Gmail drops SVG, Outlook drops WebP). Otherwise, the name.
export const EMAIL_LOGO = /\.(png|jpe?g|gif)$/i;

// The room each logo gets: a square one stands 40px tall, a wide wordmark runs 132px, and neither towers
// over the other. Up to four fit across the newsletter's column.
const ROOM: Size = { width: 132, height: 40 };

// The size a logo is shown at: as large as its room allows, in its own shape.
export function fitLogo(natural: Size): Size {
  const scale = Math.min(ROOM.width / natural.width, ROOM.height / natural.height);
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) };
}

function series(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// A sponsor with a site is a link to it; `place` is the styling that sets one beside the next, if any.
function linked(mark: Mark, inner: string, place = ""): string {
  if (mark.href) return `<a href="${esc(mark.href)}" style="${place}text-decoration:none;">${inner}</a>`;
  return place ? `<span style="${place.trim()}">${inner}</span>` : inner;
}

// "Presented by A, B and C" while every sponsor is a name; once any has a logo, "Presented by" and then
// the sponsors side by side, each a logo or (until its logo arrives) its name, wrapping if they must.
export function presentedBy(marks: Mark[]): string {
  const name = (mark: Mark) => `<strong style="color:#1a1a1a;">${esc(mark.name)}</strong>`;
  if (marks.every((mark) => !mark.logo)) {
    return `Presented by ${series(marks.map((mark) => linked(mark, name(mark))))}`;
  }
  const place = "display:inline-block; margin:8px 18px 0 0; vertical-align:middle; ";
  return `Presented by<br>${marks
    .map((mark) =>
      linked(
        mark,
        mark.logo
          ? `<img src="${esc(mark.logo.src)}" alt="${esc(mark.name)}" width="${mark.logo.width}" height="${mark.logo.height}" style="display:block; width:${mark.logo.width}px; height:${mark.logo.height}px; border:0;">`
          : name(mark),
        place,
      ),
    )
    .join("")}`;
}
