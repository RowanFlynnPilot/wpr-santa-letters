-- Letters to Santa — "your letter is in Santa's mailbag."
--
-- When staff post a letter that has a parent's email (a form letter, or one staff typed in from an
-- email or with an email on a mailed one), the staff page calls the letter-posted function, which
-- emails the parent once: the letter is up, with a link that opens the mailbag at it, to share with
-- family. posted_notice() answers only for a posted letter with an email whose family hasn't been
-- told; mark_posted_notice() records the send after Resend accepts it. Both are for the function
-- (service role) only, and it checks its caller is staff by reading `staff`.

alter table public.letter_private add column posted_notice_at timestamptz;

create function public.posted_notice(p_letter_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', l.first_name,
    'age', l.age,
    'town', l.town,
    'parent_name', p.parent_name,
    'email', p.email,
    'entries_close_at', s.entries_close_at,
    'delivered_at', s.delivered_at,
    -- Whether more letters can come in (the email invites them), by the one phase rule.
    'open', public.phase_at(s, now()) = 'open',
    -- Whether this letter is in a drawing: there are prizes and the family isn't a staff household.
    'drawing', p.prize_eligible and exists (select 1 from public.prizes z where z.season_id = l.season_id)
  )
  from public.letters l
  join public.letter_private p on p.letter_id = l.id
  join public.seasons s on s.id = l.season_id
  where l.id = p_letter_id and l.status = 'approved' and p.email is not null and p.posted_notice_at is null
$$;

create function public.mark_posted_notice(p_letter_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.letter_private set posted_notice_at = now()
  where letter_id = p_letter_id and posted_notice_at is null
$$;

revoke all on function public.posted_notice(uuid), public.mark_posted_notice(uuid) from public, anon, authenticated, service_role;
grant execute on function public.posted_notice(uuid), public.mark_posted_notice(uuid) to service_role;

grant select on public.staff to service_role;
