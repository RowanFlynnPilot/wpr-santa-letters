// Letters to Santa, on WPR's WordPress page. Installed once, site-wide, from the site's header or
// footer code (README "WordPress embed"):
//   <script src="https://rowanflynnpilot.github.io/wpr-santa-letters/embed.js" defer data-no-optimize="1"></script>
// The page itself carries only the mailbag's iframe, because WPR's firewall refuses a page save with
// script in it. This sizes the mailbag's frame to its content (no inner scrollbar), scrolls the page
// when the mailbag asks, opens the form when the page's address ends in #write, and opens one letter
// at #letter=<id> (the posted email's link, a share, the front-page strip, the newsletter). Without this script the
// frame still works, at its own height with a scrollbar inside, and those links open the mailbag at the top.
(function () {
  if (window.wprSantaLettersHost) return;
  window.wprSantaLettersHost = true;

  // The app's address, from this script's own; a cache plugin that bundles scripts loses it.
  var self = document.currentScript && document.currentScript.src;
  var app = self && /\/embed\.js(\?.*)?$/.test(self) ? self.replace(/embed\.js(\?.*)?$/, "") : "https://rowanflynnpilot.github.io/wpr-santa-letters/";
  var origin = new URL(app).origin;

  // LiteSpeed's lazy loading moves a frame's address to data-src until it scrolls into view.
  function address(frame) {
    var src = frame.getAttribute("src") || "";
    return src && src !== "about:blank" ? src : frame.getAttribute("data-src") || "";
  }
  // The mailbag's frame as pasted (#/mailbag). A `?demo` preview stays as pasted.
  function isMailbag(frame) {
    if (!frame.dataset.santaView) {
      var pasted = address(frame);
      frame.dataset.santaView = /#\/mailbag/.test(pasted) && !/[?&]demo/.test(pasted) ? "mailbag" : "other";
    }
    return frame.dataset.santaView === "mailbag";
  }
  function frames() {
    return Array.prototype.filter.call(document.querySelectorAll("iframe"), function (frame) {
      return address(frame).indexOf(app) === 0 && isMailbag(frame);
    });
  }
  function measure(frame) {
    if (frame.contentWindow) frame.contentWindow.postMessage({ source: "wpr-santa-letters-host", measure: true }, origin);
  }
  // Only #write and #letter=<id> ask the mailbag for something; any other anchor (#comments, a skip
  // link) leaves the frame where the reader took it, a half-written letter included.
  function wanted() {
    var letter = /^#(letter=[0-9a-f-]{36}(&from=[a-z-]+)?)$/i.exec(location.hash);
    if (letter) return app + "?" + letter[1] + "#/mailbag";
    return location.hash === "#write" ? app + "#/write" : null;
  }
  function watch(frame) {
    frame.addEventListener("load", function () { measure(frame); });
    measure(frame);
  }
  function route() {
    frames().forEach(function (frame) {
      if (!frame.dataset.santaHost) {
        frame.dataset.santaHost = "1";
        watch(frame);
      }
      var target = wanted();
      if (!target) return;
      if (address(frame) !== target) {
        // A fresh frame at the new address. Changing src on a frame whose first load is still under
        // way can lose to that load in Chrome, and the reader gets the plain mailbag.
        var fresh = frame.cloneNode(false);
        fresh.setAttribute("src", target);
        // A lazy frame's loader still swaps in data-src, so it gets the same address.
        if (fresh.hasAttribute("data-src")) fresh.setAttribute("data-src", target);
        frame.replaceWith(fresh);
        watch(fresh);
        frame = fresh;
      }
      frame.scrollIntoView({ block: "start" });
    });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.source !== "wpr-santa-letters") return;
    var frame = frames().filter(function (f) { return f.contentWindow === event.source; })[0];
    if (!frame) return;
    if (event.data.height) frame.style.height = event.data.height + "px";
    if (event.data.scrollToTop) frame.scrollIntoView({ block: "start" });
    if (typeof event.data.scrollTo === "number") {
      window.scrollTo(0, frame.getBoundingClientRect().top + window.scrollY + event.data.scrollTo);
    }
  });
  window.addEventListener("hashchange", route);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", route);
  else route();
})();
