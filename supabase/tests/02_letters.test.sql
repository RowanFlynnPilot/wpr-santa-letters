begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, entries_open_at, entries_close_at, delivered_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true,
  now() - interval '1 day', now() + interval '10 days', now() + interval '12 days');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

create temp table ids (label text primary key, id uuid not null);
grant select, insert on ids to anon, authenticated, service_role;

-- Form letters (the submit-letter function, as service_role) ------------------

set local role service_role;
select lives_ok(
  $$ insert into ids values ('form1', (public.submit_letter('  Mia ', 6::smallint, ' Weston ',
       E'\r\nDear Santa,\r\nI want a sled.\r\n ', null, ' Pat Parent ', ' Pat@Example.COM ', true, true, gen_random_uuid()) ->> 'id')::uuid) $$,
  'the service role sends a form letter'
);
select is(
  public.submit_letter('Kai', 7::smallint, null, 'Dear Santa', null, 'Ro', 'ro@example.com', true, false,
    '00000000-0000-0000-0000-0000000000e1') ->> 'repeat',
  'false', 'a letter''s first try saves it'
);
select is(
  public.submit_letter('Kai', 7::smallint, null, 'Dear Santa', null, 'Ro', 'ro@example.com', true, false,
    '00000000-0000-0000-0000-0000000000e1'),
  jsonb_build_object('id', (select letter_id from public.letter_private where submission_key = '00000000-0000-0000-0000-0000000000e1'),
    'repeat', true),
  'a retry with the same key (the first reply was lost) gets that letter back'
);
select is((select count(*)::int from public.letter_private where email = 'ro@example.com'), 1, 'and saves nothing new');
insert into ids values
  ('junk1', (public.submit_letter('Zed', 9::smallint, null, 'Buy now', '00000000-0000-0000-0000-00000000f0a1', 'Spam',
     'spam1@example.com', true, false, gen_random_uuid()) ->> 'id')::uuid),
  ('junk2', (public.submit_letter('Zed', 9::smallint, null, 'Buy now', null, 'Spam',
     'spam2@example.com', true, false, gen_random_uuid()) ->> 'id')::uuid);
select throws_ok(
  $$ select public.submit_letter('Kai', 7::smallint, null, 'Dear Santa', null, 'Ro', 'ro@example.com', true, false, null) $$,
  'P0001', 'The letter came without its key. Reload the page and send it again.', 'every letter comes with its key'
);
reset role;

select is((select status::text from public.letters where id = (select id from ids where label = 'form1')), 'pending',
  'a form letter waits for review');
select results_eq(
  $$ select first_name, town, body from public.letters where id = (select id from ids where label = 'form1') $$,
  $$ values ('Mia'::text, 'Weston'::text, E'Dear Santa,\nI want a sled.'::text) $$,
  'the words are trimmed, newlines included, and line breaks stored as LF'
);
select results_eq(
  $$ select source::text, parent_name, email, consent_at is not null, prize_eligible
     from public.letter_private where letter_id = (select id from ids where label = 'form1') $$,
  $$ values ('form'::text, 'Pat Parent'::text, 'pat@example.com'::text, true, true) $$,
  'the family''s details are kept apart: email lowercased, consent stamped, eligible by default'
);
select ok((select newsletter_opt_in from public.letter_private where letter_id = (select id from ids where label = 'form1')),
  'the newsletter opt-in is kept with the family''s details');

set local role service_role;
select lives_ok(
  $$ insert into ids values ('twoline', (public.submit_letter(E'Mia\nSmith', 6::smallint, E' Rib\r\n Mountain', 'Dear Santa',
       null, E'Pat\nParent', 'two@example.com', true, false, gen_random_uuid()) ->> 'id')::uuid) $$,
  'a name typed over two lines'
);
select results_eq(
  $$ select l.first_name, l.town, p.parent_name from public.letters l join public.letter_private p on p.letter_id = l.id
     where l.id = (select id from ids where label = 'twoline') $$,
  $$ values ('Mia Smith'::text, 'Rib Mountain'::text, 'Pat Parent'::text) $$,
  'is stored on one line, so a byline never breaks (and staff see the last name to take out)'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'pat@example.com', false, false, gen_random_uuid()) $$,
  'P0001', 'A parent or guardian needs to give permission to publish the letter.', 'no consent, no letter'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'not-an-email', true, false, gen_random_uuid()) $$,
  'P0001', 'Enter a valid email address so we can reach you if your child wins a prize.', 'a bad email is refused'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', null, true, false, gen_random_uuid()) $$,
  'P0001', 'Enter a valid email address so we can reach you if your child wins a prize.', 'an email is required'
);
select throws_ok(
  $$ select public.submit_letter('   ', 6::smallint, null, 'Dear Santa', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'The child''s first name must be 1 to 30 characters.', 'a blank first name is refused'
);
select throws_ok(
  $$ select public.submit_letter('Mia', null, null, 'Dear Santa', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'Choose the child''s age, from under 1 to 17.', 'an age is required'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 18::smallint, null, 'Dear Santa', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'Choose the child''s age, from under 1 to 17.', 'an 18-year-old is refused in plain English'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, repeat('x', 41), 'Dear Santa', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'The town can be at most 40 characters.', 'a long town is refused in plain English'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, E' \n\t\r\n ', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'The letter is empty.', 'an empty letter is refused'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, repeat('x', 2001), null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'The letter can be at most 2,000 characters.', 'a long letter is refused in plain English'
);
select lives_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, repeat(E'ab\r\n', 666) || 'ab', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'a CRLF line break counts once, as the form counts it (2,000 exactly)'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, ' ', 'pat@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'Your name must be 1 to 100 characters.', 'the parent''s name is required'
);

-- Pat has sent two; eight more reach the day's limit of ten.
select lives_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'pat@example.com', true, false, gen_random_uuid())
     from generate_series(1, 8) $$,
  'ten letters from one address in a day are fine'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'PAT@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'That''s 10 letters from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.',
  'the eleventh is refused, whatever its capitals'
);
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'pat+more@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'That''s 10 letters from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.',
  'or its +tag'
);
reset role;

update public.seasons set entries_open_at = now() - interval '10 days', entries_close_at = now() - interval '1 day',
  delivered_at = now() + interval '2 days' where year = 2099;
set local role service_role;
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'late@example.com', true, false, gen_random_uuid()) $$,
  'P0001', 'Santa''s mailbag isn''t taking letters right now.', 'the form is refused once letters close'
);
reset role;
update public.seasons set entries_open_at = now() - interval '1 day', entries_close_at = now() + interval '10 days',
  delivered_at = now() + interval '12 days' where year = 2099;

-- Readers ---------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ select public.submit_letter('Mia', 6::smallint, null, 'Dear Santa', null, 'Pat', 'x@example.com', true, false, gen_random_uuid()) $$,
  '42501', null, 'readers can''t skip the function (and its spam check)'
);
select is((select count(*)::int from public.mailbag where season_id = '00000000-0000-0000-0000-00000000a001'), 0,
  'a letter waiting for review isn''t in the mailbag');
select is((select count(*)::int from public.letters where status = 'pending'), 0, 'nor readable from the table');
select throws_ok($$ select * from public.letter_private $$, '42501', null, 'readers can''t read family details');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.add_letter('mail', 'Si', 4::smallint, null, 'Dear Santa', null, null, null, null) $$,
  '42501', 'Staff only.', 'a signed-in reader can''t add letters'
);
select throws_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'approved', null) $$,
  '42501', 'Staff only.', 'or post them'
);
select throws_ok(sql, '42501', 'Staff only.', 'or ' || what)
from (values
  ($$ select public.edit_letter((select id from ids where label = 'form1'), null, 'Mia', 6::smallint, null, 'Dear Santa') $$, 'edit them'),
  ($$ select public.remove_letter_photo((select id from ids where label = 'form1')) $$, 'take their photos off'),
  ($$ select public.set_prize_eligible((select id from ids where label = 'form1'), false) $$, 'change who can win'),
  ($$ select public.run_prize_drawing((select id from public.seasons where year = 2099)) $$, 'run the drawing'),
  ($$ select public.redraw_prize(gen_random_uuid()) $$, 'redraw a prize'),
  ($$ select public.decline_letters(array[(select id from ids where label = 'form1')], 'No') $$, 'decline in bulk')
) as v (sql, what);
select is((select count(*)::int from public.letters), 0, 'a signed-in reader sees no letters waiting');
select is((select count(*)::int from public.letter_private), 0, 'and no family details');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('letter-photos', gen_random_uuid() || '/full.jpg') $$,
  '42501', null, 'a reader can''t upload a letter photo'
);
reset role;

-- Staff type in emailed and mailed letters ------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into ids values ('mail1', public.add_letter('mail', ' Si ', 4::smallint, 'Wausau', 'Dear Santa, a truck please.',
       null, null, null, ' 12 Elm St., Wausau ')) $$,
  'staff type in a mailed letter'
);
select is((select status::text from public.letters where id = (select id from ids where label = 'mail1')), 'approved',
  'a letter staff type in goes up at once');
select results_eq(
  $$ select source::text, added_by, moderated_by, mail_contact, email
     from public.letter_private where letter_id = (select id from ids where label = 'mail1') $$,
  $$ values ('mail'::text, '00000000-0000-0000-0000-00000000b001'::uuid, '00000000-0000-0000-0000-00000000b001'::uuid,
       '12 Elm St., Wausau'::text, null::text) $$,
  'it records who typed it in and the return address'
);
select lives_ok(
  $$ insert into ids values ('mail2', public.add_letter('mail', 'Ava', 0::smallint, null, 'Dear Santa', null, ' ', '', ' ')) $$,
  'a mailed letter with no way to reach the family still goes up'
);
select results_eq(
  $$ select parent_name, email, mail_contact from public.letter_private where letter_id = (select id from ids where label = 'mail2') $$,
  $$ values (null::text, null::text, null::text) $$,
  'blank contact answers are stored as nothing'
);
select throws_ok(
  $$ select public.add_letter('email', 'Ethan', 8::smallint, null, 'Dear Santa', null, 'Jo', null, null) $$,
  'P0001', 'An emailed letter needs the address it came from, so we can reach the family about a prize.',
  'an emailed letter keeps its address'
);
select throws_ok(
  $$ select public.add_letter('email', 'Ethan', 8::smallint, null, 'Dear Santa', null, 'Jo', 'jo@', null) $$,
  'P0001', 'That email address doesn''t look right.', 'a bad address is refused'
);
select throws_ok(
  $$ select public.add_letter('form', 'Ethan', 8::smallint, null, 'Dear Santa', null, 'Jo', 'jo@example.com', null) $$,
  'P0001', 'Staff add letters that came by email or mail; the form sends its own.', 'staff can''t pose as the form'
);
select throws_ok(
  $$ select public.add_letter('mail', 'Ethan', 8::smallint, null, 'Dear Santa', gen_random_uuid(), null, null, null) $$,
  'P0001', 'The letter''s photo hasn''t finished uploading. Try again.', 'a photo has to be uploaded first'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('letter-photos', '00000000-0000-0000-0000-00000000f001/full.jpg'),
       ('letter-photos', '00000000-0000-0000-0000-00000000f001/thumb.jpg') $$,
  'staff upload a photo of a letter'
);
select lives_ok(
  $$ insert into ids values ('email1', public.add_letter('email', 'Ethan', 8::smallint, null, 'Dear Santa, Legos.',
       '00000000-0000-0000-0000-00000000f001', 'Jo Parent', 'Jo@Example.com', null)) $$,
  'and type in the letter with it'
);

-- Review ----------------------------------------------------------------------

select throws_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'rejected', '  ') $$,
  'P0001', 'A reason is required when taking a letter down, and only then.', 'taking a letter down needs a reason'
);
select throws_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'approved', 'fine') $$,
  'P0001', 'A reason is required when taking a letter down, and only then.', 'posting one takes none'
);
select throws_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'pending', null) $$,
  'P0001', 'Decision must be approved or rejected.', 'a letter can''t be sent back to waiting'
);
select lives_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'approved', null) $$,
  'staff post a form letter'
);
select throws_ok(
  $$ select public.moderate_letter((select id from ids where label = 'form1'), 'pending', 'rejected', 'From a page loaded earlier') $$,
  'P0001', 'Someone changed this letter since your page loaded. Reload to see it now.',
  'a page that''s out of date can''t decide a letter another editor already has'
);

-- Edits -------------------------------------------------------------------------

select lives_ok(
  $$ select public.edit_letter((select id from ids where label = 'form1'), null, 'Mia', 6::smallint, 'Weston', E'Dear Santa,\r\nI want a sled.') $$,
  'saving the same words'
);
select is((select edited_at from public.letter_private where letter_id = (select id from ids where label = 'form1')), null,
  'records nothing');
select lives_ok(
  $$ select public.edit_letter((select id from ids where label = 'form1'), null, 'Mia', 6::smallint, null, E'Dear Santa,\nI want a sled. Love, Mia') $$,
  'staff edit a letter''s words'
);
select results_eq(
  $$ select l.town, l.body, p.edited_by from public.letters l join public.letter_private p on p.letter_id = l.id
     where l.id = (select id from ids where label = 'form1') $$,
  $$ values (null::text, E'Dear Santa,\nI want a sled. Love, Mia'::text, '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'the words change and the editor is recorded'
);
select throws_ok(
  $$ select public.edit_letter((select id from ids where label = 'form1'), null, 'Mia', 6::smallint, null, '') $$,
  'P0001', 'The letter is empty.', 'an edit follows the same rules as the form'
);
select throws_ok(
  $$ select public.edit_letter((select id from ids where label = 'form1'), null, 'Mia', 6::smallint, 'Weston', E'Dear Santa,\nI want a sled. Love, Mia Smith') $$,
  'P0001', 'Someone edited this letter since your page loaded. Reload to see their changes, then edit again.',
  'a save from words loaded before another editor''s edit is refused'
);
select is((select body from public.letters where id = (select id from ids where label = 'form1')), E'Dear Santa,\nI want a sled. Love, Mia',
  'so it can''t put back what they took out');
select lives_ok(
  $$ select public.edit_letter((select id from ids where label = 'form1'), (select edited_at from public.letter_private where letter_id = (select id from ids where label = 'form1')),
       'Mia', 6::smallint, null, E'Dear Santa,\nI want a sled. Love, Mia') $$,
  'a save from the latest words goes through'
);

reset role;
select is(
  (select (w.first_name, w.town) from public.letter_words(E'Ma\x01x', 5::smallint, E'Wes\x02ton', 'Dear Santa') w),
  ('Max'::text, 'Weston'::text),
  'an invisible control character in a name or town is dropped, not refused as an error'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;

-- Photos ------------------------------------------------------------------------

select lives_ok($$ select public.remove_letter_photo((select id from ids where label = 'email1')) $$, 'staff take a photo off a letter');
select is((select count(*)::int from public.photo_deletions where photo_id = '00000000-0000-0000-0000-00000000f001'), 1,
  'and its files are queued for deletion, in the same step');
select is((select photo_id from public.letters where id = (select id from ids where label = 'email1')), null,
  'and the letter keeps its words without it');
select throws_ok(
  $$ select public.remove_letter_photo((select id from ids where label = 'email1')) $$,
  'P0001', 'This letter has no photo.', 'twice is refused'
);
set local storage.allow_delete_query = 'true';
select lives_ok(
  $$ delete from storage.objects where bucket_id = 'letter-photos' and name like '00000000-0000-0000-0000-00000000f001/%' $$,
  'staff remove its files'
);
select is((select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-00000000f001/%'), 0,
  'both are gone');

-- A letter that comes down loses its photo: once posted, its address was public.
insert into storage.objects (bucket_id, name) values
  ('letter-photos', '00000000-0000-0000-0000-00000000f002/full.jpg'),
  ('letter-photos', '00000000-0000-0000-0000-00000000f002/thumb.jpg');
insert into ids values ('mail3', public.add_letter('mail', 'Kai', 7::smallint, null, 'Dear Santa, my last name is Smith.',
  '00000000-0000-0000-0000-00000000f002', null, null, null));
select lives_ok($$ select public.moderate_letter((select id from ids where label = 'mail3'), 'approved', 'rejected', 'Family asked') $$, 'staff take a letter down');
select is((select count(*)::int from public.photo_deletions where photo_id = '00000000-0000-0000-0000-00000000f002'), 1,
  'and its photo is queued for deletion');
select is((select photo_id from public.letters where id = (select id from ids where label = 'mail3')), null,
  'and the letter no longer points at it');
select lives_ok($$ select public.moderate_letter((select id from ids where label = 'mail3'), 'rejected', 'approved', null) $$, 'posting it again');
select is((select count(*)::int from public.photo_deletions), 2, 'queues nothing more');
select lives_ok($$ select public.moderate_letter((select id from ids where label = 'form1'), 'approved', 'rejected', 'Test') $$,
  'a letter without a photo comes down cleanly');
select is((select count(*)::int from public.photo_deletions), 2, 'with nothing to queue');
select lives_ok($$ select public.moderate_letter((select id from ids where label = 'form1'), 'rejected', 'approved', null) $$, 'and goes back up');

-- Declining in bulk (a flood of junk) -----------------------------------------------

select is(public.decline_letters(array[(select id from ids where label = 'junk1'), (select id from ids where label = 'junk2')],
  ' Junk '), 2, 'staff decline several waiting letters at once');
select results_eq(
  $$ select l.status::text, p.rejection_reason from public.letters l join public.letter_private p on p.letter_id = l.id
     where l.id in (select id from ids where label like 'junk%') $$,
  $$ values ('rejected', 'Junk'), ('rejected', 'Junk') $$,
  'each declined, with the reason'
);
select is((select count(*)::int from public.photo_deletions where photo_id = '00000000-0000-0000-0000-00000000f0a1'), 1,
  'and their photos queued for deletion');
select throws_ok(
  $$ select public.decline_letters(array[(select id from ids where label = 'junk1')], 'Junk') $$,
  'P0001', 'Some of these letters changed since your page loaded. Reload to see them now.',
  'only letters still waiting, as the page showed them'
);
select throws_ok($$ select public.decline_letters(array[]::uuid[], 'Junk') $$, 'P0001', 'Choose the letters to decline.',
  'it needs letters');
select throws_ok($$ select public.decline_letters(array[(select id from ids where label = 'form1')], ' ') $$, 'P0001',
  'A reason is required when declining letters.', 'and a reason');
reset role;

-- The mailbag -----------------------------------------------------------------

set local role anon;
select is(
  (select array_agg(first_name order by first_name) from public.mailbag where season_id = '00000000-0000-0000-0000-00000000a001'),
  array['Ava', 'Ethan', 'Kai', 'Mia', 'Si'],
  'readers see the posted form letter and the four staff typed in, and nothing waiting'
);
reset role;

select * from finish();
rollback;
