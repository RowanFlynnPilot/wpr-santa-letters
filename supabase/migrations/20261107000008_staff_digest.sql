-- Letters to Santa — the staff's morning digest.
--
-- At 7 a.m. in Wausau (13:00 UTC; the season runs on standard time) pg_cron calls the staff-digest
-- function, which emails the editor the form letters waiting for review, or nothing when none are.
-- It replaces an email per letter: one email a morning, and Resend's daily limit goes further.
--
-- The call needs the project's address and secret key, which live in Vault, set once by hand (README,
-- First deploy):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'santa_project_url');
--   select vault.create_secret('<the project''s secret key>', 'santa_secret_key');
-- Without them the job fails each morning, visibly, in cron.job_run_details.
--
-- The key goes in the apikey header: the new secret keys aren't JWTs, and Supabase's gateway rejects
-- one sent as "Authorization: Bearer".

create extension if not exists pg_net;

select cron.schedule(
  'santa-letters-staff-digest',
  '0 13 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'santa_project_url') || '/functions/v1/staff-digest',
    headers := jsonb_build_object(
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'santa_secret_key')
    ),
    -- pg_net gives up after 5 seconds by default; a cold start, the query and Resend can take longer.
    timeout_milliseconds := 30000
  )
  $$
);
