begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true,
  now() - interval '1 day', now() + interval '10 days', now() + interval '12 days');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

insert into public.sponsors (id, season_id, name, tier)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'Pizza Co', 'supporting');

-- Families: A has three children's letters (one sent from a +tagged address); B emailed one and sent one
-- through the form from a +tagged address; C mailed two, the return address typed two ways; D is a staff
-- household; one mailed letter has no way to reach anyone; E's letter was declined; F's still waits.
insert into public.letters (id, season_id, status, first_name, age, body)
select v.id::uuid, '00000000-0000-0000-0000-00000000a001', v.status::public.letter_status, v.name, 6, 'Dear Santa'
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'approved', 'Ann'),
  ('00000000-0000-0000-0000-0000000000a2', 'approved', 'Abe'),
  ('00000000-0000-0000-0000-0000000000b1', 'approved', 'Ben'),
  ('00000000-0000-0000-0000-0000000000c1', 'approved', 'Cal'),
  ('00000000-0000-0000-0000-0000000000c2', 'approved', 'Cy'),
  ('00000000-0000-0000-0000-0000000000a3', 'approved', 'Amy'),
  ('00000000-0000-0000-0000-0000000000b2', 'approved', 'Bo'),
  ('00000000-0000-0000-0000-0000000000d1', 'approved', 'Dot'),
  ('00000000-0000-0000-0000-0000000000aa', 'approved', 'Ned'),
  ('00000000-0000-0000-0000-0000000000e1', 'rejected', 'Eve'),
  ('00000000-0000-0000-0000-0000000000f1', 'pending', 'Fay')
) as v (id, status, name);

insert into public.letter_private (letter_id, source, parent_name, email, mail_contact, consent_at, prize_eligible)
select v.id::uuid, v.source::public.letter_source, v.parent, v.email, v.contact,
  case when v.source = 'form' then now() end, v.eligible
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'form', 'A', 'a@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000a2', 'form', 'A', 'a@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000b1', 'email', null, 'b@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000c1', 'mail', null, null, '1 Main St., Wausau', true),
  ('00000000-0000-0000-0000-0000000000c2', 'mail', null, null, E'1 main st\nWausau', true),
  ('00000000-0000-0000-0000-0000000000a3', 'form', 'A', 'a+kids@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000b2', 'form', 'B', 'b+2@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000d1', 'form', 'D', 'd@example.com', null, false),
  ('00000000-0000-0000-0000-0000000000aa', 'mail', null, null, null, true),
  ('00000000-0000-0000-0000-0000000000e1', 'form', 'E', 'e@example.com', null, true),
  ('00000000-0000-0000-0000-0000000000f1', 'form', 'F', 'f@example.com', null, true)
) as v (id, source, parent, email, contact, eligible);

create temp view winners as
select d.prize_id, d.letter_id, d.id as draw_id,
  coalesce(regexp_replace(p.email, '\+[^@]*@', '@'), regexp_replace(lower(p.mail_contact), '[^a-z0-9]', '', 'g')) as family
from public.prize_draws d join public.letter_private p on p.letter_id = d.letter_id
where d.forfeited_at is null;
grant select on winners to authenticated;

-- Before the drawing ------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'The drawing runs after letters close.', 'no drawing while the mailbag is open'
);
reset role;

update public.seasons set entries_open_at = now() - interval '10 days', entries_close_at = now() - interval '1 day',
  delivered_at = now() + interval '2 days' where year = 2099;

set local role authenticated;
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', '1 letter is still waiting for review. Post or decline it before the drawing.',
  'every letter is reviewed first, so none misses the drawing'
);
select lives_ok(
  $$ select public.moderate_letter('00000000-0000-0000-0000-0000000000f1', 'pending', 'rejected', 'A test letter') $$,
  'the last letter is reviewed'
);
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'There are no prizes to draw yet.', 'a drawing needs prizes'
);

-- A staff household is the whole family.
select lives_ok($$ select public.set_prize_eligible('00000000-0000-0000-0000-0000000000b1', false) $$, 'staff mark a household');
select is(
  (select array_agg(prize_eligible order by letter_id) from public.letter_private
   where letter_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  array[false, false], 'every letter from the family changes with it, +tag or not'
);
select lives_ok(
  $$ select public.add_letter('email', 'Bea', 7::smallint, null, 'Dear Santa', null, null, 'b@example.com', null) $$,
  'a letter from the household arrives later'
);
select is(
  (select p.prize_eligible from public.letter_private p join public.letters l on l.id = p.letter_id where l.first_name = 'Bea'),
  false, 'and is the household''s too, so it can''t win'
);
select lives_ok($$ select public.set_prize_eligible('00000000-0000-0000-0000-0000000000b2', true) $$, 'and back');
reset role;

insert into public.prizes (id, season_id, sponsor_id, description, created_at)
select v.id::uuid, '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', v.description,
  now() - v.n * interval '1 minute'
from (values
  ('00000000-0000-0000-0000-000000000101', 'Pizza party', 4),
  ('00000000-0000-0000-0000-000000000102', '$25 gift card', 3),
  ('00000000-0000-0000-0000-000000000103', '$25 gift card', 2),
  ('00000000-0000-0000-0000-000000000104', '$25 gift card', 1)
) as v (id, description, n);

set local role authenticated;
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'There are 4 prizes to draw, and only 3 families can win.',
  'only families with a letter in the mailbag, a way to reach them and no staff tie can win, counted once however their address is typed'
);
reset role;

delete from public.prizes where id = '00000000-0000-0000-0000-000000000104';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  '42501', 'Staff only.', 'readers can''t run the drawing'
);
reset role;

-- The drawing -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select lives_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$, 'staff run the drawing');
select is((select count(*)::int from winners), 3, 'every prize has a winner');
select is((select count(distinct family)::int from winners), 3, 'one prize per family, even with two children''s letters');
select is(
  (select array_agg(family order by family) from winners),
  array['1mainstwausau', 'a@example.com', 'b@example.com'],
  'the staff household, the letter with no contact, and the declined and waiting letters are left out'
);
select ok(
  (select bool_and(drawn_by = '00000000-0000-0000-0000-00000000b001') from public.prize_draws),
  'the draw records who ran it'
);
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'Every prize has been drawn.', 'the drawing runs once'
);
select throws_ok(
  $$ select public.add_letter('mail', 'Gus', 5::smallint, null, 'Dear Santa', null, null, null, null) $$,
  'P0001', 'The prize drawing has already run, so a letter added now would miss it.',
  'no letters are added after the drawing'
);
select throws_ok(
  $$ select public.moderate_letter((select letter_id from winners where prize_id = '00000000-0000-0000-0000-000000000101'), 'approved', 'rejected', 'Oops') $$,
  'P0001', 'This letter won a prize. To take it down, redraw the prize first (Prize drawing); the family gives it up for good.',
  'a winner stays in the mailbag'
);
select throws_ok(
  $$ select public.moderate_letter('00000000-0000-0000-0000-0000000000f1', 'rejected', 'approved', null) $$,
  'P0001', 'The prize drawing has run, so this letter can''t go in the mailbag now: it would miss the drawing.',
  'a declined letter can''t go up after the drawing, which it missed'
);
select throws_ok(
  $$ select public.set_prize_eligible('00000000-0000-0000-0000-0000000000d1', true) $$,
  'P0001', 'The prize drawing has run, so a family can''t be put back in it.',
  'nor can a household be put back in it'
);
select throws_ok(
  $$ select public.set_prize_eligible((select letter_id from winners where prize_id = '00000000-0000-0000-0000-000000000101'), false) $$,
  'P0001', 'This family has won a prize. Redraw it first.', 'a winner''s family can''t be marked a staff household'
);
reset role;

set local role anon;
select is((select count(*)::int from public.prize_winners), 0, 'winners stay hidden from readers before delivery');
reset role;

-- A family that doesn't claim its prize -----------------------------------------

create temp table forfeited as
select letter_id, family from winners where prize_id = '00000000-0000-0000-0000-000000000101';
grant select on forfeited to authenticated;

set local role authenticated;
select throws_ok(
  $$ select public.redraw_prize((select draw_id from winners where prize_id = '00000000-0000-0000-0000-000000000101')) $$,
  'P0001', 'Every family that can win already holds a prize or gave one up.', 'with no family left, a redraw is refused'
);
select is((select letter_id from winners where prize_id = '00000000-0000-0000-0000-000000000101'),
  (select letter_id from forfeited), 'and the winner keeps the prize');
reset role;

-- Family G's letter arrived in time and was posted before the drawing; a staff member restores it.
insert into public.letters (id, season_id, status, first_name, age, body)
values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000a001', 'approved', 'Gus', 5, 'Dear Santa');
insert into public.letter_private (letter_id, source, email) values ('00000000-0000-0000-0000-0000000000bb', 'email', 'g@example.com');

set local role authenticated;
create temp table first_draw as select draw_id from winners where prize_id = '00000000-0000-0000-0000-000000000101';
select lives_ok($$ select public.redraw_prize((select draw_id from first_draw)) $$, 'staff redraw an unclaimed prize');
select throws_ok(
  $$ select public.redraw_prize((select draw_id from first_draw)) $$,
  'P0001', 'That prize was already redrawn. Reload the page to see who has it now.',
  'a second click from a page that''s out of date forfeits nobody else'
);
select is((select family from winners where prize_id = '00000000-0000-0000-0000-000000000101'), 'g@example.com',
  'it goes to the one family holding nothing');
select is(
  (select count(*)::int from public.prize_draws where prize_id = '00000000-0000-0000-0000-000000000101' and forfeited_at is not null),
  1, 'the forfeit is kept'
);
select lives_ok(
  $$ select public.moderate_letter((select letter_id from forfeited), 'approved', 'rejected', 'Family asked us to take it down') $$,
  'a letter that gave up its prize can come down'
);
reset role;

-- A sponsor that came in after the drawing.
insert into public.prizes (id, season_id, sponsor_id, description)
values ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'late prize');
set local role authenticated;
select throws_ok(
  $$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'There is 1 prize to draw, and only 0 families can win.', 'a late prize needs a family holding nothing'
);
reset role;
insert into public.letters (id, season_id, status, first_name, age, body)
values ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-00000000a001', 'approved', 'Hal', 5, 'Dear Santa');
insert into public.letter_private (letter_id, source, email) values ('00000000-0000-0000-0000-0000000000cc', 'email', 'h@example.com');
set local role authenticated;
select lives_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$, 'running the drawing again draws the late prize');
select is((select family from winners where prize_id = '00000000-0000-0000-0000-000000000105'), 'h@example.com',
  'and only it, leaving the others'' winners alone');
select is((select count(*)::int from public.prize_draws), 5, 'four winners and one forfeit');
reset role;

-- Delivery day ------------------------------------------------------------------

update public.seasons set entries_open_at = now() - interval '12 days', entries_close_at = now() - interval '3 days',
  delivered_at = now() - interval '1 day' where year = 2099;

set local role anon;
select is((select count(*)::int from public.prize_winners), 4, 'readers see the winners once the letters are delivered');
select is((select count(*)::int from public.prize_draws where forfeited_at is not null), 0, 'but never a forfeit');
select ok(
  (select bool_and(w.letter_id in (select id from public.mailbag)) from public.prize_winners w),
  'every winner''s letter is in the mailbag'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select public.add_letter('mail', 'Hal', 5::smallint, null, 'Dear Santa', null, null, null, null) $$,
  'P0001', 'The 2099 letters have gone to the North Pole. The mailbag is closed for the year.',
  'the mailbag closes on delivery day'
);
select lives_ok(
  $$ select public.set_prize_eligible('00000000-0000-0000-0000-0000000000aa', false) $$,
  'staff can still mark a non-winner''s family a staff household (taking it out, never putting one back)'
);
reset role;

select * from finish();
rollback;
