-- Letters to Santa — privileges and row-level security.
--
-- Start from zero and grant exactly what each role needs. Supabase's default privileges differ
-- between projects and CLI versions, so nothing here relies on them. Postgres still lets everyone
-- (PUBLIC) execute a new function unless it's revoked, which a per-schema default can't change: a
-- later migration revokes from public itself, as 0005 does. 04_privileges.test.sql lists every
-- table and function anon and authenticated can use, so a new one with access fails CI.

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;

alter table public.seasons enable row level security;
alter table public.staff enable row level security;
alter table public.sponsors enable row level security;
alter table public.prizes enable row level security;
alter table public.letters enable row level security;
alter table public.letter_private enable row level security;
alter table public.prize_draws enable row level security;
alter table public.photo_deletions enable row level security;

-- Catalog data: public.
grant select on public.seasons, public.sponsors, public.prizes to anon, authenticated;
create policy "Seasons are public" on public.seasons for select to anon, authenticated using (true);
create policy "Sponsors are public" on public.sponsors for select to anon, authenticated using (true);
create policy "Prizes are public" on public.prizes for select to anon, authenticated using (true);

-- Letters: those in the mailbag are public; staff see every one. No direct writes — RPCs only.
grant select on public.letters to anon, authenticated;
create policy "Letters in the mailbag are public" on public.letters for select to anon
  using (status = 'approved');
create policy "Staff see every letter" on public.letters for select to authenticated
  using (status = 'approved' or public.is_staff());

grant select on public.letter_private to authenticated;
create policy "Staff read family details" on public.letter_private for select to authenticated
  using (public.is_staff());

-- Winners stay hidden until the letters are delivered, except to staff, and only current winners
-- are ever public. Readers get the columns that name a winner, not who ran the drawing or when.
grant select (prize_id, season_id, letter_id, forfeited_at) on public.prize_draws to anon;
grant select on public.prize_draws to authenticated;
create policy "Winners are public once delivered" on public.prize_draws for select to anon
  using (forfeited_at is null and exists (
    select 1 from public.seasons s where s.id = prize_draws.season_id and public.phase_at(s, now()) = 'delivered'
  ));
create policy "Winners: delivered, or staff" on public.prize_draws for select to authenticated
  using (public.is_staff() or (forfeited_at is null and exists (
    select 1 from public.seasons s where s.id = prize_draws.season_id and public.phase_at(s, now()) = 'delivered'
  )));

-- Photos waiting for their files to be deleted: staff read the queue and clear what they've deleted.
grant select, delete on public.photo_deletions to authenticated;
create policy "Photo deletions: staff" on public.photo_deletions for select to authenticated using (public.is_staff());
create policy "Photo deletions: staff clear" on public.photo_deletions for delete to authenticated using (public.is_staff());

-- `staff` has RLS on and no grants here: membership is managed in the SQL editor. (0005 lets the
-- letter-posted function, as service_role, check its caller is staff.)

-- Views run as the caller (security_invoker), so the table policies above apply.
grant select on public.current_season, public.mailbag, public.prize_winners to anon, authenticated;

-- The submit-letter function reads these (as service_role) to write its emails.
grant select on public.letters, public.letter_private, public.seasons, public.sponsors, public.prizes to service_role;

-- Pure helpers used by views and policies.
grant execute on function public.phase_at(public.seasons, timestamptz) to anon, authenticated;
grant execute on function public.is_staff() to authenticated;

-- RPCs. Each staff one checks is_staff() itself.
grant execute on function public.submit_letter(text, smallint, text, text, uuid, text, text, boolean, boolean, uuid) to service_role;
grant execute on function public.add_letter(public.letter_source, text, smallint, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.moderate_letter(uuid, public.letter_status, public.letter_status, text) to authenticated;
grant execute on function public.edit_letter(uuid, timestamptz, text, smallint, text, text) to authenticated;
grant execute on function public.remove_letter_photo(uuid) to authenticated;
grant execute on function public.decline_letters(uuid[], text) to authenticated;
grant execute on function public.set_prize_eligible(uuid, boolean) to authenticated;
grant execute on function public.run_prize_drawing(uuid) to authenticated;
grant execute on function public.redraw_prize(uuid) to authenticated;

-- tidy, one_line, letter_words, family_key, lock_season, keep_household, drawing_pool and draw_letter
-- are internal: no grants.
