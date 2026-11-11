-- Letters to Santa — schema.
--
-- Children's letters reach us three ways, as in past years: the online form (a parent or guardian
-- fills it in for the child), email to editor@, and the mail. Form letters wait for staff review;
-- staff type in emailed and mailed letters, and those go up at once.
--
-- `letters` holds only what is published: the child's first name, age, town, the letter and an
-- optional photo of it. Everything about the family (who sent it, how to reach them, the review
-- trail) lives in `letter_private`, which only staff can read. Same-season rules are composite
-- foreign keys against unique (id, season_id) pairs, not function checks.

create type public.letter_status as enum ('pending', 'approved', 'rejected');
create type public.letter_source as enum ('form', 'email', 'mail');
create type public.sponsor_tier as enum ('presenting', 'supporting');
create type public.season_phase as enum ('upcoming', 'open', 'closed', 'delivered');

-- One row per Christmas. The calendar drives every phase; nothing is toggled by hand.
--   upcoming  → before the form opens
--   open      → the form takes letters
--   closed    → staff finish typing in the mail, review the last letters and run the drawing
--   delivered → the letters have "gone to the North Pole": the article runs and winners are public
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  year smallint not null unique,
  is_active boolean not null default false,
  entries_open_at timestamptz not null,
  entries_close_at timestamptz not null,
  delivered_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint season_calendar_order check (entries_open_at < entries_close_at and entries_close_at <= delivered_at)
);

create unique index seasons_one_active on public.seasons (is_active) where is_active;

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The presenting sponsor's logo is the stamp on the mailbag's envelope, with "Presented by …" under it;
-- supporting sponsors are thanked at the foot of the mailbag. Prizes are their own rows (below).
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  tier public.sponsor_tier not null,
  -- The logo's object name in the sponsor-logos bucket. Without one, the page sets the name in type.
  logo_path text check (length(logo_path) > 0),
  website_url text check (website_url ~ '^https://[^\s/?#@]+\.[^\s/?#@]+([/?#]\S*)?$'),
  created_at timestamptz not null default now(),
  unique (id, season_id)
);

create unique index sponsors_one_presenting_per_season on public.sponsors (season_id) where tier = 'presenting';

-- One row per prize in the drawing: a sponsor giving three gift cards has three rows.
create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  sponsor_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 120),
  -- It follows "wins" ("Mia wins a family pizza night"), so it starts "a", not "A".
  constraint description_follows_wins check (description !~ '^(A|An|The)\s'),
  created_at timestamptz not null default now(),
  unique (id, season_id),
  foreign key (sponsor_id, season_id) references public.sponsors (id, season_id) on delete restrict
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  status public.letter_status not null default 'pending',
  -- First name only: the mailbag never shows a child's last name.
  first_name text not null check (
    length(first_name) between 1 and 30 and first_name = trim(first_name) and first_name !~ '[[:cntrl:]]'
  ),
  -- In years; 0 is a baby under 1, shown as such.
  age smallint not null check (age between 0 and 17),
  town text check (length(town) between 1 and 40 and town = trim(town) and town !~ '[[:cntrl:]]'),
  body text not null check (length(body) between 1 and 2000 and body = trim(body)),
  -- Optional photo of the handwritten letter or drawing: letter-photos/<photo_id>/full.jpg and /thumb.jpg.
  photo_id uuid unique,
  created_at timestamptz not null default now(),
  unique (id, season_id)
);

create index letters_season_status_created on public.letters (season_id, status, created_at);

-- Staff only: where the letter came from, the family's contact, and the review trail.
create table public.letter_private (
  letter_id uuid primary key references public.letters (id) on delete cascade,
  source public.letter_source not null,
  parent_name text check (
    length(parent_name) between 1 and 100 and parent_name = trim(parent_name) and parent_name !~ '[[:cntrl:]]'
  ),
  email text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- A mailed letter's return address, or however else staff can reach the family about a prize.
  mail_contact text check (length(mail_contact) between 1 and 300 and mail_contact = trim(mail_contact)),
  -- When the parent or guardian gave consent on the form.
  consent_at timestamptz,
  -- The form's key for this letter: a retry after a lost reply sends the same key and gets this letter
  -- back instead of making a second one.
  submission_key uuid unique,
  -- Asked on the form for WPR's newsletter. Export only posted letters' addresses (CLAUDE.md, Operations),
  -- so a declined junk letter never lands on the list.
  newsletter_opt_in boolean not null default false,
  -- Staff households' letters go in the mailbag but can't win (the rules).
  prize_eligible boolean not null default true,
  added_by uuid references auth.users (id) on delete set null,
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text check (length(trim(rejection_reason)) > 0),
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz,
  -- When the family's name, email and return address were cleared, two weeks after delivery (0006).
  forgotten_at timestamptz,
  constraint form_letters_come_from_a_consenting_parent check (
    source <> 'form' or consent_at is not null and (forgotten_at is not null or (parent_name is not null and email is not null))
  ),
  constraint emailed_letters_keep_the_address check (source <> 'email' or forgotten_at is not null or email is not null)
);

create index letter_private_email on public.letter_private (email);

-- The drawing. Each prize has at most one current winner; a winner who doesn't claim the prize is
-- marked forfeited and the prize is drawn again, so the history stays.
-- Photos taken off their letters whose files still have to be deleted from storage. The database
-- can't delete a storage file itself, so the staff page does; the photo is queued here in the same
-- transaction that takes it off its letter, so a page that closed or lost its connection partway
-- leaves a record, and the next staff page to open the review finishes the job.
create table public.photo_deletions (
  photo_id uuid primary key,
  queued_at timestamptz not null default now()
);

create table public.prize_draws (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null,
  season_id uuid not null,
  letter_id uuid not null,
  drawn_by uuid references auth.users (id) on delete set null,
  drawn_at timestamptz not null default now(),
  forfeited_at timestamptz,
  foreign key (prize_id, season_id) references public.prizes (id, season_id) on delete restrict,
  foreign key (letter_id, season_id) references public.letters (id, season_id) on delete restrict
);

create unique index prize_draws_one_current_winner on public.prize_draws (prize_id) where forfeited_at is null;
create index prize_draws_season on public.prize_draws (season_id);
