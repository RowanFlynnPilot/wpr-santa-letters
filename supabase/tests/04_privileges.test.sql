begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- The privilege map, asserted in both directions, so a missing grant fails CI as loudly as an
-- extra one. The suite passes with and without Supabase's permissive default grants.

-- Public reads -----------------------------------------------------------------
select ok(has_table_privilege('anon', 'public.seasons', 'select'), 'anon reads seasons');
select ok(has_table_privilege('anon', 'public.sponsors', 'select'), 'anon reads sponsors');
select ok(has_table_privilege('anon', 'public.prizes', 'select'), 'anon reads prizes');
select ok(has_table_privilege('anon', 'public.letters', 'select'), 'anon reads letters (RLS: posted only)');
select ok(has_column_privilege('anon', 'public.prize_draws', 'letter_id', 'select'), 'anon reads draws (RLS: current winners, once delivered)');
select ok(not has_column_privilege('anon', 'public.prize_draws', 'drawn_by', 'select'), 'but not which staff member drew them');
select ok(has_table_privilege('anon', 'public.current_season', 'select'), 'anon reads current_season');
select ok(has_table_privilege('anon', 'public.mailbag', 'select'), 'anon reads the mailbag');
select ok(has_table_privilege('anon', 'public.prize_winners', 'select'), 'anon reads prize winners');
select ok(has_table_privilege('authenticated', 'public.mailbag', 'select'), 'authenticated reads the mailbag');
select ok(has_table_privilege('authenticated', 'public.current_season', 'select'), 'authenticated reads current_season');
select ok(has_table_privilege('authenticated', 'public.prize_winners', 'select'), 'authenticated reads prize winners');
select ok(has_table_privilege('authenticated', 'public.letter_private', 'select'), 'authenticated reads family details (RLS: staff only)');
select ok(has_table_privilege('authenticated', 'public.prize_draws', 'select'), 'authenticated reads draws (RLS: staff, or winners once delivered)');

-- The submit-letter function writes its emails from these, as service_role.
select ok(has_table_privilege('service_role', 'public.letters', 'select'), 'service role reads letters for the emails');
select ok(has_table_privilege('service_role', 'public.letter_private', 'select'), 'service role reads family details for the emails');
select ok(has_table_privilege('service_role', 'public.seasons', 'select'), 'service role reads seasons for the emails');
select ok(has_table_privilege('service_role', 'public.sponsors', 'select'), 'service role reads sponsors for the emails');
select ok(has_table_privilege('service_role', 'public.prizes', 'select'), 'service role reads prizes for the emails');

-- Private data -----------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.letter_private', 'select'), 'anon cannot read family details');
select ok(not has_table_privilege('anon', 'public.staff', 'select'), 'anon cannot read staff');
select ok(not has_table_privilege('authenticated', 'public.staff', 'select'), 'authenticated cannot read staff');

-- No direct writes for any API role: RPCs only --------------------------------
select ok(not has_table_privilege(r, 'public.' || t, 'insert'), r || ' cannot insert into ' || t)
from unnest(array['anon', 'authenticated', 'service_role']) as r,
  unnest(array['letters', 'letter_private', 'prize_draws']) as t;
select ok(not has_table_privilege(r, 'public.' || t, 'update,delete'), r || ' cannot change ' || t)
from unnest(array['anon', 'authenticated', 'service_role']) as r,
  unnest(array['letters', 'seasons', 'sponsors', 'prizes']) as t;

-- RPCs -------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.submit_letter(text, smallint, text, text, uuid, text, text, boolean, boolean, uuid)', 'execute'),
  'the submit-letter function can send a letter');
select ok(not has_function_privilege('anon', 'public.submit_letter(text, smallint, text, text, uuid, text, text, boolean, boolean, uuid)', 'execute'),
  'readers can''t skip the function and its spam check');
select ok(not has_function_privilege('authenticated', 'public.submit_letter(text, smallint, text, text, uuid, text, text, boolean, boolean, uuid)', 'execute'),
  'nor can a signed-in reader');

select ok(has_function_privilege('authenticated', f, 'execute'), 'staff tools are callable when signed in: ' || f)
from unnest(array[
  'public.add_letter(public.letter_source, text, smallint, text, text, uuid, text, text, text)',
  'public.moderate_letter(uuid, public.letter_status, public.letter_status, text)',
  'public.edit_letter(uuid, timestamptz, text, smallint, text, text)',
  'public.remove_letter_photo(uuid)',
  'public.set_prize_eligible(uuid, boolean)',
  'public.run_prize_drawing(uuid)',
  'public.redraw_prize(uuid)'
]) as f;
select ok(not has_function_privilege('anon', 'public.add_letter(public.letter_source, text, smallint, text, text, uuid, text, text, text)', 'execute'),
  'anon can''t add letters');
select ok(not has_function_privilege('anon', 'public.run_prize_drawing(uuid)', 'execute'), 'anon can''t run the drawing');

-- Internal helpers: nobody calls them directly.
select ok(not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')
    and not has_function_privilege('service_role', f, 'execute'),
  'internal only: ' || f)
from unnest(array[
  'public.tidy(text)',
  'public.one_line(text)',
  'public.letter_words(text, smallint, text, text)',
  'public.family_key(public.letter_private)',
  'public.lock_season(uuid)',
  'public.keep_household(uuid)',
  'public.drawing_pool(uuid)',
  'public.draw_letter(uuid)'
]) as f;

-- The whole map --------------------------------------------------------------------
-- Everything each API role can use in public, listed. A new table, view or function that anyone can
-- reach without a grant written for it (Postgres lets PUBLIC execute a new function unless revoked)
-- changes one of these lists and fails here.
select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and has_function_privilege(r, p.oid, 'execute') order by 1),
  expected,
  r || ' can execute exactly these functions'
)
from (values
  ('anon', array['phase_at']),
  ('authenticated', array['add_letter', 'decline_letters', 'edit_letter', 'is_staff', 'moderate_letter', 'phase_at',
    'redraw_prize', 'remove_letter_photo', 'run_prize_drawing', 'save_newsletter_section', 'set_prize_eligible']),
  ('service_role', array['mark_posted_notice', 'posted_notice', 'submit_letter'])
) as v (r, expected);
select is(
  array(select c.relname || ':' || lower(priv)
        from pg_class c cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
          and case when priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') then has_any_column_privilege(r, c.oid, priv)
                   else has_table_privilege(r, c.oid, priv) end
        order by 1),
  expected,
  r || ' has exactly these table privileges'
)
from (values
  ('anon', array['current_season:select', 'letters:select', 'mailbag:select', 'newsletter_sections:select',
    'prize_draws:select', 'prize_winners:select', 'prizes:select', 'seasons:select', 'sponsors:select']),
  ('authenticated', array['current_season:select', 'letter_private:select', 'letters:select', 'mailbag:select',
    'newsletter_sections:select', 'photo_deletions:delete', 'photo_deletions:select', 'prize_draws:select', 'prize_winners:select', 'prizes:select', 'seasons:select', 'sponsors:select']),
  ('service_role', array['letter_private:select', 'letters:select', 'prizes:select', 'seasons:select', 'sponsors:select',
    'staff:select'])
) as v (r, expected);

-- Structure ---------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proconfig is null or not ('search_path=""' = any (p.proconfig)))),
  null,
  'every function in public pins search_path to empty'
);
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  null,
  'every view runs as its caller (security_invoker)'
);
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every table has row-level security on'
);

select * from finish();
rollback;
