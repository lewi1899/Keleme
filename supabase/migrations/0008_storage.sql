-- =============================================================================
-- KELEME — 0008 Storage buckets and policies
--
-- Three buckets, and the split between them is a security decision:
--
--   content-pdfs        PRIVATE. Textbooks. Students never touch this bucket
--                       directly; the app mints a short-lived signed URL from
--                       a server route after checking the entitlement.
--   content-thumbnails  public. Cover images. Nothing sensitive, and public
--                       means they are CDN-cacheable, which matters a lot on
--                       the connections most students are on.
--   avatars             public, but writable only inside a folder named after
--                       the owner's user id.
--
-- HTML study content has no bucket at all. It lives in
-- content_html_bodies and is rendered server-side, which is what makes
-- "viewable online, never downloadable as a file" actually true rather than a
-- UI convention (spec section 9).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('content-pdfs', 'content-pdfs', false, 104857600, array['application/pdf']),
  ('content-thumbnails', 'content-thumbnails', true, 5242880,
     array['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('avatars', 'avatars', true, 2097152,
     array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- content-pdfs — staff only, at the storage layer
-- ---------------------------------------------------------------------------

drop policy if exists "pdfs staff read" on storage.objects;
create policy "pdfs staff read" on storage.objects
  for select using (bucket_id = 'content-pdfs' and public.is_staff());

drop policy if exists "pdfs staff insert" on storage.objects;
create policy "pdfs staff insert" on storage.objects
  for insert with check (bucket_id = 'content-pdfs' and public.is_staff());

drop policy if exists "pdfs staff update" on storage.objects;
create policy "pdfs staff update" on storage.objects
  for update using (bucket_id = 'content-pdfs' and public.is_staff())
  with check (bucket_id = 'content-pdfs' and public.is_staff());

drop policy if exists "pdfs staff delete" on storage.objects;
create policy "pdfs staff delete" on storage.objects
  for delete using (bucket_id = 'content-pdfs' and public.is_staff());

-- ---------------------------------------------------------------------------
-- content-thumbnails — world readable, staff writable
-- ---------------------------------------------------------------------------

drop policy if exists "thumbnails public read" on storage.objects;
create policy "thumbnails public read" on storage.objects
  for select using (bucket_id = 'content-thumbnails');

drop policy if exists "thumbnails staff write" on storage.objects;
create policy "thumbnails staff write" on storage.objects
  for insert with check (bucket_id = 'content-thumbnails' and public.is_staff());

drop policy if exists "thumbnails staff update" on storage.objects;
create policy "thumbnails staff update" on storage.objects
  for update using (bucket_id = 'content-thumbnails' and public.is_staff())
  with check (bucket_id = 'content-thumbnails' and public.is_staff());

drop policy if exists "thumbnails staff delete" on storage.objects;
create policy "thumbnails staff delete" on storage.objects
  for delete using (bucket_id = 'content-thumbnails' and public.is_staff());

-- ---------------------------------------------------------------------------
-- avatars — owner-scoped by folder name
--
-- storage.foldername(name) splits the object key on '/', so requiring the
-- first segment to equal auth.uid() means a student can only ever write under
-- their own prefix. This is the storage equivalent of a row-ownership check.
-- ---------------------------------------------------------------------------

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
