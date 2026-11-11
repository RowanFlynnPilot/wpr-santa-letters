begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true,
  now() - interval '1 day', now() + interval '10 days', now() + interval '12 days');

insert into public.letters (id, season_id, status, first_name, age, town, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'approved', 'Mia', 6, 'Weston', 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'pending', 'Si', 4, null, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'approved', 'Ned', 5, null, 'Dear Santa');
insert into public.letter_private (letter_id, source, parent_name, email, consent_at, mail_contact) values
  ('00000000-0000-0000-0000-0000000000a1', 'form', 'Pat Parent', 'pat@example.com', now(), null),
  ('00000000-0000-0000-0000-0000000000a2', 'form', 'Jo', 'jo@example.com', now(), null),
  ('00000000-0000-0000-0000-0000000000a3', 'mail', null, null, null, '1 Main St.');

-- The function's view ----------------------------------------------------------

set local role service_role;
select is(
  public.posted_notice('00000000-0000-0000-0000-0000000000a1') - array['entries_close_at', 'delivered_at'],
  '{"first_name": "Mia", "age": 6, "town": "Weston", "parent_name": "Pat Parent", "email": "pat@example.com", "open": true, "drawing": false}'::jsonb,
  'a posted letter with an email: what the email needs, letters still open, and no prizes yet'
);
select is(public.posted_notice('00000000-0000-0000-0000-0000000000a2'), null, 'nothing for a letter still waiting');
select is(public.posted_notice('00000000-0000-0000-0000-0000000000a3'), null, 'nothing for a family with no email');
select lives_ok($$ select public.mark_posted_notice('00000000-0000-0000-0000-0000000000a1') $$, 'the send is recorded');
select is(public.posted_notice('00000000-0000-0000-0000-0000000000a1'), null, 'so the family is told once');
select lives_ok($$ select count(*) from public.staff $$, 'the function can read staff to check its caller');
reset role;

insert into public.sponsors (id, season_id, name, tier) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'Co', 'supporting');
insert into public.prizes (season_id, sponsor_id, description) values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'a prize');
update public.letters set status = 'approved' where id = '00000000-0000-0000-0000-0000000000a2';
set local role service_role;
select is((public.posted_notice('00000000-0000-0000-0000-0000000000a2') ->> 'drawing')::boolean, true,
  'with prizes, the email mentions the drawing');
reset role;
update public.letter_private set prize_eligible = false where letter_id = '00000000-0000-0000-0000-0000000000a2';
update public.seasons set entries_open_at = now() - interval '10 days', entries_close_at = now() - interval '1 hour'
  where id = '00000000-0000-0000-0000-00000000a001';
set local role service_role;
select is(
  jsonb_build_array(public.posted_notice('00000000-0000-0000-0000-0000000000a2') -> 'drawing',
    public.posted_notice('00000000-0000-0000-0000-0000000000a2') -> 'open'),
  '[false, false]'::jsonb,
  'a staff household''s email doesn''t mention the drawing, and once letters close it invites no more'
);
reset role;

-- Privileges -------------------------------------------------------------------

select ok(has_function_privilege('service_role', 'public.posted_notice(uuid)', 'execute'), 'the function reads the notice');
select ok(has_function_privilege('service_role', 'public.mark_posted_notice(uuid)', 'execute'), 'and records the send');
select ok(not has_function_privilege('authenticated', 'public.posted_notice(uuid)', 'execute'), 'a signed-in reader can''t');
select ok(not has_function_privilege('anon', 'public.mark_posted_notice(uuid)', 'execute'), 'nor can anyone else');
select ok(has_table_privilege('service_role', 'public.staff', 'select'), 'the function reads staff to check who calls it');
select ok(not has_table_privilege('authenticated', 'public.staff', 'select'), 'readers still can''t');

select * from finish();
rollback;
