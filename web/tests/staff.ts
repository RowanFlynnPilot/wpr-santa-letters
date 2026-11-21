// A stand-in for the staff side of Supabase, for the staff page's browser tests (staff.spec.ts). The reader
// pages' fixtures (fixtures.ts) answer the public reads; this adds what only a signed-in staff member
// reaches: the sign-in itself, the letters with their families' details, the draws, and the functions the
// staff tools call. It keeps what it's told for the length of a test, so a tool that saves something and
// loads its list again sees it there, and it records every call so a test can say exactly what was sent.
//
// It refuses what the real functions refuse where a test needs to see the page say so (a sponsor's name
// already on the list, a prize that doesn't read after "wins", a prize that has been drawn). The rules
// themselves are the database's, and are tested there (supabase/tests); this only has to answer like it.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";
import { LETTERS, mockBackend, PRIZE, SEASON, SPONSOR } from "./fixtures";

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const BACKEND = "https://backend.test";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "content-range",
};

export const EDITOR = { id: "00000000-0000-4000-8000-00000000ed01", email: "editor@example.test" };

type Private = {
  source: "form" | "email" | "mail";
  parent_name: string | null;
  email: string | null;
  mail_contact: string | null;
  prize_eligible: boolean;
  moderated_at: string | null;
  rejection_reason: string | null;
  edited_at: string | null;
  posted_notice_at: string | null;
  forgotten_at: string | null;
};
export type StaffLetter = (typeof LETTERS)[number] & { status: "pending" | "approved" | "rejected"; letter_private: Private };

const family = (n: number, more: Partial<Private> = {}): Private => ({
  source: "form",
  parent_name: `Parent ${n}`,
  email: `parent${n}@example.test`,
  mail_contact: null,
  prize_eligible: true,
  moderated_at: "2026-12-04T15:00:00Z",
  rejection_reason: null,
  edited_at: null,
  posted_notice_at: "2026-12-04T15:00:05Z",
  forgotten_at: null,
  ...more,
});

// The mailbag's letters, posted, each from a family of its own; then two waiting (one with a school and a
// phone number in it, for the privacy check) and one that wasn't posted.
export const WAITING = {
  id: "00000000-0000-4000-8000-000000000021",
  first_name: "Nora",
  age: 6,
  town: "Weston",
  photo_id: null,
  created_at: "2026-12-05T16:00:00Z",
  body: "Dear Santa,\nI go to Riverview Elementary. Call 715-555-0142.\n\nLove, Nora",
};
export const STAFF_LETTERS: StaffLetter[] = [
  ...LETTERS.map((letter, i) => ({ ...letter, status: "approved" as const, letter_private: family(i + 1) })),
  { ...WAITING, status: "pending", letter_private: family(21, { moderated_at: null, posted_notice_at: null }) },
  {
    id: "00000000-0000-4000-8000-000000000022",
    first_name: "Eli",
    age: 3,
    town: null,
    photo_id: null,
    created_at: "2026-12-05T17:00:00Z",
    body: "truck",
    status: "pending",
    letter_private: family(22, { source: "mail", parent_name: null, email: null, mail_contact: "12 Elm St.\nWausau, WI 54401", moderated_at: null, posted_notice_at: null }),
  },
  {
    id: "00000000-0000-4000-8000-000000000023",
    first_name: "Test",
    age: 9,
    town: null,
    photo_id: null,
    created_at: "2026-12-03T12:00:00Z",
    body: "asdf asdf",
    status: "rejected",
    letter_private: family(23, { rejection_reason: "Not a letter.", posted_notice_at: null }),
  },
];

export interface Desk {
  sponsors: Record<string, unknown>[];
  prizes: Record<string, unknown>[];
  draws: { id: string; prize_id: string; letter_id: string; drawn_at: string; forfeited_at: string | null }[];
  letters: StaffLetter[];
  // Every function called, in order, with what it was sent.
  calls: { fn: string; args: Record<string, unknown> }[];
  // Logo files put into and taken out of storage, and the edge functions invoked.
  uploads: string[];
  removed: string[];
  invoked: { name: string; body: unknown }[];
}

// Signs the page in as staff before it loads: the session the Supabase client would have kept in the tab
// (supabase.ts keeps it in sessionStorage), good until long after the tests' fixed day. Nothing checks the
// token but this file.
export async function signIn(page: Page) {
  await page.addInitScript((user) => {
    const part = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const expires = Math.floor(Date.parse("2030-01-01T00:00:00Z") / 1000);
    const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp: expires })}.stand-in`;
    window.sessionStorage.setItem(
      "sb-backend-auth-token",
      JSON.stringify({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: expires,
        refresh_token: "stand-in",
        user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" },
      }),
    );
  }, EDITOR);
}

const refuse = (route: Route, message: string) =>
  route.fulfill({ status: 400, contentType: "application/json", headers: CORS, body: JSON.stringify({ code: "P0001", message, details: null, hint: null }) });
const answer = (route: Route, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status: 200, contentType: "application/json", headers: { ...CORS, ...headers }, body: JSON.stringify(body) });

export async function staffBackend(
  page: Page,
  options: Parameters<typeof mockBackend>[1] & { staff?: boolean; letters?: StaffLetter[]; draws?: Desk["draws"]; signedIn?: boolean } = {},
): Promise<Desk> {
  const desk: Desk = {
    sponsors: [...((options.sponsors as Record<string, unknown>[] | undefined) ?? [SPONSOR])].map((s, i) => ({ ...s, created_at: `2026-11-2${i}T12:00:00Z` })),
    prizes: [...((options.prizes as Record<string, unknown>[] | undefined) ?? [PRIZE])],
    draws: [...(options.draws ?? [])],
    letters: [...(options.letters ?? STAFF_LETTERS)],
    calls: [],
    uploads: [],
    removed: [],
    invoked: [],
  };
  let made = 0;
  const newId = () => `00000000-0000-4000-8000-0000000f${String(++made).padStart(4, "0")}`;

  // The public reads, as the reader pages get them; what follows is asked first and falls back to these.
  await mockBackend(page, { ...options, letters: desk.letters.filter((l) => l.status === "approved") });
  if (options.signedIn !== false) await signIn(page);

  const rpc = (route: Route, fn: string, args: Record<string, unknown>) => {
    desk.calls.push({ fn, args });
    const text = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
    switch (fn) {
      case "is_staff":
        return answer(route, options.staff ?? true);
      case "save_sponsor": {
        const name = text(args.p_name);
        if (desk.sponsors.some((s) => String(s.name).toLowerCase() === name.toLowerCase() && s.id !== args.p_sponsor_id)) {
          return refuse(route, `${name} is already on this year's list.`);
        }
        const row = { name, tier: args.p_tier, website_url: text(args.p_website_url) || null, logo_path: text(args.p_logo_path) || null };
        if (args.p_sponsor_id) Object.assign(desk.sponsors.find((s) => s.id === args.p_sponsor_id)!, row);
        else desk.sponsors.push({ id: newId(), ...row, created_at: new Date(Date.UTC(2026, 11, 1, 0, made)).toISOString() });
        return answer(route, args.p_sponsor_id ?? desk.sponsors.at(-1)!.id);
      }
      case "remove_sponsor": {
        if (desk.prizes.some((p) => p.sponsor_id === args.p_sponsor_id)) return refuse(route, "Take this sponsor's prizes off first.");
        const gone = desk.sponsors.find((s) => s.id === args.p_sponsor_id);
        desk.sponsors = desk.sponsors.filter((s) => s !== gone);
        return answer(route, gone?.logo_path ?? null);
      }
      case "move_sponsor": {
        const peers = desk.sponsors.filter((s) => s.tier === desk.sponsors.find((x) => x.id === args.p_sponsor_id)?.tier);
        const at = peers.findIndex((s) => s.id === args.p_sponsor_id);
        const to = at + (args.p_earlier ? -1 : 1);
        if (peers[to]) [peers[at].created_at, peers[to].created_at] = [peers[to].created_at, peers[at].created_at];
        return answer(route, null);
      }
      case "add_prizes": {
        const description = text(args.p_description);
        if (/^(A|An|The)\s/.test(description)) {
          return refuse(route, 'Start the prize in lowercase, so it reads after "wins": "a family pizza night", not "A family pizza night".');
        }
        for (let i = 0; i < Number(args.p_count); i++) {
          desk.prizes.push({ id: newId(), sponsor_id: args.p_sponsor_id, description, created_at: new Date(Date.UTC(2026, 11, 2, 0, made)).toISOString() });
        }
        return answer(route, Number(args.p_count));
      }
      case "remove_prize":
        if (desk.draws.some((d) => d.prize_id === args.p_prize_id)) return refuse(route, "That prize has been drawn, so it stays on the list.");
        desk.prizes = desk.prizes.filter((p) => p.id !== args.p_prize_id);
        return answer(route, null);
      case "moderate_letter": {
        const letter = desk.letters.find((l) => l.id === args.p_letter_id)!;
        letter.status = args.p_decision as StaffLetter["status"];
        letter.letter_private.rejection_reason = (args.p_reason as string | null) ?? null;
        return answer(route, null);
      }
      case "run_prize_drawing": {
        // One prize a family, in the order the prizes were added: enough for the page to show winners.
        const posted = desk.letters.filter((l) => l.status === "approved");
        desk.prizes
          .filter((p) => !desk.draws.some((d) => d.prize_id === p.id))
          .forEach((prize) => {
            const letter = posted.find((l) => !desk.draws.some((d) => d.letter_id === l.id && !d.forfeited_at));
            if (letter) desk.draws.push({ id: newId(), prize_id: String(prize.id), letter_id: letter.id, drawn_at: "2026-12-20T18:00:00Z", forfeited_at: null });
          });
        return answer(route, null);
      }
      default:
        return answer(route, null);
    }
  };

  await page.route(`${BACKEND}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith("/auth/v1/")) return answer(route, {});

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return rpc(route, url.pathname.split("/").pop()!, (request.postDataJSON() as Record<string, unknown> | null) ?? {});
    }
    if (url.pathname.startsWith("/functions/v1/")) {
      desk.invoked.push({ name: url.pathname.split("/").pop()!, body: request.postDataJSON() });
      return answer(route, { sent: true });
    }
    if (url.pathname.startsWith("/storage/v1/object/public/sponsor-logos/")) {
      // A logo uploaded in a test has a name of its own; any picture stands in for it.
      const name = url.pathname.split("/").pop()!;
      const path = file(`./fixtures/${name}`);
      return route.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: readFileSync(existsSync(path) ? path : file("./fixtures/logo-square.png")) });
    }
    if (url.pathname.startsWith("/storage/v1/object/sponsor-logos")) {
      if (request.method() === "DELETE") {
        const { prefixes } = request.postDataJSON() as { prefixes: string[] };
        desk.removed.push(...prefixes);
        return answer(route, prefixes.map((name) => ({ name })));
      }
      const name = url.pathname.split("/").pop()!;
      desk.uploads.push(name);
      return answer(route, { Key: `sponsor-logos/${name}`, Id: newId() });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop();
      const equals = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, "");
      switch (table) {
        case "sponsors":
          return answer(route, [...desk.sponsors].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
        case "prizes":
          return answer(route, desk.prizes);
        case "prize_draws":
          return answer(route, desk.draws);
        case "photo_deletions":
        case "newsletter_sections":
          return answer(route, []);
        case "letters": {
          const status = equals("status");
          const since = url.searchParams.get("letter_private.moderated_at")?.replace(/^gte\./, "");
          let rows = desk.letters.filter((l) => !status || l.status === status);
          if (since) rows = rows.filter((l) => (l.letter_private.moderated_at ?? "") >= since);
          if (request.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `0-0/${rows.length}` } });
          const newestFirst = url.searchParams.get("order")?.includes("desc");
          rows = [...rows].sort((a, b) => (newestFirst ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
          return answer(route, rows.map((l) => ({ ...l, season_id: SEASON.id })));
        }
      }
    }
    return route.fallback();
  });
  return desk;
}
