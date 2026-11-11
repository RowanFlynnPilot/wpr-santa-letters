// The staff page: review form letters, type in emailed and mailed ones, run the prize drawing, and
// copy out the Dec. 23 article. Open directly (not embedded): /wpr-santa-letters/#/admin. Staff sign
// in with a one-time email code; accounts must already exist and be in `staff`.
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { isStaff, loadSeason } from "../data";
import { env } from "../env";
import { supabase } from "../supabase";
import { useLoad } from "../useLoad";
import { AddLetter } from "./admin/AddLetter";
import { Article } from "./admin/Article";
import { Newsletter } from "./admin/Newsletter";
import { Prizes } from "./admin/Prizes";
import { Review } from "./admin/Review";

const TOOLS = [
  { tool: "review", label: "Review letters" },
  { tool: "add", label: "Add a letter" },
  { tool: "newsletter", label: "Newsletter" },
  { tool: "prizes", label: "Prize drawing" },
  { tool: "article", label: "Dec. 23 article" },
] as const;
type Tool = (typeof TOOLS)[number]["tool"];

export function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="status">Checking sign-in…</p>;
  return <main className="admin">{session ? <StaffOnly email={session.user.email} /> : <SignIn />}</main>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (event: FormEvent, action: () => Promise<{ error: Error | null }>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await action();
    setBusy(false);
    if (error) setError(error.message);
    return !error;
  };

  const sendCode = async (event: FormEvent) => {
    const ok = await run(event, () => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
    if (ok) setCodeSent(true);
  };

  const verify = (event: FormEvent) => run(event, () => supabase.auth.verifyOtp({ email, token: code, type: "email" }));

  return (
    <>
      <h1>Letters to Santa staff</h1>
      {codeSent ? (
        <form onSubmit={verify}>
          <label>
            The 6-digit code we sent to {email}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            Sign in
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode}>
          <label>
            Staff email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="button" disabled={busy}>
            Send me a code
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

async function loadDesk() {
  const [staff, season] = await Promise.all([isStaff(), loadSeason()]);
  return { staff, season };
}

function StaffOnly({ email }: { email: string | undefined }) {
  const desk = useLoad(loadDesk);
  const [tool, setTool] = useState<Tool>("review");
  const signOut = (
    <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
      Sign out
    </button>
  );

  if (desk.status === "loading") return <p className="status">Checking staff access…</p>;
  if (desk.status === "failed") return <p className="status">Couldn’t open the staff page: {desk.error.message}</p>;
  if (!desk.data.staff) {
    return (
      <p className="status">
        {email} isn’t on the Letters to Santa staff list. {signOut}
      </p>
    );
  }

  const { season } = desk.data;
  return (
    <>
      <header className="admin-head">
        <h1>Letters to Santa staff</h1>
        <p>
          Signed in as {email}. {signOut}
        </p>
        <p>
          <a href={env.mailbagPageUrl} target="_blank" rel="noreferrer">
            Open the mailbag
          </a>
        </p>
      </header>
      <nav className="tools" aria-label="Staff tools">
        {TOOLS.map(({ tool: t, label }) => (
          <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
            {label}
          </button>
        ))}
      </nav>
      {tool === "review" ? (
        <Review season={season} />
      ) : tool === "add" ? (
        <AddLetter season={season} />
      ) : tool === "newsletter" ? (
        <Newsletter season={season} />
      ) : tool === "prizes" ? (
        <Prizes seasonId={season.id} />
      ) : (
        <Article season={season} />
      )}
    </>
  );
}
