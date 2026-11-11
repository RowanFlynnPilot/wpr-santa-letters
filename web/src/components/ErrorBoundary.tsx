import { Component, type ReactNode } from "react";
import { track } from "../analytics";

// A view that throws while rendering shows a plain line instead of an empty frame on WPR's page. App
// keys it by route, so moving to another view starts fresh. A view's file that won't load, in Chrome,
// Firefox or Safari's words, is a page left open across a deploy: a reload fetches the new build.
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically/i;

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; stale: boolean }> {
  state = { failed: false, stale: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, stale: STALE.test(String(error instanceof Error ? error.message : error)) };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    track("App Error", { message: String(error instanceof Error ? error.message : error).slice(0, 120) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.stale) {
      return (
        <p className="status">
          Letters to Santa was just updated.{" "}
          <button type="button" className="link-button" onClick={() => window.location.reload()}>
            Reload it
          </button>
        </p>
      );
    }
    return <p className="status">Letters to Santa isn't loading right now. Try again in a few minutes.</p>;
  }
}
