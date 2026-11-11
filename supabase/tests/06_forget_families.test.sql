begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixtures --------------------------------------------------------------------
-- Last season, delivered 15 days ago; this season, delivered yesterday.

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at) values
  ('00000000-0000-0000-0000-00000000a001', 2098, false, now() - interval '50 days', now() - interval '20 days', now() - interval '15 days'),
  ('00000000-0000-0000-0000-00000000a002', 2099, true, now() - interval '30 days', now() - interval '5 days', now() - interval '1 day');

insert into public.letters (id, season_id, status, first_name, age, town, body) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'approved', 'Mia', 6, 'Weston', 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'approved', 'Si', 4, null, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'rejected', 'Jo', 5, null, 'Dear Santa'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000a002', 'approved', 'Ned', 7, null, 'Dear Santa');
insert into public.letter_private (letter_id, source, parent_name, email, mail_contact, consent_at, newsletter_opt_in) values
  ('00000000-0000-0000-0000-0000000000a1', 'form', 'Pat Parent', 'pat@example.com', null, now(), true),
  ('00000000-0000-0000-0000-0000000000a2', 'mail', 'Lee', null, E'12 Elm St.\nWausau', null, false),
  ('00000000-0000-0000-0000-0000000000a3', 'email', null, 'jo@example.com', null, null, false),
  ('00000000-0000-0000-0000-0000000000b1', 'form', 'Ann', 'ann@example.com', null, now(), false);

-- The clearing ---------------------------------------------------------------

select is(public.forget_families(), 3, 'two weeks after delivery, every family''s details in that season are cleared');
select is(
  (select count(*)::int from public.letter_private p join public.letters l on l.id = p.letter_id
   where l.season_id = '00000000-0000-0000-0000-00000000a001'
     and (p.parent_name is not null or p.email is not null or p.mail_contact is not null or p.newsletter_opt_in)),
  0, 'names, emails, return addresses and newsletter opt-ins, posted letters and declined ones alike'
);
select is(
  (select count(*)::int from public.letter_private where forgotten_at is not null), 3, 'and when is recorded'
);
select is(
  (select count(*)::int from public.letters where season_id = '00000000-0000-0000-0000-00000000a001'), 3,
  'the letters themselves stay'
);
select is(
  (select email from public.letter_private where letter_id = '00000000-0000-0000-0000-0000000000b1'), 'ann@example.com',
  'a season delivered only yesterday keeps its families'' details'
);
select is(public.forget_families(), 0, 'running it again changes nothing');

-- Who can run it --------------------------------------------------------------

select ok(not has_function_privilege(r, 'public.forget_families()', 'execute'), r || ' can''t run it')
from unnest(array['anon', 'authenticated', 'service_role']) as r;
select is(
  (select schedule || ' ' || command from cron.job where jobname = 'santa-letters-forget-families'),
  '5 12 * * * select public.forget_families()',
  'a daily job runs it, at 6:05 a.m. in Wausau'
);
select is(
  (select schedule from cron.job where jobname = 'santa-letters-staff-digest'), '0 13 * * *',
  'and another sends the staff''s digest at 7 a.m.'
);
select ok(
  (select command like '%/functions/v1/staff-digest%' and command like '%''apikey'', (select decrypted_secret%santa_secret_key%'
     and command not ilike '%bearer%' and command like '%timeout_milliseconds := 30000%' from cron.job
   where jobname = 'santa-letters-staff-digest'),
  'calling the digest function with the secret key from Vault, in the apikey header (a secret key is no bearer token)'
);

select * from finish();
rollback;
