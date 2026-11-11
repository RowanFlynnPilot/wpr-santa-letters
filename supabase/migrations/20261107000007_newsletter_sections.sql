-- Letters to Santa — the morning newsletter's section, saved for the newsletter build to pull in.
--
-- The daily newsletters are built by the wpr-newsletter pipeline about an hour before they send, so
-- there's no campaign waiting for staff to paste a section into (the Brag Board learned this on
-- Nov. 6). The staff page saves the letters picked for a morning, as the rows the newsletter's 600px
-- table takes, and the pipeline reads them with this project's publishable key that morning and
-- adds them to the Morning Update.
--
-- Public from its morning, and only while every letter in it is still in the mailbag: a letter taken
-- down after the save withholds the whole section, so a newsletter never shows a letter the mailbag
-- no longer does.

create table public.newsletter_sections (
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- The morning the Morning Update carries it.
  edition_date date not null,
  -- The section's rows, as newsletter.ts renders them; under the newsletter tool's ~13 KB block limit.
  rows_html text not null check (length(rows_html) between 1 and 13000),
  -- Every letter the section shows, for the check above.
  letter_ids uuid[] not null check (cardinality(letter_ids) between 1 and 3),
  -- The day the staff page listed letters from (6 a.m.), so it reopens on the same list.
  posted_since date not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (season_id, edition_date)
);

alter table public.newsletter_sections enable row level security;
grant select on public.newsletter_sections to anon, authenticated;
create policy "Newsletter section: from its morning while its letters are up" on public.newsletter_sections
  for select to anon
  using (
    edition_date <= (now() at time zone 'America/Chicago')::date
    and not exists (
      select 1 from unnest(letter_ids) as shown(id)
      where not exists (select 1 from public.letters l where l.id = shown.id and l.status = 'approved')
    )
  );
create policy "Newsletter section: staff, or as readers see it" on public.newsletter_sections
  for select to authenticated
  using (
    public.is_staff() or (
      edition_date <= (now() at time zone 'America/Chicago')::date
      and not exists (
        select 1 from unnest(letter_ids) as shown(id)
        where not exists (select 1 from public.letters l where l.id = shown.id and l.status = 'approved')
      )
    )
  );

-- Saves (or replaces) a morning's section; with no rows, takes it out of that morning's newsletter.
create function public.save_newsletter_section(p_edition_date date, p_rows_html text, p_letter_ids uuid[], p_posted_since date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no Letters to Santa season right now.';
  end if;

  if nullif(trim(coalesce(p_rows_html, '')), '') is null then
    delete from public.newsletter_sections where season_id = v_season.id and edition_date = p_edition_date;
    return;
  end if;

  if p_edition_date is null
    or p_edition_date < (v_season.entries_open_at at time zone 'America/Chicago')::date
    or p_edition_date > (v_season.delivered_at at time zone 'America/Chicago')::date then
    raise exception 'The Letters to Santa section is saved for a morning during the season.';
  end if;

  -- The Morning Update is built at 6:58 a.m. (wpr-newsletter's scheduler), so a save after 6:45 that
  -- morning would never go out.
  if now() >= (p_edition_date + time '06:45') at time zone 'America/Chicago' then
    raise exception 'It''s too late for that morning''s newsletter (it''s built just before 7 a.m.). Save it for a later morning.';
  end if;

  if length(p_rows_html) > 13000 then
    raise exception 'The section is too long for the newsletter. Uncheck a letter.';
  end if;

  if coalesce(cardinality(p_letter_ids), 0) = 0 or cardinality(p_letter_ids) > 3 then
    raise exception 'Pick one to three letters.';
  end if;

  if exists (
    select 1 from unnest(p_letter_ids) as picked(id)
    where not exists (
      select 1 from public.letters l where l.id = picked.id and l.season_id = v_season.id and l.status = 'approved'
    )
  ) then
    raise exception 'Only letters in the mailbag can go in the newsletter.';
  end if;

  insert into public.newsletter_sections (season_id, edition_date, rows_html, letter_ids, posted_since, saved_by)
  values (v_season.id, p_edition_date, p_rows_html, p_letter_ids, coalesce(p_posted_since, p_edition_date - 1), auth.uid())
  on conflict (season_id, edition_date) do update
  set rows_html = excluded.rows_html, letter_ids = excluded.letter_ids, posted_since = excluded.posted_since,
      saved_by = excluded.saved_by, saved_at = now();
end;
$$;

revoke all on function public.save_newsletter_section(date, text, uuid[], date) from public, anon, authenticated, service_role;
grant execute on function public.save_newsletter_section(date, text, uuid[], date) to authenticated;

-- A saved section is a copy of its letters' words. When one of them is edited afterward (a last name
-- taken out at a parent's request), every section holding it that hasn't gone out yet is withdrawn,
-- so a newsletter never carries words the mailbag no longer shows. Staff save that morning again.
create function public.withdraw_edited_newsletter_sections() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.newsletter_sections
  where new.id = any (letter_ids) and edition_date >= (now() at time zone 'America/Chicago')::date;
  return null;
end;
$$;

revoke all on function public.withdraw_edited_newsletter_sections() from public, anon, authenticated, service_role;

create trigger newsletter_sections_follow_edits
  after update of first_name, age, town, body on public.letters
  for each row
  when ((old.first_name, old.age, old.town, old.body) is distinct from (new.first_name, new.age, new.town, new.body))
  execute function public.withdraw_edited_newsletter_sections();
