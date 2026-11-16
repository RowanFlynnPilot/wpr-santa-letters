-- Letters to Santa — several presenting sponsors, four at most. Additive only (CLAUDE.md, invariant 23).
--
-- The launch schema allowed one presenting sponsor a season: its logo was the stamp on the mailbag's
-- envelope. Shereen and Chris are selling the presenting sponsorship to up to four businesses this year
-- (decided Nov. 15, 2026; four signed on at this level the last time), so the envelope carries up to four
-- stamps side by side, and where there is room for one (a letter saved as a picture, Santa's reply) the
-- sponsors take turns by letter. The schema's comment on public.sponsors ("The presenting sponsor's logo
-- is the stamp") describes the launch; this is what holds now.

drop index public.sponsors_one_presenting_per_season;

-- Four is what the envelope is laid out for and what the sponsor sheet promises ("limited to four").
-- Sponsors are added by hand in the SQL editor, so the message is for whoever is typing.
create function public.limit_presenting_sponsors() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tier = 'presenting' then
    -- One at a time for a season, so two inserts at once can't both be the fourth.
    perform pg_advisory_xact_lock(hashtext('santa-presenting:' || new.season_id::text));
    if (
      select count(*) from public.sponsors
      where season_id = new.season_id and tier = 'presenting' and id <> new.id
    ) >= 4 then
      raise exception 'A season has at most four presenting sponsors: the envelope holds four stamps.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.limit_presenting_sponsors() from public, anon, authenticated, service_role;

create trigger sponsors_four_presenting
before insert or update of tier, season_id on public.sponsors
for each row execute function public.limit_presenting_sponsors();
