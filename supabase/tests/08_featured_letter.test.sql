begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixtures: a season open since last week; two letters up, one waiting; last year's letter. ----

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at) values
  ('00000000-0000-0000-0000-00000000a001', 2099, true, now() - interval '7 days', now() + interval '10 days', now() + interval '15 days'),
  ('00000000-0000-0000-0000-00000000a002', 2098, false, now() - interval '400 days', now() - interval '380 days', now() - interval '375 days');
insert into public.letters (id, season_id, status, first_name, age, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'approved', 'Mia', 6, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'approved', 'Si', 4, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'pending', 'Jo', 5, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000a002', 'approved', 'Al', 7, 'Dear Santa');
insert into public.letter_private (letter_id, source) values
  ('00000000-0000-0000-0000-0000000000a1', 'mail'),
  ('00000000-0000-0000-0000-0000000000a2', 'mail');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

-- Only staff pick, and only a letter in this year's mailbag --------------------------------

set local role anon;
select throws_ok(
  $$ select public.feature_letter('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'the public can''t pick a letter'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.feature_letter('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', 'Staff only.', 'nor can a signed-in reader'
);
select throws_ok(
  $$ select public.unfeature_letter('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', 'Staff only.', 'or undo a pick'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001"}', true);
select throws_ok(
  $$ select public.feature_letter('00000000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'Only a letter in this year''s mailbag can be the editor''s pick.', 'a waiting letter can''t be the pick'
);
select throws_ok(
  $$ select public.feature_letter('00000000-0000-0000-0000-0000000000a4') $$,
  'P0001', 'Only a letter in this year''s mailbag can be the editor''s pick.', 'nor can last year''s'
);
select lives_ok($$ select public.feature_letter('00000000-0000-0000-0000-0000000000a1') $$, 'staff pick a posted letter');
select is(
  (select featured_by from public.featured_letters),
  '00000000-0000-0000-0000-00000000b001'::uuid,
  'staff see who picked it'
);
reset role;

-- Readers see the letter, not the editor ------------------------------------------------------

set local role anon;
select is(
  (select letter_id from public.featured_letters where season_id = '00000000-0000-0000-0000-00000000a001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the public sees the pick'
);
select throws_ok(
  $$ select featured_by from public.featured_letters $$,
  '42501', null, 'but not who picked it'
);
select throws_ok(
  $$ insert into public.featured_letters (season_id, letter_id) values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000a4') $$,
  '42501', null, 'and can''t write a pick of its own'
);
reset role;

-- One pick a season: another replaces it --------------------------------------------------------

set local role authenticated;
select lives_ok($$ select public.feature_letter('00000000-0000-0000-0000-0000000000a2') $$, 'picking another letter');
select is(
  (select array_agg(letter_id) from public.featured_letters),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'replaces the first: one pick a season'
);
select is(
  public.unfeature_letter('00000000-0000-0000-0000-0000000000a1'),
  false,
  'a page that still shows the old pick can''t undo the new one'
);
select is((select count(*)::int from public.featured_letters), 1, 'which stays');
reset role;

-- It lasts only while the letter is up -----------------------------------------------------------

set local role authenticated;
select lives_ok(
  $$ select public.moderate_letter('00000000-0000-0000-0000-0000000000a2', 'approved', 'rejected', 'Family asked') $$,
  'staff take the picked letter down'
);
select is((select count(*)::int from public.featured_letters), 0, 'and it stops being the pick');
select lives_ok(
  $$ select public.moderate_letter('00000000-0000-0000-0000-0000000000a2', 'rejected', 'approved', null) $$,
  'posted again'
);
select is((select count(*)::int from public.featured_letters), 0, 'it isn''t the pick until an editor picks it again');

select public.feature_letter('00000000-0000-0000-0000-0000000000a1');
select is(public.unfeature_letter('00000000-0000-0000-0000-0000000000a1'), true, 'staff stop featuring a letter');
reset role;

select * from finish();
rollback;
