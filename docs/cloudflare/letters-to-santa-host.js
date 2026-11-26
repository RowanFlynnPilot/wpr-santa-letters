// A Cloudflare Worker for wausaupilotandreview.com, on the route  wausaupilotandreview.com/letters-to-santa*
//
// WPR's server firewall refuses a WordPress page save with script in it, so the Letters to Santa page
// holds only the mailbag's iframe. This adds the one script that page needs (web/public/embed.js: it
// sizes the frame to its content and opens the letter a link points to) as the page passes through
// Cloudflare. Nothing in WordPress changes, and no other page is touched.
//
// To undo it: delete the route (Workers & Pages > this Worker > Settings > Domains & Routes).
// Set the route to "Fail open", so the page is served as usual if the Worker is ever over its limit.

// data-no-optimize keeps LiteSpeed from bundling it; data-cfasync keeps Cloudflare's Rocket Loader off it.
const TAG =
  '<script src="https://rowanflynnpilot.github.io/wpr-santa-letters/embed.js" defer data-no-optimize="1" data-cfasync="false"></script>';

export default {
  async fetch(request, env, ctx) {
    // If anything here throws, the request goes on to the site as if there were no Worker.
    ctx.passThroughOnException();

    const response = await fetch(request);
    const type = response.headers.get("content-type") || "";
    // Only a page that loaded: not a redirect, an error, a picture or a form post.
    if (request.method !== "GET" || response.status !== 200 || !type.includes("text/html")) return response;

    return new HTMLRewriter()
      .on("body", {
        element(body) {
          body.append(TAG, { html: true });
        },
      })
      .transform(response);
  },
};
