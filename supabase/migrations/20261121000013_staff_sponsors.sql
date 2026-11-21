-- Letters to Santa — sponsors and prizes from the staff page.
--
-- Until now a sponsor, its logo and its prizes were rows typed into the SQL editor and a file uploaded in
-- the dashboard. With four presenting sponsors, supporting sponsors and prize donors signing on in the
-- week before letters open, that is a lot of SQL for whoever is at the desk. The staff page gets a
-- Sponsors and prizes tool, and these are what it calls. As everywhere else, nobody writes the tables
-- directly: each function checks the caller is staff and says what's wrong in plain words (P0001), which
-- the page shows as they are.
--
-- The limits are the tables' own, said here before the table can refuse in its own terms: a name of 1 to
-- 80 characters, a full https address, a prize of 1 to 120 characters that follows "wins". Four presenting
-- sponsors at most is still the trigger's rule (migration 0011), and its message is already plain.

-- Adds a sponsor to this year's list (no id), or changes one already on it. Returns its id.
create function public.save_sponsor(
  p_sponsor_id uuid,
  p_name text,
  p_tier public.sponsor_tier,
  p_website_url text,
  p_logo_path text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_url text := nullif(btrim(coalesce(p_website_url, '')), '');
  v_logo text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select id into v_season_id from public.seasons where is_active;
  if not found then
    raise exception 'There is no season to add a sponsor to.';
  end if;

  if length(v_name) not between 1 and 80 then
    raise exception 'A sponsor''s name is 1 to 80 characters.';
  end if;
  if p_tier is null then
    raise exception 'Choose the sponsor''s level.';
  end if;
  if v_url is not null and v_url !~ '^https://[^\s/?#@]+\.[^\s/?#@]+([/?#]\S*)?$' then
    raise exception 'The web address has to be a full one that starts with https://, like https://example.com.';
  end if;
  if v_logo is not null and (v_logo ~ '[[:cntrl:]]' or length(v_logo) > 200) then
    raise exception 'That logo file''s name can''t be used.';
  end if;
  -- Two rows for one business (a button pressed twice, or two people at the desk) would put it on the
  -- page twice.
  if exists (
    select 1 from public.sponsors
    where season_id = v_season_id and lower(name) = lower(v_name) and id is distinct from p_sponsor_id
  ) then
    raise exception '% is already on this year''s list.', v_name;
  end if;

  if p_sponsor_id is null then
    insert into public.sponsors (season_id, name, tier, website_url, logo_path)
    values (v_season_id, v_name, p_tier, v_url, v_logo)
    returning id into v_id;
  else
    update public.sponsors
    set name = v_name, tier = p_tier, website_url = v_url, logo_path = v_logo
    where id = p_sponsor_id and season_id = v_season_id
    returning id into v_id;
    if not found then
      raise exception 'That sponsor isn''t on this year''s list any more.';
    end if;
  end if;
  return v_id;
end;
$$;

-- Takes a sponsor off this year's list, once its prizes are off. Returns its logo's file name, if it had
-- one, so the page can delete the file.
create function public.remove_sponsor(p_sponsor_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logo text;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select sp.logo_path into v_logo
  from public.sponsors sp join public.seasons s on s.id = sp.season_id
  where sp.id = p_sponsor_id and s.is_active
  for update of sp;
  if not found then
    raise exception 'That sponsor isn''t on this year''s list any more.';
  end if;
  if exists (select 1 from public.prizes where sponsor_id = p_sponsor_id) then
    raise exception 'Take this sponsor''s prizes off first.';
  end if;

  delete from public.sponsors where id = p_sponsor_id;
  return v_logo;
end;
$$;

-- Adds a prize from a sponsor to the drawing: one row for each one to win, so three gift cards are three.
-- Under the season's lock, like everything else that changes what the drawing gives out. A prize added
-- after the drawing has run is drawn on its own (run_prize_drawing). Returns how many were added.
create function public.add_prizes(p_sponsor_id uuid, p_description text, p_count integer) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_description text := btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select sp.season_id into v_season_id
  from public.sponsors sp join public.seasons s on s.id = sp.season_id
  where sp.id = p_sponsor_id and s.is_active;
  if not found then
    raise exception 'That sponsor isn''t on this year''s list any more.';
  end if;

  if length(v_description) not between 1 and 120 then
    raise exception 'Say what the prize is, in 120 characters or fewer.';
  end if;
  if v_description ~ '^(A|An|The)\s' then
    raise exception 'Start the prize in lowercase, so it reads after "wins": "a family pizza night", not "A family pizza night".';
  end if;
  if p_count is null or p_count not between 1 and 20 then
    raise exception 'Add 1 to 20 of a prize at a time.';
  end if;

  perform public.lock_season(v_season_id);
  insert into public.prizes (season_id, sponsor_id, description)
  select v_season_id, p_sponsor_id, v_description from generate_series(1, p_count);
  return p_count;
end;
$$;

-- Takes one prize out of the drawing. A prize that has been drawn stays, given up or not: a family was
-- told it won it.
create function public.remove_prize(p_prize_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select p.season_id into v_season_id
  from public.prizes p join public.seasons s on s.id = p.season_id
  where p.id = p_prize_id and s.is_active;
  if not found then
    raise exception 'That prize is already off the list.';
  end if;

  perform public.lock_season(v_season_id);
  if exists (select 1 from public.prize_draws where prize_id = p_prize_id) then
    raise exception 'That prize has been drawn, so it stays on the list.';
  end if;
  delete from public.prizes where id = p_prize_id;
end;
$$;

revoke all on function public.save_sponsor(uuid, text, public.sponsor_tier, text, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_sponsor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_prizes(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.remove_prize(uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_sponsor(uuid, text, public.sponsor_tier, text, text) to authenticated;
grant execute on function public.remove_sponsor(uuid) to authenticated;
grant execute on function public.add_prizes(uuid, text, integer) to authenticated;
grant execute on function public.remove_prize(uuid) to authenticated;

-- A sponsor's logo, uploaded from the staff page instead of the dashboard. The bucket (migration 0004)
-- already holds the limits: 1 MB, and PNG, JPEG, WebP or SVG. As with letter photos, the storage API reads
-- an object before it deletes it, hence select.
create policy "Staff upload sponsor logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos' and public.is_staff());
create policy "Staff see sponsor logos" on storage.objects for select to authenticated
  using (bucket_id = 'sponsor-logos' and public.is_staff());
create policy "Staff remove sponsor logos" on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos' and public.is_staff());
