import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { DemoRibbon } from "./components/DemoRibbon";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { Masthead } from "./components/Masthead";
import { embedded, useAutoHeight } from "./host";
import { DEMO } from "./sales";

// Each view is its own download, fetched when its route opens: a reader of the mailbag never loads
// the Supabase client, the form's photo encoder or the staff page.
const Embed = lazy(() => import("./views/Embed").then((m) => ({ default: m.Embed })));
const Mailbag = lazy(() => import("./views/Mailbag").then((m) => ({ default: m.Mailbag })));
const Write = lazy(() => import("./views/Write").then((m) => ({ default: m.Write })));
const Admin = lazy(() => import("./views/Admin").then((m) => ({ default: m.Admin })));
const Reply = lazy(() => import("./views/Reply").then((m) => ({ default: m.Reply })));

// Hash routes, so GitHub Pages needs no rewrites. WordPress embeds the mailbag by URL, and the form
// opens inside the same frame. The reader pages carry WPR's flag and footer when opened on their own
// (a shared link, a `?demo` preview); inside WordPress, which has WPR's own header and footer, the
// flag is left out and the footer keeps only the feature's own lines. The front-page strip (#/embed)
// sits inside WPR's front page and carries neither; #/admin is staff-only. Santa's reply (#/reply) is
// a sheet to print, so it carries neither.
const ROUTES: Record<string, { View: LazyExoticComponent<ComponentType>; reader: boolean; loading: string }> = {
  "#/embed": { View: Embed, reader: false, loading: "" },
  "#/mailbag": { View: Mailbag, reader: true, loading: "Opening Santa’s mailbag…" },
  "#/write": { View: Write, reader: true, loading: "Loading the letter form…" },
  "#/admin": { View: Admin, reader: false, loading: "Loading…" },
  "#/reply": { View: Reply, reader: false, loading: "Opening Santa’s reply…" },
};

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useAutoHeight();

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  // Tolerate `#/mailbag?demo` as well as `?demo#/mailbag`.
  const path = hash.split("?")[0];
  // Anything else, the bare address included, is the mailbag.
  const { View, reader, loading } = ROUTES[path] ?? ROUTES["#/mailbag"];
  const inWordPress = embedded && !DEMO;
  return (
    <>
      {DEMO && <DemoRibbon />}
      {reader && !inWordPress && <Masthead />}
      <ErrorBoundary key={path}>
        <Suspense fallback={<p className="status">{loading}</p>}>
          <View />
        </Suspense>
      </ErrorBoundary>
      {reader && <Footer compact={inWordPress} />}
    </>
  );
}
