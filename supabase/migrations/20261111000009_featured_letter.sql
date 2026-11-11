-- Letters to Santa — the editor's pick: one letter set large at the top of the mailbag.
--
-- An editor picks a posted letter on the staff page (Review letters > In the mailbag); picking another
-- replaces it, so there is one per season, changed as often as the editors like. Readers see which letter
-- it is and never who picked it. It lasts only while the letter is up: a letter that's taken down stops
-- being the pick, and stays that way if it's posted again.
--
-- The first migration after launch (CLAUDE.md, invariant 23): it only adds. The mailbag page asks for the
-- pick in a request of its own and shows the mailbag without one if that fails, so the page works whether
-- it or this migration reaches production first.

create table public.featured_letters (
  season_id uuid primary key references public.seasons (id) on delete cascade,
  letter_id uuid not null references public.letters (id) on delete cascade,
  featured_by uuid references auth.users (id) on delete set null,
  featured_at timestamptz not null default now()
);

alter table public.featured_letters enable row level security;
-- As with a prize's draw: readers get the letter, not the staff member.
grant select (season_id, letter_id, featured_at) on public.featured_letters to anon;
grant select on public.featured_letters to authenticated;
create policy "Editor's pick: while the letter is in the mailbag" on public.featured_letters
  for select to anon
  using (exists (select 1 from public.letters l where l.id = featured_letters.letter_id and l.status = 'approved'));
create policy "Editor's pick: staff, or as readers see it" on public.featured_letters
  for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.letters l where l.id = featured_letters.letter_id and l.status = 'approved')
  );

-- Makes a posted letter the pick, in place of any other.
create function public.feature_letter(p_letter_id uuid) returns void
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

  select l.season_id into v_season_id
  from public.letters l join public.seasons s on s.id = l.season_id
  where l.id = p_letter_id and l.status = 'approved' and s.is_active;
  if not found then
    raise exception 'Only a letter in this year''s mailbag can be the editor''s pick.';
  end if;

  insert into public.featured_letters (season_id, letter_id, featured_by)
  values (v_season_id, p_letter_id, auth.uid())
  on conflict (season_id) do update
  set letter_id = excluded.letter_id, featured_by = excluded.featured_by, featured_at = now();
end;
$$;

-- Stops featuring that letter. A page that's out of date can't undo a newer pick: if another letter has
-- been picked since, nothing changes. Returns whether it was the pick.
create function public.unfeature_letter(p_letter_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  delete from public.featured_letters where letter_id = p_letter_id;
  return found;
end;
$$;

revoke all on function public.feature_letter(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unfeature_letter(uuid) from public, anon, authenticated, service_role;
grant execute on function public.feature_letter(uuid) to authenticated;
grant execute on function public.unfeature_letter(uuid) to authenticated;

-- A letter that leaves the mailbag (taken down, or declined) stops being the pick, and isn't the pick
-- again if it's posted later: an editor picks it again.
create function public.unfeature_unposted_letter() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.featured_letters where letter_id = new.id;
  return null;
end;
$$;

revoke all on function public.unfeature_unposted_letter() from public, anon, authenticated, service_role;

create trigger featured_letter_follows_status
  after update of status on public.letters
  for each row
  when (new.status <> 'approved')
  execute function public.unfeature_unposted_letter();
