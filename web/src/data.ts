// The staff page: everything that needs the Supabase client and a signed-in staff member. The
// mailbag's reads live in reads.ts and the form's send in send.ts, neither of which loads the client;
// where this module is loaded the reads carry the signed-in session's token, which the client keeps
// fresh, so staff read as themselves.
import { FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import type { PreparedPhoto } from "./photo";
import { LETTER_COLUMNS, readAsSignedIn } from "./reads";
import { photoPaths } from "./storage";
import { supabase } from "./supabase";
import type { Draw, LetterSource, LetterStatus, SavedNewsletterSection, StaffLetter } from "./types";

readAsSignedIn(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
export { loadMailbag, loadPrizes, loadSeason, loadSponsors, loadWinners } from "./reads";

type Result = { data: unknown; error: PostgrestError | null };

async function rows<T>(query: PromiseLike<Result>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

// Staff ---------------------------------------------------------------------------

const STAFF_COLUMNS =
  `${LETTER_COLUMNS}, status, letter_private(source, parent_name, email, mail_contact, prize_eligible, moderated_at, rejection_reason, edited_at, posted_notice_at, forgotten_at)`;

export async function isStaff(): Promise<boolean> {
  return rows<boolean>(supabase.rpc("is_staff"));
}

// Waiting letters oldest first, so the queue is worked in the order they came; the rest newest first.
export async function loadReview(seasonId: string, status: LetterStatus): Promise<StaffLetter[]> {
  return rows<StaffLetter[]>(
    supabase
      .from("letters")
      .select(STAFF_COLUMNS)
      .eq("season_id", seasonId)
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" }),
  );
}

export async function loadStaffLetters(seasonId: string): Promise<StaffLetter[]> {
  return rows<StaffLetter[]>(
    supabase.from("letters").select(STAFF_COLUMNS).eq("season_id", seasonId).order("created_at", { ascending: true }),
  );
}

async function countStatus(seasonId: string, status: LetterStatus): Promise<number> {
  const { count, error } = await supabase
    .from("letters")
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId)
    .eq("status", status);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countWaiting(seasonId: string): Promise<number> {
  return countStatus(seasonId, "pending");
}

export async function countByStatus(seasonId: string): Promise<Record<LetterStatus, number>> {
  const [pending, approved, rejected] = await Promise.all(
    (["pending", "approved", "rejected"] as const).map((status) => countStatus(seasonId, status)),
  );
  return { pending, approved, rejected };
}

// Letters that went into the mailbag at or after `since` (an ISO timestamp), newest first: the
// newsletter block's choices. Typed-in letters count from when they were typed in.
export async function loadPostedSince(seasonId: string, since: string): Promise<StaffLetter[]> {
  return rows<StaffLetter[]>(
    supabase
      .from("letters")
      .select(STAFF_COLUMNS.replace("letter_private(", "letter_private!inner("))
      .eq("season_id", seasonId)
      .eq("status", "approved")
      .gte("letter_private.moderated_at", since)
      .order("created_at", { ascending: false }),
  );
}

// After a letter goes up: the letter-posted function emails the family, once, a link to it. It
// throws if the send failed; it reports not sent, with the reason, when there was nothing to send (no
// email, already told, or email is off). A failure never undoes the post.
export async function notifyPosted(letterId: string): Promise<{ sent: boolean; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("letter-posted", { body: { letter_id: letterId } });
  if (error) throw new Error(error.message);
  return data as { sent: boolean; reason?: string };
}

// Taking a letter down also takes its photo off (a posted photo's address has been public), and the
// database queues the photo's files for deletion. `from` is the status this page showed: if another
// editor has changed the letter since, the database refuses.
export async function moderate(
  letterId: string,
  from: LetterStatus,
  decision: "approved" | "rejected",
  reason: string | null,
) {
  await rows<null>(
    supabase.rpc("moderate_letter", { p_letter_id: letterId, p_from: from, p_decision: decision, p_reason: reason }),
  );
  await deleteQueuedPhotos();
}

// Declines several waiting letters at once (a flood of junk), each still waiting as this page showed it.
export async function declineLetters(letterIds: string[], reason: string): Promise<number> {
  const declined = await rows<number>(supabase.rpc("decline_letters", { p_letter_ids: letterIds, p_reason: reason }));
  await deleteQueuedPhotos();
  return declined;
}

export interface LetterWords {
  first_name: string;
  age: string;
  town: string;
  body: string;
}

// `editedAt` is the last edit this page saw: a save from older words is refused, so it can't put back
// what another editor took out.
export async function editLetter(letterId: string, editedAt: string | null, words: LetterWords) {
  await rows<null>(
    supabase.rpc("edit_letter", {
      p_letter_id: letterId,
      p_edited_at: editedAt,
      p_first_name: words.first_name,
      p_age: Number(words.age),
      p_town: words.town,
      p_body: words.body,
    }),
  );
}

// The letter loses its photo first, so a failure to delete the files never leaves a letter showing a
// missing picture.
export async function removePhoto(letterId: string) {
  await rows<null>(supabase.rpc("remove_letter_photo", { p_letter_id: letterId }));
  await deleteQueuedPhotos();
}

// Deletes the files of every photo the database has queued (photo_deletions: taken off a letter, files
// still in storage), clearing each once its files are gone. It runs after every action that takes a
// photo off, and when the review page opens, so a delete cut short (the tab closed, the connection
// dropped) finishes on the next visit. A queued photo is still public at its address, so a failure is
// shown, with what staff need to finish it by hand.
export async function deleteQueuedPhotos(): Promise<void> {
  const queued = await rows<{ photo_id: string }[]>(supabase.from("photo_deletions").select("photo_id"));
  for (const { photo_id: photoId } of queued) {
    const { error } = await supabase.storage.from("letter-photos").remove(photoPaths(photoId));
    if (error) {
      throw new Error(
        `A photo taken off a letter is still in storage (${error.message}). It will be tried again the next time ` +
          `Review letters opens; to finish now, open Storage > letter-photos in Supabase and delete the folder ${photoId}.`,
      );
    }
    await rows<null>(supabase.from("photo_deletions").delete().eq("photo_id", photoId));
  }
}

export async function setPrizeEligible(letterId: string, eligible: boolean) {
  await rows<null>(supabase.rpc("set_prize_eligible", { p_letter_id: letterId, p_eligible: eligible }));
}

// An hour, not a year: a photo taken down must stop showing soon. Supabase Pro's Smart CDN drops it within
// a minute, but a browser that already loaded it keeps it for as long as this says. Same as the submit-letter function.
const PHOTO_CACHE_SECONDS = "3600";

// Claude's reading of a mailed letter's photo (transcribe-letter; supabase/functions/_shared/transcription.ts
// has the same shape and the rules it passed). Words to check against the photo, never saved as they are.
export interface Reading {
  first_name: string | null;
  age: number | null;
  town: string | null;
  letter: string;
  privacy: { what: string; text: string }[];
  photo_concerns: string[];
  return_address: string | null;
  legibility: "clear" | "some guesses" | "hard to read";
  notes: string;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("The photo couldn't be read. Choose it again."));
    reader.readAsDataURL(blob);
  });
}

// Sends the photo's full-size JPEG (already upright, 1600px, no metadata) to be read. The function's own
// message ("isn't switched on", "Claude is busy") is shown as it is.
export async function transcribeLetter(photo: Blob): Promise<Reading> {
  const { data, error } = await supabase.functions.invoke("transcribe-letter", { body: { photo: await base64(photo) } });
  if (error) {
    const answer = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(answer?.error ?? "Claude couldn’t read this one. Type it in, or try again.");
  }
  return (data as { reading: Reading }).reading;
}

export interface TypedLetter extends LetterWords {
  source: Exclude<LetterSource, "form">;
  parent_name: string;
  email: string;
  mail_contact: string;
}

// A letter that came by email or mail, typed in by staff, with a photo of it if they have one. The
// photo goes up first; if the letter is then refused, its files come back down.
export async function addLetter(letter: TypedLetter, photo: PreparedPhoto | null): Promise<string> {
  const photoId = photo ? crypto.randomUUID() : null;
  const bucket = supabase.storage.from("letter-photos");
  const paths = photoId ? photoPaths(photoId) : [];
  try {
    if (photo) {
      for (const [path, blob] of [
        [paths[0], photo.full],
        [paths[1], photo.thumb],
      ] as const) {
        const { error } = await bucket.upload(path, blob, { contentType: "image/jpeg", cacheControl: PHOTO_CACHE_SECONDS });
        if (error) throw new Error(`The photo didn't upload: ${error.message}`);
      }
    }
    return await rows<string>(
      supabase.rpc("add_letter", {
        p_source: letter.source,
        p_first_name: letter.first_name,
        p_age: Number(letter.age),
        p_town: letter.town,
        p_body: letter.body,
        p_photo_id: photoId,
        p_parent_name: letter.parent_name,
        p_email: letter.email,
        p_mail_contact: letter.mail_contact,
      }),
    );
  } catch (err) {
    if (paths.length > 0) {
      const { error } = await bucket.remove(paths);
      if (error) console.warn("A refused letter's photo stayed in storage:", paths, error);
    }
    throw err;
  }
}

export async function loadDraws(seasonId: string): Promise<Draw[]> {
  return rows<Draw[]>(
    supabase
      .from("prize_draws")
      .select("id, prize_id, letter_id, drawn_at, forfeited_at")
      .eq("season_id", seasonId)
      .order("drawn_at", { ascending: true }),
  );
}

export async function runDrawing(seasonId: string) {
  await rows<null>(supabase.rpc("run_prize_drawing", { p_season_id: seasonId }));
}

// Names the draw being given up, so a page that's out of date can't forfeit a winner it hasn't shown.
export async function redrawPrize(drawId: string) {
  await rows<null>(supabase.rpc("redraw_prize", { p_draw_id: drawId }));
}

// The section saved for a morning's newsletter, if any.
export async function loadNewsletterSection(seasonId: string, editionDate: string): Promise<SavedNewsletterSection | null> {
  return rows<SavedNewsletterSection | null>(
    supabase
      .from("newsletter_sections")
      .select("edition_date, rows_html, letter_ids, posted_since, saved_at")
      .eq("season_id", seasonId)
      .eq("edition_date", editionDate)
      .maybeSingle(),
  );
}

// Saves a morning's section for the newsletter build to pull in; null rows take it out.
export async function saveNewsletterSection(
  editionDate: string,
  rowsHtml: string | null,
  letterIds: string[],
  postedSince: string,
): Promise<void> {
  await rows<null>(
    supabase.rpc("save_newsletter_section", {
      p_edition_date: editionDate,
      p_rows_html: rowsHtml,
      p_letter_ids: letterIds,
      p_posted_since: postedSince,
    }),
  );
}
