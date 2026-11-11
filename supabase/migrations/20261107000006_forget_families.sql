-- Letters to Santa — families' details are kept only as long as the season needs them.
--
-- Two weeks after the letters are delivered (Jan. 6 for 2026), every family's name, email address
-- and return address is cleared for good, as the rules promise; the published letters stay up. By
-- then a winner has had 7 days to reply and a round of redraws has had time to run (RULES.md). A
-- daily job does it, so nobody has to remember. Export the newsletter opt-ins before then
-- (CLAUDE.md, Operations): the clearing takes them too.

create function public.forget_families() returns integer
language sql
volatile
set search_path = ''
as $$
  with cleared as (
    update public.letter_private p
    set parent_name = null, email = null, mail_contact = null, newsletter_opt_in = false, forgotten_at = now()
    from public.letters l
    join public.seasons s on s.id = l.season_id
    where p.letter_id = l.id
      and p.forgotten_at is null
      and now() >= s.delivered_at + interval '14 days'
    returning 1
  )
  select count(*)::integer from cleared
$$;

-- The job runs it, as the owner; no API role can.
revoke all on function public.forget_families() from public, anon, authenticated, service_role;

-- Every day at 12:05 UTC, 6:05 a.m. in Wausau (pg_cron keeps time in UTC). It clears only seasons
-- two weeks past delivery, and only what's still there, so running daily is harmless.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('santa-letters-forget-families', '5 12 * * *', 'select public.forget_families()');
