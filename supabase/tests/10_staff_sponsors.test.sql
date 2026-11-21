begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Fixtures: this year's season, last year's with a sponsor of its own, an editor and a reader. ----

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at) values
  ('00000000-0000-0000-0000-00000000a001', 2099, true, now() - interval '7 days', now() + interval '10 days', now() + interval '15 days'),
  ('00000000-0000-0000-0000-00000000a002', 2098, false, now() - interval '400 days', now() - interval '380 days', now() - interval '375 days');
insert into public.sponsors (id, season_id, name, tier) values
  ('00000000-0000-0000-0000-00000000c098', '00000000-0000-0000-0000-00000000a002', 'Last Year Bank', 'presenting');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');
create temp table ids (label text primary key, id uuid);
grant all on ids to anon, authenticated;

-- Only staff ------------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.save_sponsor(null, 'Sneaky Co', 'presenting', null, null) $$,
  '42501', null, 'the public can''t add a sponsor'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002"}', true);
set local role authenticated;
select throws_ok(sql, '42501', 'Staff only.', 'a signed-in reader can''t ' || what)
from (values
  ($$ select public.save_sponsor(null, 'Sneaky Co', 'presenting', null, null) $$, 'add a sponsor'),
  ($$ select public.remove_sponsor('00000000-0000-0000-0000-00000000c098') $$, 'remove one'),
  ($$ select public.add_prizes('00000000-0000-0000-0000-00000000c098', 'a prize', 1) $$, 'add a prize'),
  ($$ select public.remove_prize(gen_random_uuid()) $$, 'remove one')
) as v (sql, what);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sponsor-logos', 'sneaky.png') $$,
  '42501', null, 'or upload a logo'
);
reset role;

-- Staff add sponsors --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into ids values ('water', public.save_sponsor(null, '  Maher   Water ', 'presenting', ' https://example.com/water ', ' maher-water-1a2b.png ')) $$,
  'staff add a presenting sponsor'
);
select is(
  (select row(season_id, name, tier, website_url, logo_path)::text from public.sponsors where id = (select id from ids where label = 'water')),
  row('00000000-0000-0000-0000-00000000a001'::uuid, 'Maher Water', 'presenting'::public.sponsor_tier, 'https://example.com/water', 'maher-water-1a2b.png')::text,
  'on this year''s list, its name and addresses tidied'
);
select lives_ok(
  $$ insert into ids values ('candy', public.save_sponsor(null, 'Candy Shop', 'donor', '', '')) $$,
  'a prize donor, with no link or logo yet'
);
select is(
  (select row(website_url, logo_path)::text from public.sponsors where id = (select id from ids where label = 'candy')),
  row(null::text, null::text)::text,
  'a blank link and logo are none, not empty words'
);

select throws_ok(sql, 'P0001', message, what)
from (values
  ($$ select public.save_sponsor(null, '   ', 'supporting', null, null) $$,
   'A sponsor''s name is 1 to 80 characters.', 'a sponsor needs a name'),
  ($$ select public.save_sponsor(null, repeat('x', 81), 'supporting', null, null) $$,
   'A sponsor''s name is 1 to 80 characters.', 'one that fits (80 characters)'),
  ($$ select public.save_sponsor(null, 'No Level Co', null, null, null) $$,
   'Choose the sponsor''s level.', 'and a level'),
  ($$ select public.save_sponsor(null, 'Typo Co', 'supporting', 'example.com', null) $$,
   'The web address has to be a full one that starts with https://, like https://example.com.', 'a link is a full https address'),
  ($$ select public.save_sponsor(null, 'Old Web Co', 'supporting', 'http://example.com', null) $$,
   'The web address has to be a full one that starts with https://, like https://example.com.', 'not http'),
  ($$ select public.save_sponsor(null, 'maher water', 'supporting', null, null) $$,
   'maher water is already on this year''s list.', 'a business is on the list once, however it''s capitalized'),
  ($$ select public.save_sponsor('00000000-0000-0000-0000-00000000c098', 'Last Year Bank', 'supporting', null, null) $$,
   'That sponsor isn''t on this year''s list any more.', 'last year''s sponsors can''t be changed')
) as v (sql, message, what);
-- The same name in another season is no clash.
select lives_ok(
  $$ insert into ids values ('bank', public.save_sponsor(null, 'Last Year Bank', 'presenting', null, null)) $$,
  'a sponsor from last year signs on again'
);

-- The envelope holds four stamps: the trigger's rule (migration 0011), in its own plain words.
select lives_ok(
  $$ select public.save_sponsor(null, v.name, 'presenting', null, null) from (values ('Third Presenter'), ('Fourth Presenter')) as v (name) $$,
  'up to four presenting sponsors'
);
select throws_ok(
  $$ select public.save_sponsor(null, 'Fifth Presenter', 'presenting', null, null) $$,
  'P0001', 'A season has at most four presenting sponsors: the envelope holds four stamps.', 'and not a fifth'
);
select throws_ok(
  $$ select public.save_sponsor((select id from ids where label = 'candy'), 'Candy Shop', 'presenting', null, null) $$,
  'P0001', 'A season has at most four presenting sponsors: the envelope holds four stamps.', 'nor a donor moved up to be the fifth'
);

-- Changing one: its logo arrives, its name is corrected, its place in the order stays.
select lives_ok(
  $$ select public.save_sponsor((select id from ids where label = 'candy'), 'Candy Shop on 3rd', 'donor', 'https://example.com/candy', 'candy-shop-9z.png') $$,
  'staff change a sponsor'
);
select is(
  (select row(name, tier, website_url, logo_path)::text from public.sponsors where id = (select id from ids where label = 'candy')),
  row('Candy Shop on 3rd', 'donor'::public.sponsor_tier, 'https://example.com/candy', 'candy-shop-9z.png')::text,
  'and the row is as they saved it'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sponsor-logos', 'candy-shop-9z.png') $$,
  'staff upload a logo'
);
set local storage.allow_delete_query = 'true';
select lives_ok(
  $$ delete from storage.objects where bucket_id = 'sponsor-logos' and name = 'candy-shop-9z.png' $$,
  'and take one down'
);

-- Prizes --------------------------------------------------------------------------------------

select is(public.add_prizes((select id from ids where label = 'candy'), '  a candy   basket ', 3), 3, 'three of a prize are three rows');
select is(
  (select array_agg(distinct description) from public.prizes where sponsor_id = (select id from ids where label = 'candy')),
  array['a candy basket'],
  'each with the prize''s words, tidied'
);
select throws_ok(sql, 'P0001', message, what)
from (values
  ($$ select public.add_prizes((select id from ids where label = 'candy'), 'A candy basket', 1) $$,
   'Start the prize in lowercase, so it reads after "wins": "a family pizza night", not "A family pizza night".', 'a prize reads after "wins"'),
  ($$ select public.add_prizes((select id from ids where label = 'candy'), '  ', 1) $$,
   'Say what the prize is, in 120 characters or fewer.', 'a prize says what it is'),
  ($$ select public.add_prizes((select id from ids where label = 'candy'), repeat('x', 121), 1) $$,
   'Say what the prize is, in 120 characters or fewer.', 'in 120 characters'),
  ($$ select public.add_prizes((select id from ids where label = 'candy'), 'a candy basket', 0) $$,
   'Add 1 to 20 of a prize at a time.', 'at least one of it'),
  ($$ select public.add_prizes((select id from ids where label = 'candy'), 'a candy basket', 21) $$,
   'Add 1 to 20 of a prize at a time.', 'and not a slip of the finger''s worth'),
  ($$ select public.add_prizes('00000000-0000-0000-0000-00000000c098', 'a savings starter', 1) $$,
   'That sponsor isn''t on this year''s list any more.', 'last year''s sponsors give no prizes this year')
) as v (sql, message, what);

select throws_ok(
  $$ select public.remove_sponsor((select id from ids where label = 'candy')) $$,
  'P0001', 'Take this sponsor''s prizes off first.', 'a sponsor with prizes stays'
);
reset role;

-- One of the three is drawn: it stays on the list; the other two can come off.
insert into public.letters (id, season_id, status, first_name, age, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'approved', 'Mia', 6, 'Dear Santa');
insert into ids
select 'prize' || row_number() over (order by id), id from public.prizes where sponsor_id = (select id from ids where label = 'candy');
insert into public.prize_draws (prize_id, season_id, letter_id)
values ((select id from ids where label = 'prize1'), '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
select throws_ok(
  $$ select public.remove_prize((select id from ids where label = 'prize1')) $$,
  'P0001', 'That prize has been drawn, so it stays on the list.', 'a prize that has been drawn stays'
);
select lives_ok($$ select public.remove_prize((select id from ids where label = 'prize2')) $$, 'staff take a prize off');
select throws_ok(
  $$ select public.remove_prize((select id from ids where label = 'prize2')) $$,
  'P0001', 'That prize is already off the list.', 'once'
);
select is((select count(*)::int from public.prizes where sponsor_id = (select id from ids where label = 'candy')), 2, 'one prize, not all of them');

-- A sponsor with no prizes comes off, and the page is told its logo's file to delete.
select is(public.remove_sponsor((select id from ids where label = 'water')), 'maher-water-1a2b.png', 'removing a sponsor gives back its logo''s file');
select is((select count(*)::int from public.sponsors where id = (select id from ids where label = 'water')), 0, 'and it is off the list');
select throws_ok(
  $$ select public.remove_sponsor((select id from ids where label = 'water')) $$,
  'P0001', 'That sponsor isn''t on this year''s list any more.', 'once'
);
reset role;

-- Readers see the list as staff left it, and still can't write it.
set local role anon;
select is(
  (select array_agg(name order by created_at, name) from public.sponsors where season_id = '00000000-0000-0000-0000-00000000a001'),
  array['Candy Shop on 3rd', 'Fourth Presenter', 'Last Year Bank', 'Third Presenter'],
  'readers see this year''s sponsors'
);
select throws_ok(
  $$ insert into public.sponsors (season_id, name, tier) values ('00000000-0000-0000-0000-00000000a001', 'Sneaky Co', 'presenting') $$,
  '42501', null, 'and can''t add one behind the functions'' backs'
);
reset role;

select * from finish();
rollback;
