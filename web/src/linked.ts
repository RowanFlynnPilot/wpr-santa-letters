// A link to one letter: wausaupilotandreview.com/letters-to-santa/#letter=<id>&from=<email|share|front-page|newsletter>.
// embed.js hands it to the frame as ?letter=<id>&from=…; opened on its own, the app's address carries it
// the same way. It's read once, here, and taken off the address before analytics loads (main.tsx
// imports this first), so a pageview never names a letter; analytics gets only where the click came from.
const params = new URLSearchParams(window.location.search);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LINKED_LETTER = ID.test(params.get("letter") ?? "") ? params.get("letter")!.toLowerCase() : null;
export const LINKED_FROM = /^[a-z-]{1,20}$/.test(params.get("from") ?? "") ? params.get("from")! : "link";

if (params.has("letter") || params.has("from")) {
  params.delete("letter");
  params.delete("from");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}
