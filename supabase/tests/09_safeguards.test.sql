begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Thirty letters from one sender, each with its own key, sent over the last few hours.
insert into public.form_senders (sender_key, submission_key, created_at)
select 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), now() - (n || ' minutes')::interval
from generate_series(1, 29) as n;

-- The limit by connection ---------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid()) $$,
  '42501', null, 'the public can''t call the limit'
);
reset role;
set local role authenticated;
select throws_ok(
  $$ select public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid()) $$,
  '42501', null, 'nor can a signed-in reader'
);
select throws_ok($$ select count(*) from public.form_senders $$, '42501', null, 'and nobody reads who sent what');
reset role;

set local role service_role;
select is(
  public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1'),
  true, 'the 30th letter in a day from one sender goes through'
);
select is(
  public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a2'),
  false, 'the 31st does not'
);
select is(
  public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1'),
  true, 'a retry of a letter already counted isn''t another letter, even at the limit'
);
select is(
  public.allow_sender('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a2'),
  true, 'another sender is not held back'
);
select throws_ok(
  $$ select public.allow_sender('short', gen_random_uuid()) $$,
  '23514', null, 'a key too short to be a scramble of an address is refused'
);
reset role;

select is(
  (select count(*)::int from public.form_senders where sender_key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  30, 'the refused letter was not counted'
);

-- A rolling day: yesterday's letters stop counting, and nothing is kept past two days.
update public.form_senders set created_at = created_at - interval '25 hours'
where sender_key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
set local role service_role;
select is(
  public.allow_sender('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3'),
  true, 'a day later the same sender can write again'
);
reset role;
update public.form_senders set created_at = created_at - interval '2 days'
where sender_key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and submission_key <> '00000000-0000-0000-0000-0000000000a3';
set local role service_role;
select public.allow_sender('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a4');
reset role;
select is(
  (select count(*)::int from public.form_senders where created_at < now() - interval '2 days'),
  0, 'the next letter from anyone clears everything older than two days'
);
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'form_senders'),
  array['created_at', 'sender_key', 'submission_key'],
  'the table has no column for a network address, an email or anything about the letter'
);

-- The record of trouble -------------------------------------------------------------------------------

set local role authenticated;
select throws_ok($$ select public.note_form_problem('save') $$, '42501', null, 'a signed-in reader can''t note a problem');
select throws_ok($$ select count(*) from public.form_problems $$, '42501', null, 'or read them');
reset role;

set local role service_role;
select lives_ok($$ select public.note_form_problem('spam-check') $$, 'the form''s function notes that the spam check was down');
select lives_ok($$ select public.note_form_problem('email') $$, 'and that a confirmation didn''t send');
select throws_ok($$ select public.note_form_problem('something else') $$, '23514', null, 'only the kinds the digest knows');
select is(
  (select array_agg(kind order by id) from public.form_problems),
  array['spam-check', 'email'], 'the digest''s function can read them'
);
reset role;

update public.form_problems set created_at = now() - interval '61 days' where kind = 'spam-check';
set local role service_role;
select public.note_form_problem('limit');
reset role;
select is(
  (select array_agg(kind order by id) from public.form_problems),
  array['email', 'limit'], 'problems older than 60 days are cleared as new ones come in'
);
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'form_problems'),
  array['created_at', 'id', 'kind'],
  'a problem is a kind and a time: nothing about the letter or the family'
);

select * from finish();
rollback;
