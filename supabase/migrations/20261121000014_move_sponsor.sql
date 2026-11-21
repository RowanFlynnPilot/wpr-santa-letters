-- Letters to Santa — a sponsor's place among those at its level, changed from the staff page.
--
-- Stamps sit on the envelope, and names in the row under it and at the foot, in the order the sponsors
-- were added: every list reads the rows by `created_at`. The staff page (migration 0013) could add a
-- sponsor and take one off, so the only way to move one up was to remove it, with its prizes, and add it
-- again at the end.
--
-- `move_sponsor` trades a sponsor's place with the one before or after it at the same level. The order
-- is still `created_at`, so nothing that reads the list changes (the mailbag, the strip, the article, the
-- newsletter line): the sponsors at that level keep the same set of times, dealt out in the new order.
-- From here on a sponsor's `created_at` says where it stands, which is all anything used it for. Rows
-- added together in one statement share a time; those are first set a microsecond apart, in the order the
-- lists already break the tie, so there is always a place to trade.

create function public.move_sponsor(p_sponsor_id uuid, p_earlier boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_tier public.sponsor_tier;
  v_ids uuid[];
  v_times timestamptz[];
  v_at integer;
  v_to integer;
  v_swap uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  if p_earlier is null then
    raise exception 'Say which way to move it.';
  end if;

  select sp.season_id, sp.tier into v_season_id, v_tier
  from public.sponsors sp join public.seasons s on s.id = sp.season_id
  where sp.id = p_sponsor_id and s.is_active;
  if not found then
    raise exception 'That sponsor isn''t on this year''s list any more.';
  end if;

  -- Everyone at its level, in the order the lists show them, held so two moves at once can't cross.
  select array_agg(l.id order by l.created_at, l.id), array_agg(l.created_at order by l.created_at, l.id)
  into v_ids, v_times
  from (
    select id, created_at from public.sponsors
    where season_id = v_season_id and tier = v_tier
    for update
  ) l;

  v_at := array_position(v_ids, p_sponsor_id);
  v_to := v_at + case when p_earlier then -1 else 1 end;
  -- Already first, or already last: there is nowhere to go, and that's no error.
  if v_to < 1 or v_to > cardinality(v_ids) then
    return;
  end if;

  for i in 2 .. cardinality(v_times) loop
    if v_times[i] <= v_times[i - 1] then
      v_times[i] := v_times[i - 1] + interval '1 microsecond';
    end if;
  end loop;

  v_swap := v_ids[v_to];
  v_ids[v_to] := v_ids[v_at];
  v_ids[v_at] := v_swap;

  update public.sponsors sp
  set created_at = placed.at
  from unnest(v_ids, v_times) as placed (id, at)
  where sp.id = placed.id and sp.created_at is distinct from placed.at;
end;
$$;

revoke all on function public.move_sponsor(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.move_sponsor(uuid, boolean) to authenticated;
