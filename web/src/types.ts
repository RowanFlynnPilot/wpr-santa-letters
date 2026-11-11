// Rows as the database returns them (supabase/migrations).

export type Phase = "upcoming" | "open" | "closed" | "delivered";
export type LetterStatus = "pending" | "approved" | "rejected";
export type LetterSource = "form" | "email" | "mail";
export type SponsorTier = "presenting" | "supporting";

export interface Season {
  id: string;
  year: number;
  entries_open_at: string;
  entries_close_at: string;
  delivered_at: string;
  phase: Phase;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: SponsorTier;
  logo_path: string | null;
  website_url: string | null;
  // A `?demo` placeholder ("Your business here"), never a real row.
  demo?: boolean;
}

export interface Prize {
  id: string;
  sponsor_id: string;
  description: string;
  created_at: string;
}

// What the mailbag shows of a letter.
export interface Letter {
  id: string;
  first_name: string;
  age: number;
  town: string | null;
  body: string;
  photo_id: string | null;
  created_at: string;
}

export interface Winner {
  prize_id: string;
  letter_id: string;
}

export interface Mailbag {
  season: Season;
  sponsors: Sponsor[];
  prizes: Prize[];
  letters: Letter[];
  // The editor's pick, set large at the top of the mailbag; null when there isn't one.
  featured: string | null;
  // Empty for readers until the letters are delivered.
  winners: Winner[];
}

// Staff only: a letter with the family's details and its review trail.
export interface StaffLetter extends Letter {
  status: LetterStatus;
  letter_private: {
    source: LetterSource;
    parent_name: string | null;
    email: string | null;
    mail_contact: string | null;
    prize_eligible: boolean;
    moderated_at: string | null;
    rejection_reason: string | null;
    edited_at: string | null;
    // When the family was emailed that the letter is up; null if not yet (or it didn't send).
    posted_notice_at: string | null;
    // When the family's name, email and return address were cleared, two weeks after delivery.
    forgotten_at: string | null;
  };
}

// Staff only: every draw, forfeits included.
export interface Draw {
  id: string;
  prize_id: string;
  letter_id: string;
  drawn_at: string;
  forfeited_at: string | null;
}

// A morning's Letters to Santa section, saved for the newsletter build (migration 0007).
export interface SavedNewsletterSection {
  edition_date: string;
  rows_html: string;
  letter_ids: string[];
  posted_since: string;
  saved_at: string;
}
