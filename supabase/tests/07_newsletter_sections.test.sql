begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Fixtures: a season open since last week; two letters up, one waiting. -------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at) values
  ('00000000-0000-0000-0000-00000000a001', 2099, true, now() - interval '7 days', now() + interval '10 days', now() + interval '15 days');
insert into public.letters (id, season_id, status, first_name, age, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'approved', 'Mia', 6, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'approved', 'Si', 4, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'pending', 'Jo', 5, 'Dear Santa');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

create temp table today as select (now() at time zone 'America/Chicago')::date as d;
grant select on today to anon, authenticated;

-- Staff save a morning's section ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
  '42501', 'Staff only.', 'only staff save a section'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001"}', true);
select lives_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), '<tr><td>Letters</td></tr>',
       array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[], (select d from today)) $$,
  'staff save tomorrow morning''s section'
);
select is((select count(*)::int from public.newsletter_sections), 1, 'staff see it right away');
reset role;

set local role anon;
select is((select count(*)::int from public.newsletter_sections), 0, 'the public (the newsletter build) sees nothing until its morning');
reset role;

-- On its morning ---------------------------------------------------------------------------

update public.newsletter_sections set edition_date = edition_date - 1;
set local role anon;
select is((select rows_html from public.newsletter_sections), '<tr><td>Letters</td></tr>', 'on its morning the build reads it');
reset role;
update public.letters set status = 'rejected' where id = '00000000-0000-0000-0000-0000000000a2';
set local role anon;
select is((select count(*)::int from public.newsletter_sections), 0, 'a letter in it taken down since withholds the whole section');
reset role;
update public.letters set status = 'approved' where id = '00000000-0000-0000-0000-0000000000a2';

-- What staff can't save ------------------------------------------------------------------

set local role authenticated;
select throws_ok(
  $$ select public.save_newsletter_section((select d - 1 from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
  'P0001', 'It''s too late for that morning''s newsletter (it''s built just before 7 a.m.). Save it for a later morning.',
  'a morning that''s past'
);
-- This morning: open until 6:45 a.m. in Wausau, when the edition is about to be built.
select case
  when now() >= ((select d from today) + time '06:45') at time zone 'America/Chicago' then throws_ok(
    $$ select public.save_newsletter_section((select d from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
    'P0001', 'It''s too late for that morning''s newsletter (it''s built just before 7 a.m.). Save it for a later morning.',
    'this morning, after 6:45: too late')
  else lives_ok(
    $$ select public.save_newsletter_section((select d from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
    'this morning, before 6:45: still in time')
end;
select public.save_newsletter_section((select d from today), null, array[]::uuid[], null);
select throws_ok(
  $$ select public.save_newsletter_section((select d + 30 from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
  'P0001', 'The Letters to Santa section is saved for a morning during the season.', 'a morning after the season'
);
select throws_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), '<tr></tr>', array['00000000-0000-0000-0000-0000000000a3']::uuid[], null) $$,
  'P0001', 'Only letters in the mailbag can go in the newsletter.', 'a letter still waiting for review'
);
select throws_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), '<tr></tr>',
       array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-0000000000a2']::uuid[], null) $$,
  'P0001', 'Pick one to three letters.', 'more than three'
);
select throws_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), repeat('x', 13001), array['00000000-0000-0000-0000-0000000000a1']::uuid[], null) $$,
  'P0001', 'The section is too long for the newsletter. Uncheck a letter.', 'more than the newsletter tool takes'
);
select lives_ok(
  $$ select public.save_newsletter_section((select d from today), null, array[]::uuid[], null) $$,
  'saving no rows takes a morning''s section out'
);
select is((select count(*)::int from public.newsletter_sections), 0, 'and it''s gone');

-- A letter in a saved section is edited ------------------------------------------------------

select lives_ok(
  $$ select public.save_newsletter_section((select d + 1 from today), '<tr></tr>',
       array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[], null) $$,
  'a section saved for tomorrow'
);
reset role;
insert into public.newsletter_sections (season_id, edition_date, rows_html, letter_ids, posted_since)
values ('00000000-0000-0000-0000-00000000a001', (select d - 1 from today), '<tr></tr>',
        array['00000000-0000-0000-0000-0000000000a1']::uuid[], (select d - 2 from today));
update public.letters set age = 6, status = 'approved' where id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.newsletter_sections), 2, 'an update that leaves the words as they were changes nothing');
update public.letters set body = 'Dear Santa, from Mia' where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select array_agg(edition_date - (select d from today) order by edition_date) from public.newsletter_sections),
  array[-1],
  'editing a letter withdraws the sections not yet sent that hold it; yesterday''s, already sent, stays'
);

select * from finish();
rollback;
