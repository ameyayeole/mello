-- 016: Storage buckets + RLS policies for photo uploads.
-- The app uploads profile gallery photos to `avatars/{uid}/...` and event cover
-- photos to `event-photos/{uid}/...`, authenticated with the user's JWT, and
-- reads them back through public URLs. Without these policies every upload
-- fails with "new row violates row-level security policy".

-- Ensure both buckets exist and are public (the app uses getPublicUrl).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anyone may read (public buckets already serve via public URL, but this also
-- covers authenticated SDK reads).
DROP POLICY IF EXISTS "Public read for photo buckets" ON storage.objects;
CREATE POLICY "Public read for photo buckets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars', 'event-photos'));

-- Owners may upload into their own uid-named folder.
DROP POLICY IF EXISTS "Users upload to own folder" ON storage.objects;
CREATE POLICY "Users upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars', 'event-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may overwrite their own files (the app uploads with x-upsert: true).
DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
CREATE POLICY "Users update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars', 'event-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'event-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may delete their own files (removing gallery photos).
DROP POLICY IF EXISTS "Users delete own files" ON storage.objects;
CREATE POLICY "Users delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars', 'event-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
