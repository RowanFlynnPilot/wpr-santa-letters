-- Letters to Santa — functions and views.
--
-- Every security-definer function pins search_path to '' and fully qualifies names. Execute
-- privileges are set explicitly in the RLS migration; nothing relies on defaults. Rules raise
-- plain-English messages (P0001) the form and the staff page show as they are.

-- Phase is a pure function of the season calendar and a point in time.
create function public.phase_at(s public.seasons, p_at timestamptz) returns public.season_phase
language sql
immutable
set search_path = ''
as $$
  select case
    when p_at < s.entries_open_at then 'upcoming'
    when p_at < s.entries_close_at then 'open'
    when p_at < s.delivered_at then 'closed'
    else 'delivered'
  end::public.season_phase
$$;

create function public.is_staff() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()))
$$;

create view public.current_season with (security_invoker = true) as
select s.*, public.phase_at(s, now()) as phase
from public.seasons s
where s.is_active;

-- The letters readers see. Only published columns exist on `letters`, so this is a filter, not a mask.
create view public.mailbag with (security_invoker = true) as
select l.id, l.season_id, l.first_name, l.age, l.town, l.body, l.photo_id, l.created_at
from public.letters l
where l.status = 'approved';

-- Current winners (not forfeited). RLS on prize_draws keeps them from readers until delivery day.
create view public.prize_winners with (security_invoker = true) as
select d.prize_id, d.season_id, d.letter_id
from public.prize_draws d
where d.forfeited_at is null;

-- Leading and trailing whitespace, newlines included (Postgres's trim() takes only spaces).
create function public.tidy(p text) returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(p, '^\s+|\s+$', '', 'g'), '')
$$;

-- One line: any run of whitespace, line breaks included, becomes one space (a name, a town), so a
-- last name can't ride along on a second line. Any other control character (an invisible one pasted
-- in, an apostrophe mangled on the way) is dropped: none can be published.
create function public.one_line(p text) returns text
language sql
immutable
set search_path = ''
as $$
  select public.tidy(regexp_replace(regexp_replace(p, '\s+', ' ', 'g'), '[[:cntrl:]]', '', 'g'))
$$;

-- The published words of a letter, cleaned and checked. The form, the staff "Add a letter" screen
-- and staff edits all go through here, so the three can't drift apart.
create function public.letter_words(
  p_first_name text,
  p_age smallint,
  p_town text,
  p_body text,
  out first_name text,
  out age smallint,
  out town text,
  out body text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  first_name := public.one_line(p_first_name);
  age := p_age;
  town := public.one_line(p_town);
  -- Browsers send a textarea's line breaks as CRLF; store LF, as the form counted them.
  body := public.tidy(regexp_replace(p_body, E'\r\n?', E'\n', 'g'));

  if coalesce(length(first_name), 0) not between 1 and 30 then
    raise exception 'The child''s first name must be 1 to 30 characters.';
  end if;
  if age is null or age not between 0 and 17 then
    raise exception 'Choose the child''s age, from under 1 to 17.';
  end if;
  if length(town) > 40 then
    raise exception 'The town can be at most 40 characters.';
  end if;
  if body is null then
    raise exception 'The letter is empty.';
  end if;
  if length(body) > 2000 then
    raise exception 'The letter can be at most 2,000 characters.';
  end if;
end;
$$;

-- How the drawing tells families apart: the parent's email without any +tag, or for a mailed letter
-- without one, the return address in lowercase letters and digits only, so "12 Elm St., Wausau" and
-- "12 elm st wausau" are one family. One prize per family.
create function public.family_key(p public.letter_private) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p.email is not null then regexp_replace(p.email, '\+[^@]*@', '@')
    else nullif(regexp_replace(lower(p.mail_contact), '[^a-z0-9]', '', 'g'), '')
  end
$$;

-- Everything that decides who can win takes the season's lock first, so the drawing, a redraw, a
-- take-down, an eligibility change and a new letter never interleave. Held to the end of the transaction.
create function public.lock_season(p_season_id uuid) returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('wpr-santa-letters:' || p_season_id::text, 0))
$$;

-- A staff household is a family, so a letter that arrives after the family was marked can't win
-- either: a new letter takes the mark its family's letters already carry. Called with the season's
-- lock held, so it can't cross a change to the family's mark.
create function public.keep_household(p_letter_id uuid) returns void
language sql
volatile
set search_path = ''
as $$
  update public.letter_private n
  set prize_eligible = false
  from public.letters l
  where n.letter_id = p_letter_id and l.id = p_letter_id
    and exists (
      select 1
      from public.letter_private p
      join public.letters o on o.id = p.letter_id
      where o.season_id = l.season_id and p.letter_id <> p_letter_id and not p.prize_eligible
        and public.family_key(p) = public.family_key(n)
    )
$$;

-- Called only by the submit-letter edge function (service role), after any photo is stored. Returns
-- the letter's id, and whether this was a repeat: a retry carrying the key of a letter already saved
-- (the first try's reply was lost) gets that letter back, nothing new saved, so the function can
-- delete the retry's copy of the photo.
create function public.submit_letter(
  p_first_name text,
  p_age smallint,
  p_town text,
  p_body text,
  p_photo_id uuid,
  p_parent_name text,
  p_email text,
  p_consent boolean,
  p_newsletter_opt_in boolean,
  p_submission_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_words record;
  v_parent text := public.one_line(p_parent_name);
  v_email text := lower(public.tidy(p_email));
  v_letter_id uuid;
begin
  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no Letters to Santa season right now.';
  end if;

  if public.phase_at(v_season, now()) <> 'open' then
    raise exception 'Santa''s mailbag isn''t taking letters right now.';
  end if;

  select * into v_words from public.letter_words(p_first_name, p_age, p_town, p_body);

  if coalesce(length(v_parent), 0) not between 1 and 100 then
    raise exception 'Your name must be 1 to 100 characters.';
  end if;

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address so we can reach you if your child wins a prize.';
  end if;

  if p_consent is distinct from true then
    raise exception 'A parent or guardian needs to give permission to publish the letter.';
  end if;

  if p_submission_key is null then
    raise exception 'The letter came without its key. Reload the page and send it again.';
  end if;

  perform public.lock_season(v_season.id);

  -- Under the lock, so a retry that arrives while the first try is still saving waits and finds it.
  select letter_id into v_letter_id from public.letter_private where submission_key = p_submission_key;
  if found then
    return jsonb_build_object('id', v_letter_id, 'repeat', true);
  end if;

  -- Turnstile stops most bots; this caps what one email address can send, +tags counted together
  -- (each letter sends two emails, and a third when it's posted). It isn't a cap on the day's total:
  -- someone rotating addresses gets past it. The season's lock makes the count and the insert one step.
  if (
    select count(*)
    from public.letter_private p
    join public.letters l on l.id = p.letter_id
    where regexp_replace(p.email, '\+[^@]*@', '@') = regexp_replace(v_email, '\+[^@]*@', '@')
      and l.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'That''s 10 letters from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.';
  end if;

  insert into public.letters (season_id, first_name, age, town, body, photo_id)
  values (v_season.id, v_words.first_name, v_words.age, v_words.town, v_words.body, p_photo_id)
  returning id into v_letter_id;

  insert into public.letter_private (letter_id, source, parent_name, email, consent_at, newsletter_opt_in, submission_key)
  values (v_letter_id, 'form', v_parent, v_email, now(), coalesce(p_newsletter_opt_in, false), p_submission_key);
  perform public.keep_household(v_letter_id);

  return jsonb_build_object('id', v_letter_id, 'repeat', false);
end;
$$;

-- Staff type in a letter that came by email or mail. A staff member is the reviewer, so it goes up
-- at once. Contact details are optional for a mailed letter; without any, it can't win a prize.
create function public.add_letter(
  p_source public.letter_source,
  p_first_name text,
  p_age smallint,
  p_town text,
  p_body text,
  p_photo_id uuid,
  p_parent_name text,
  p_email text,
  p_mail_contact text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_words record;
  v_parent text := public.one_line(p_parent_name);
  v_email text := lower(public.tidy(p_email));
  v_contact text := public.tidy(p_mail_contact);
  v_letter_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_source is distinct from 'email' and p_source is distinct from 'mail' then
    raise exception 'Staff add letters that came by email or mail; the form sends its own.';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no Letters to Santa season right now.';
  end if;

  if public.phase_at(v_season, now()) = 'delivered' then
    raise exception 'The % letters have gone to the North Pole. The mailbag is closed for the year.', v_season.year;
  end if;

  perform public.lock_season(v_season.id);
  if exists (select 1 from public.prize_draws where season_id = v_season.id) then
    raise exception 'The prize drawing has already run, so a letter added now would miss it.';
  end if;

  select * into v_words from public.letter_words(p_first_name, p_age, p_town, p_body);

  if length(v_parent) > 100 then
    raise exception 'The parent''s name can be at most 100 characters.';
  end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.';
  end if;

  if p_source = 'email' and v_email is null then
    raise exception 'An emailed letter needs the address it came from, so we can reach the family about a prize.';
  end if;

  if length(v_contact) > 300 then
    raise exception 'The return address can be at most 300 characters.';
  end if;

  if p_photo_id is not null and (
    select count(*) from storage.objects
    where bucket_id = 'letter-photos' and name in (p_photo_id || '/full.jpg', p_photo_id || '/thumb.jpg')
  ) <> 2 then
    raise exception 'The letter''s photo hasn''t finished uploading. Try again.';
  end if;

  insert into public.letters (season_id, status, first_name, age, town, body, photo_id)
  values (v_season.id, 'approved', v_words.first_name, v_words.age, v_words.town, v_words.body, p_photo_id)
  returning id into v_letter_id;

  insert into public.letter_private (
    letter_id, source, parent_name, email, mail_contact, added_by, moderated_by, moderated_at
  ) values (
    v_letter_id, p_source, v_parent, v_email, v_contact, auth.uid(), auth.uid(), now()
  );
  perform public.keep_household(v_letter_id);

  return v_letter_id;
end;
$$;

-- Post a letter, or take it down (decline it). A letter that comes down loses its photo, since a
-- posted letter's photo address has been public; the photo goes to photo_deletions, whose files the
-- staff page deletes.
-- p_from is the status the staff page showed: if another editor has changed the letter since, the
-- decision is refused, so a page that's out of date can't post a letter someone just declined.
create function public.moderate_letter(
  p_letter_id uuid,
  p_from public.letter_status,
  p_decision public.letter_status,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.tidy(p_reason);
  v_season_id uuid;
  v_letter public.letters;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision = 'pending' then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if (p_decision = 'rejected') <> (v_reason is not null) then
    raise exception 'A reason is required when taking a letter down, and only then.';
  end if;

  select season_id into v_season_id from public.letters where id = p_letter_id;
  if not found then
    raise exception 'Letter % does not exist.', p_letter_id;
  end if;
  perform public.lock_season(v_season_id);

  select * into v_letter from public.letters where id = p_letter_id for update;
  if v_letter.status is distinct from p_from then
    raise exception 'Someone changed this letter since your page loaded. Reload to see it now.';
  end if;

  -- A winner stays in the mailbag: redraw the prize before taking the letter down.
  if p_decision = 'rejected'
    and exists (select 1 from public.prize_draws where letter_id = p_letter_id and forfeited_at is null) then
    raise exception 'This letter won a prize. To take it down, redraw the prize first (Prize drawing); the family gives it up for good.';
  end if;

  -- Like a new letter, one posted after the drawing would have missed it.
  if p_decision = 'approved' and exists (select 1 from public.prize_draws where season_id = v_season_id) then
    raise exception 'The prize drawing has run, so this letter can''t go in the mailbag now: it would miss the drawing.';
  end if;

  update public.letters
  set status = p_decision, photo_id = case when p_decision = 'rejected' then null else photo_id end
  where id = p_letter_id;

  update public.letter_private
  set moderated_by = auth.uid(), moderated_at = now(), rejection_reason = v_reason
  where letter_id = p_letter_id;

  if p_decision = 'rejected' and v_letter.photo_id is not null then
    insert into public.photo_deletions (photo_id) values (v_letter.photo_id) on conflict do nothing;
  end if;
end;
$$;

-- Staff decline many waiting letters at once (a flood of junk past Turnstile), with one reason. Each
-- must still be waiting, as the page showed it; their photos go to photo_deletions. Returns how many.
create function public.decline_letters(p_letter_ids uuid[], p_reason text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.tidy(p_reason);
  v_season_id uuid;
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A reason is required when declining letters.';
  end if;

  if coalesce(cardinality(p_letter_ids), 0) = 0 then
    raise exception 'Choose the letters to decline.';
  end if;

  for v_season_id in select distinct season_id from public.letters where id = any (p_letter_ids) order by 1 loop
    perform public.lock_season(v_season_id);
  end loop;

  perform 1 from public.letters where id = any (p_letter_ids) for update;
  select count(*) into v_count from public.letters where id = any (p_letter_ids) and status = 'pending';
  if v_count <> cardinality(array(select distinct unnest(p_letter_ids))) then
    raise exception 'Some of these letters changed since your page loaded. Reload to see them now.';
  end if;

  insert into public.photo_deletions (photo_id)
  select photo_id from public.letters where id = any (p_letter_ids) and photo_id is not null
  on conflict do nothing;

  update public.letters set status = 'rejected', photo_id = null where id = any (p_letter_ids);
  update public.letter_private
  set moderated_by = auth.uid(), moderated_at = now(), rejection_reason = v_reason
  where letter_id = any (p_letter_ids);

  return v_count;
end;
$$;

-- Staff fix the published words: take out a last name, a street or a school, or fix a typo the
-- parent made. Keep the child's own spelling. p_edited_at is the last edit the staff page saw (null
-- for none): a save from older words is refused, so it can't put back what another editor took out.
create function public.edit_letter(
  p_letter_id uuid,
  p_edited_at timestamptz,
  p_first_name text,
  p_age smallint,
  p_town text,
  p_body text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_words record;
  v_letter public.letters;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_words from public.letter_words(p_first_name, p_age, p_town, p_body);

  select * into v_letter from public.letters where id = p_letter_id for update;
  if not found then
    raise exception 'Letter % does not exist.', p_letter_id;
  end if;
  if (select edited_at from public.letter_private where letter_id = p_letter_id) is distinct from p_edited_at then
    raise exception 'Someone edited this letter since your page loaded. Reload to see their changes, then edit again.';
  end if;

  -- Saving without a change records nothing.
  if (v_letter.first_name, v_letter.age, v_letter.town, v_letter.body)
    is not distinct from (v_words.first_name, v_words.age, v_words.town, v_words.body) then
    return;
  end if;

  update public.letters
  set first_name = v_words.first_name, age = v_words.age, town = v_words.town, body = v_words.body
  where id = p_letter_id;

  update public.letter_private set edited_by = auth.uid(), edited_at = now() where letter_id = p_letter_id;
end;
$$;

-- Take a photo off a letter (it shows a last name, an address or a face) and keep the words. The
-- photo goes to photo_deletions, whose files the staff page deletes.
create function public.remove_letter_photo(p_letter_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select photo_id into v_photo_id from public.letters where id = p_letter_id for update;
  if not found then
    raise exception 'Letter % does not exist.', p_letter_id;
  end if;
  if v_photo_id is null then
    raise exception 'This letter has no photo.';
  end if;

  update public.letters set photo_id = null where id = p_letter_id;
  insert into public.photo_deletions (photo_id) values (v_photo_id) on conflict do nothing;
end;
$$;

-- Staff households' letters go in the mailbag but can't win (the rules). A household is a family:
-- every letter this season with the same email or return address changes with this one.
create function public.set_prize_eligible(p_letter_id uuid, p_eligible boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_family text;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_eligible is null then
    raise exception 'Say whether the letter can win.';
  end if;

  select season_id into v_season_id from public.letters where id = p_letter_id;
  if not found then
    raise exception 'Letter % does not exist.', p_letter_id;
  end if;
  perform public.lock_season(v_season_id);

  if p_eligible and exists (select 1 from public.prize_draws where season_id = v_season_id) then
    raise exception 'The prize drawing has run, so a family can''t be put back in it.';
  end if;

  select public.family_key(p) into v_family from public.letter_private p where p.letter_id = p_letter_id;

  if not p_eligible and exists (
    select 1
    from public.prize_draws d
    join public.letter_private p on p.letter_id = d.letter_id
    where d.season_id = v_season_id and d.forfeited_at is null
      and (d.letter_id = p_letter_id or public.family_key(p) = v_family)
  ) then
    raise exception 'This family has won a prize. Redraw it first.';
  end if;

  update public.letter_private p
  set prize_eligible = p_eligible
  from public.letters l
  where l.id = p.letter_id and l.season_id = v_season_id
    and (p.letter_id = p_letter_id or public.family_key(p) = v_family);
end;
$$;

-- Every letter that can win: in the mailbag, not a staff household's, and with a way to reach the
-- family. One ticket per letter.
create function public.drawing_pool(p_season_id uuid) returns table (letter_id uuid, family text)
language sql
stable
set search_path = ''
as $$
  select l.id, public.family_key(p)
  from public.letters l
  join public.letter_private p on p.letter_id = l.id
  where l.season_id = p_season_id
    and l.status = 'approved'
    and p.prize_eligible
    and public.family_key(p) is not null
$$;

-- One random letter from a family that holds no draw yet this season (won or forfeited), or null.
create function public.draw_letter(p_season_id uuid) returns uuid
language sql
volatile
set search_path = ''
as $$
  select pool.letter_id
  from public.drawing_pool(p_season_id) pool
  where not exists (
    select 1
    from public.prize_draws d
    join public.letter_private p on p.letter_id = d.letter_id
    where d.season_id = p_season_id and public.family_key(p) = pool.family
  )
  order by random()
  limit 1
$$;

-- After letters close and every letter is reviewed: one winner for each prize not yet drawn, one
-- prize per family. Run again, it draws only prizes added since (a sponsor that came in late).
create function public.run_prize_drawing(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_waiting integer;
  v_prizes integer;
  v_families integer;
  v_prize_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where id = p_season_id;
  if not found then
    raise exception 'Season % does not exist.', p_season_id;
  end if;
  perform public.lock_season(p_season_id);

  if public.phase_at(v_season, now()) in ('upcoming', 'open') then
    raise exception 'The drawing runs after letters close.';
  end if;

  -- Only letters in the mailbag get a ticket: decide every letter first.
  select count(*) into v_waiting from public.letters where season_id = p_season_id and status = 'pending';
  if v_waiting > 0 then
    raise exception '% still waiting for review. Post or decline % before the drawing.',
      case when v_waiting = 1 then '1 letter is' else v_waiting || ' letters are' end,
      case when v_waiting = 1 then 'it' else 'them' end;
  end if;

  select count(*) into v_prizes
  from public.prizes z
  where z.season_id = p_season_id and not exists (select 1 from public.prize_draws d where d.prize_id = z.id);
  if v_prizes = 0 then
    if exists (select 1 from public.prize_draws where season_id = p_season_id) then
      raise exception 'Every prize has been drawn.';
    end if;
    raise exception 'There are no prizes to draw yet.';
  end if;

  select count(distinct pool.family) into v_families
  from public.drawing_pool(p_season_id) pool
  where not exists (
    select 1 from public.prize_draws d join public.letter_private p on p.letter_id = d.letter_id
    where d.season_id = p_season_id and public.family_key(p) = pool.family
  );
  if v_families < v_prizes then
    raise exception 'There % % to draw, and only % can win.',
      case when v_prizes = 1 then 'is' else 'are' end,
      case when v_prizes = 1 then '1 prize' else v_prizes || ' prizes' end,
      case when v_families = 1 then '1 family' else v_families || ' families' end;
  end if;

  for v_prize_id in
    select z.id from public.prizes z
    where z.season_id = p_season_id and not exists (select 1 from public.prize_draws d where d.prize_id = z.id)
    order by z.created_at, z.id
  loop
    insert into public.prize_draws (prize_id, season_id, letter_id, drawn_by)
    values (v_prize_id, p_season_id, public.draw_letter(p_season_id), auth.uid());
  end loop;
end;
$$;

-- A family that doesn't claim its prize forfeits it, and the prize goes to a family that holds none
-- yet (never one that forfeited). Named by the draw being given up, so a staff page that's out of
-- date can't forfeit a winner it hasn't seen.
create function public.redraw_prize(p_draw_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.prize_draws;
  v_pick uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_draw from public.prize_draws where id = p_draw_id;
  if not found then
    raise exception 'That draw doesn''t exist.';
  end if;
  perform public.lock_season(v_draw.season_id);

  update public.prize_draws set forfeited_at = now() where id = p_draw_id and forfeited_at is null;
  if not found then
    raise exception 'That prize was already redrawn. Reload the page to see who has it now.';
  end if;

  v_pick := public.draw_letter(v_draw.season_id);
  if v_pick is null then
    raise exception 'Every family that can win already holds a prize or gave one up.';
  end if;

  insert into public.prize_draws (prize_id, season_id, letter_id, drawn_by)
  values (v_draw.prize_id, v_draw.season_id, v_pick, auth.uid());
end;
$$;
