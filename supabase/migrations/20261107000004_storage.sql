-- Letters to Santa — storage.
--
-- Both buckets are public-read by URL. Letter photos sit under random UUID folders
-- (letter-photos/<photo_id>/full.jpg and /thumb.jpg), so a photo on a letter still waiting for
-- review, or one that was declined, can't be found. Two writers only: the submit-letter function
-- (service role) for the form, and staff, who upload a photo of a mailed letter when they type it
-- in and remove a photo that shows too much. Sponsor logos are uploaded in the dashboard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('letter-photos', 'letter-photos', true, 3145728, array['image/jpeg']),
  ('sponsor-logos', 'sponsor-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

-- The project's only storage.objects policies, for staff in letter-photos only. The storage API
-- reads an object before it deletes it, hence select.
create policy "Staff upload letter photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'letter-photos' and public.is_staff());
create policy "Staff see letter photos" on storage.objects for select to authenticated
  using (bucket_id = 'letter-photos' and public.is_staff());
create policy "Staff remove letter photos" on storage.objects for delete to authenticated
  using (bucket_id = 'letter-photos' and public.is_staff());
