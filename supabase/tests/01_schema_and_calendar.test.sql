begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Seed ------------------------------------------------------------------------

select ok((select is_active from public.seasons where year = 2026), '2026 season is active');
select is((select count(*)::int from public.current_season), 1, 'current_season shows the one active season');

select throws_ok(
  $$ insert into public.seasons (year, is_active, entries_open_at, entries_close_at, delivered_at)
     values (2027, true, '2027-11-26', '2027-12-18', '2027-12-23') $$,
  '23505', null, 'only one season can be active'
);
select throws_ok(
  $$ insert into public.seasons (year, entries_open_at, entries_close_at, delivered_at)
     values (2027, '2027-11-26', '2027-11-20', '2027-12-23') $$,
  '23514', null, 'letters cannot close before they open'
);
select throws_ok(
  $$ insert into public.seasons (year, entries_open_at, entries_close_at, delivered_at)
     values (2027, '2027-11-26', '2027-12-18', '2027-12-17') $$,
  '23514', null, 'delivery cannot come before letters close'
);

-- Phases (America/Chicago) ----------------------------------------------------

select is(public.phase_at(s, timestamptz '2026-11-26 23:59 America/Chicago'), 'upcoming', 'upcoming on Thanksgiving night')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-11-27 00:00 America/Chicago'), 'open', 'open the day after Thanksgiving')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-18 23:59 America/Chicago'), 'open', 'still open late Dec. 18')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-19 00:00 America/Chicago'), 'closed', 'closed from Dec. 19')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-23 05:59 America/Chicago'), 'closed', 'still closed before dawn Dec. 23')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-23 06:00 America/Chicago'), 'delivered', 'delivered the morning of Dec. 23')
from public.seasons s where year = 2026;

-- Sponsors and prizes ---------------------------------------------------------

insert into public.sponsors (id, season_id, name, tier, website_url)
select v.id::uuid, s.id, v.name, v.tier::public.sponsor_tier, v.url
from public.seasons s
cross join (values
  ('00000000-0000-0000-0000-00000000c001', 'Presenting Co', 'presenting', 'https://presenting.example.com'),
  ('00000000-0000-0000-0000-00000000c002', 'Pizza Co', 'supporting', null)
) as v (id, name, tier, url)
where s.year = 2026;

select throws_ok(
  $$ insert into public.sponsors (season_id, name, tier)
     select id, 'Second Presenter', 'presenting' from public.seasons where year = 2026 $$,
  '23505', null, 'only one presenting sponsor a season'
);
select throws_ok(
  $$ insert into public.sponsors (season_id, name, tier, website_url)
     select id, 'Typo Co', 'supporting', 'https://' from public.seasons where year = 2026 $$,
  '23514', null, 'a sponsor link must be a real web address'
);
select throws_ok(
  $$ insert into public.sponsors (season_id, name, tier)
     select id, repeat('x', 81), 'supporting' from public.seasons where year = 2026 $$,
  '23514', null, 'a sponsor name fits the title (80 characters)'
);
select lives_ok(
  $$ insert into public.prizes (season_id, sponsor_id, description)
     select id, '00000000-0000-0000-0000-00000000c002', '$25 gift card' from public.seasons where year = 2026 $$,
  'a sponsor gives a prize'
);
select throws_ok(
  $$ insert into public.prizes (season_id, sponsor_id, description)
     select id, '00000000-0000-0000-0000-00000000c002', 'A family pizza night' from public.seasons where year = 2026 $$,
  '23514', null, 'a prize is written to follow "wins": "a family pizza night", not "A family pizza night"'
);

insert into public.seasons (id, year, entries_open_at, entries_close_at, delivered_at)
values ('00000000-0000-0000-0000-00000000a002', 2030, '2030-11-29', '2030-12-20', '2030-12-23');
select throws_ok(
  $$ insert into public.prizes (season_id, sponsor_id, description)
     values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c002', 'Wrong year') $$,
  '23503', null, 'a prize belongs to its sponsor''s season'
);

-- Letters: only published words, and those already clean --------------------

select throws_ok(
  $$ insert into public.letters (season_id, first_name, age, body)
     select id, ' Mia', 3, 'Dear Santa' from public.seasons where year = 2026 $$,
  '23514', null, 'a first name is stored trimmed'
);
select throws_ok(
  $$ insert into public.letters (season_id, first_name, age, body)
     select id, 'Mia', 18, 'Dear Santa' from public.seasons where year = 2026 $$,
  '23514', null, 'letters are from children (17 and under)'
);
select throws_ok(
  $$ insert into public.letters (season_id, first_name, age, body)
     select id, 'Mia', 3, repeat('x', 2001) from public.seasons where year = 2026 $$,
  '23514', null, 'a letter is at most 2,000 characters'
);
select hasnt_column('public', 'letters', 'email', 'no contact details on the public table');
select hasnt_column('public', 'letters', 'last_name', 'no last name anywhere');

-- Family details --------------------------------------------------------------

insert into public.letters (id, season_id, first_name, age, body)
select '00000000-0000-0000-0000-00000000e001', id, 'Mia', 6, 'Dear Santa' from public.seasons where year = 2026;

select throws_ok(
  $$ insert into public.letter_private (letter_id, source, email)
     values ('00000000-0000-0000-0000-00000000e001', 'form', 'parent@example.com') $$,
  '23514', null, 'a form letter needs the parent''s name and consent'
);
select throws_ok(
  $$ insert into public.letter_private (letter_id, source)
     values ('00000000-0000-0000-0000-00000000e001', 'email') $$,
  '23514', null, 'an emailed letter keeps the address it came from'
);
select throws_ok(
  $$ insert into public.letter_private (letter_id, source, email)
     values ('00000000-0000-0000-0000-00000000e001', 'email', 'Parent@Example.com') $$,
  '23514', null, 'emails are stored lowercase'
);

select * from finish();
rollback;
