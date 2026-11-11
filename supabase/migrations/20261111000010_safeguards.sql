-- Letters to Santa — two safeguards for the season. Additive only (CLAUDE.md, invariant 23).
--
-- 1. A limit by connection. The form's daily limit is per email address, so someone rotating addresses
--    could fill the review queue (the drawing waits for every letter to be decided) and use up the email
--    quota shared with the Buck Board. submit-letter now also counts letters by where they came from.
--    It never stores the network address: only a keyed scramble of it, which can't be turned back into
--    one, and only for two days.
-- 2. A record of the form's trouble. When the spam check can't be reached, a letter can't be saved or a
--    confirmation doesn't send, nothing told anyone. submit-letter now notes each one here, by kind and
--    time only (nothing about the letter or the family), and the editor's morning digest reports them.
--
-- submit-letter carries on if these aren't there yet (a function can deploy before a migration), so the
-- form never depends on them.

-- 1. The limit ------------------------------------------------------------------------------------

create table public.form_senders (
  -- HMAC of the sender's network address (an IPv6 address by its /64), keyed with a project secret.
  sender_key text not null check (length(sender_key) between 16 and 64),
  -- The form's key for one letter: a retry of the same letter is not another letter.
  submission_key uuid not null,
  created_at timestamptz not null default now(),
  primary key (sender_key, submission_key)
);
create index form_senders_created_at on public.form_senders (created_at);

-- No grants and no policies: only allow_sender() reads or writes it.
alter table public.form_senders enable row level security;

-- Whether this sender may send another letter: true, and the letter is counted; or false at 30 in a
-- rolling day. Thirty is far above a family's use (a household, a classroom or a phone carrier's shared
-- address all fit) and far below a flood. Past seasons saw about 25 letters in all.
create function public.allow_sender(p_sender_key text, p_submission_key uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  -- One sender's letters are counted one at a time, so parallel sends can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext('santa-sender:' || p_sender_key));

  -- Nothing here is kept past two days.
  delete from public.form_senders where created_at < now() - interval '2 days';

  if exists (
    select 1 from public.form_senders
    where sender_key = p_sender_key and submission_key = p_submission_key
  ) then
    return true;
  end if;

  select count(*) into v_recent
  from public.form_senders
  where sender_key = p_sender_key and created_at > now() - interval '1 day';
  if v_recent >= 30 then
    return false;
  end if;

  insert into public.form_senders (sender_key, submission_key) values (p_sender_key, p_submission_key);
  return true;
end;
$$;

-- 2. The record of trouble --------------------------------------------------------------------------

create table public.form_problems (
  id bigint generated always as identity primary key,
  -- spam-check: Cloudflare couldn't be reached. save: a letter couldn't be saved. email: a confirmation
  -- didn't send (the letter was saved). limit: a sender reached the daily limit above.
  kind text not null check (kind in ('spam-check', 'save', 'email', 'limit')),
  created_at timestamptz not null default now()
);
create index form_problems_created_at on public.form_problems (created_at);

alter table public.form_problems enable row level security;
-- The morning digest (staff-digest, as service_role) reads them; nobody else does.
grant select on public.form_problems to service_role;

create function public.note_form_problem(p_kind text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A season's worth is plenty.
  delete from public.form_problems where created_at < now() - interval '60 days';
  insert into public.form_problems (kind) values (p_kind);
end;
$$;

revoke all on function public.allow_sender(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.note_form_problem(text) from public, anon, authenticated, service_role;
grant execute on function public.allow_sender(text, uuid) to service_role;
grant execute on function public.note_form_problem(text) to service_role;
