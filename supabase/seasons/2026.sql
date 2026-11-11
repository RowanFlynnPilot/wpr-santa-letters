-- 2026 Letters to Santa season.
-- Local: loaded as the seed by `supabase db reset`.
-- Production: run once in the SQL editor after the migrations are pushed.
--
-- Letters open the day after Thanksgiving and close at the end of Friday, Dec. 18, which leaves
-- staff through Tuesday, Dec. 22, to type in the last of the mail, review and run the drawing. The
-- letters "go to the North Pole" with the article on the morning of Wednesday, Dec. 23, as in 2024.

insert into public.seasons (year, is_active, entries_open_at, entries_close_at, delivered_at) values (
  2026, true,
  timestamptz '2026-11-27 00:00 America/Chicago',  -- the form opens
  timestamptz '2026-12-19 00:00 America/Chicago',  -- letters close at the end of Dec. 18
  timestamptz '2026-12-23 06:00 America/Chicago'   -- the article runs; winners are public
);
