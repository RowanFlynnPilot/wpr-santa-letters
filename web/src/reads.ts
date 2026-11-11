// The public reads (the mailbag, the form's season, the front-page strip), straight from the database's
// REST API with the publishable key: readers only read public rows, so they never download the
// Supabase client. The staff page, the one page that loads it, hands these reads the session's token
// through readAsSignedIn() in data.ts, so staff read as themselves, RLS and all.
import { env } from "./env";
import { withDemoSponsor } from "./sales";
import type { Letter, Mailbag, Prize, Season, Sponsor, Winner } from "./types";

export const LETTER_COLUMNS = "id, first_name, age, town, body, photo_id, created_at";

let sessionToken: () => Promise<string | null> = async () => null;

// Called once by data.ts: the signed-in session's access token (refreshed by the client), or null.
export function readAsSignedIn(token: () => Promise<string | null>): void {
  sessionToken = token;
}

type Query = [name: string, value: string][];

async function request(table: string, query: Query, prefer: { single?: boolean; count?: boolean } = {}) {
  const url = new URL(`${env.supabaseUrl}/rest/v1/${table}`);
  // As the client does: spaces in a select list aren't part of it.
  for (const [name, value] of query) url.searchParams.append(name, name === "select" ? value.replace(/\s/g, "") : value);
  // The key goes in apikey only: it isn't a JWT, so Authorization carries a signed-in staff member's
  // token or nothing (Supabase reads a request without one as the public).
  const headers: Record<string, string> = { apikey: env.supabasePublishableKey };
  const token = await sessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer.single) headers.Accept = "application/vnd.pgrst.object+json";
  if (prefer.count) headers.Prefer = "count=exact";
  const response = await fetch(url, { method: prefer.count ? "HEAD" : "GET", headers });
  if (!response.ok) {
    const body = prefer.count ? null : await response.json().catch(() => null);
    throw new Error(body?.message ?? `The mailbag didn't load (${response.status}).`);
  }
  return response;
}

async function rows<T>(table: string, query: Query, single = false): Promise<T> {
  return (await request(table, query, { single })).json() as Promise<T>;
}

async function count(table: string, query: Query): Promise<number> {
  const total = Number((await request(table, query, { count: true })).headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error("The letter count wasn't returned.");
  return total;
}

export async function loadSeason(): Promise<Season> {
  return rows<Season>("current_season", [["select", "id, year, entries_open_at, entries_close_at, delivered_at, phase"]], true);
}

export async function loadSponsors(seasonId: string): Promise<Sponsor[]> {
  const sponsors = await rows<Sponsor[]>("sponsors", [
    ["select", "id, name, tier, logo_path, website_url"],
    ["season_id", `eq.${seasonId}`],
    ["order", "created_at.asc"],
  ]);
  return withDemoSponsor(sponsors);
}

// In the order they were added, which is the order the drawing gives them out.
export async function loadPrizes(seasonId: string): Promise<Prize[]> {
  return rows<Prize[]>("prizes", [
    ["select", "id, sponsor_id, description, created_at"],
    ["season_id", `eq.${seasonId}`],
    ["order", "created_at.asc"],
    ["order", "id.asc"],
  ]);
}

// Newest first, as they arrive in the mailbag.
export async function loadLetters(seasonId: string): Promise<Letter[]> {
  return rows<Letter[]>("mailbag", [
    ["select", LETTER_COLUMNS],
    ["season_id", `eq.${seasonId}`],
    ["order", "created_at.desc"],
  ]);
}

// One letter in the mailbag (Santa's reply), or null if it isn't there (never posted, or taken down).
export async function loadLetter(letterId: string): Promise<Letter | null> {
  const found = await rows<Letter[]>("mailbag", [
    ["select", LETTER_COLUMNS],
    ["id", `eq.${letterId}`],
  ]);
  return found[0] ?? null;
}

// The front-page strip's few: the newest letters, and how many there are in all.
export async function loadNewest(seasonId: string, limit: number): Promise<{ letters: Letter[]; total: number }> {
  const [letters, total] = await Promise.all([
    rows<Letter[]>("mailbag", [
      ["select", LETTER_COLUMNS],
      ["season_id", `eq.${seasonId}`],
      ["order", "created_at.desc"],
      ["limit", String(limit)],
    ]),
    count("mailbag", [
      ["select", "id"],
      ["season_id", `eq.${seasonId}`],
    ]),
  ]);
  return { letters, total };
}

// Readers get none until the letters are delivered (RLS); staff get the current winners.
export async function loadWinners(seasonId: string): Promise<Winner[]> {
  return rows<Winner[]>("prize_winners", [
    ["select", "prize_id, letter_id"],
    ["season_id", `eq.${seasonId}`],
  ]);
}

// The editor's pick: the id of the one letter set at the top of the mailbag, if there is one (RLS: only
// while that letter is up). A page without a pick is still the mailbag, so a failure here (the table is
// newer than the rest; a deploy can reach the page before the database) reads as "no pick", not an error.
export async function loadFeaturedId(seasonId: string): Promise<string | null> {
  try {
    const found = await rows<{ letter_id: string }[]>("featured_letters", [
      ["select", "letter_id"],
      ["season_id", `eq.${seasonId}`],
    ]);
    return found[0]?.letter_id ?? null;
  } catch (err) {
    console.warn("The editor's pick didn't load:", err);
    return null;
  }
}

export async function loadMailbag(): Promise<Mailbag> {
  const season = await loadSeason();
  const [sponsors, prizes, letters, winners, featured] = await Promise.all([
    loadSponsors(season.id),
    loadPrizes(season.id),
    loadLetters(season.id),
    loadWinners(season.id),
    loadFeaturedId(season.id),
  ]);
  return { season, sponsors, prizes, letters, winners, featured };
}
