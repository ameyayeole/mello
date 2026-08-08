-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTO COMMENT THREADS. wrap_photo_comments was PRIMARY KEY (photo_id,
-- user_id) — exactly one comment per person per photo, so a conversation under
-- a photo was impossible. This swaps the composite key for an id.
--
-- The existing rows keep their content and timestamps; only their identity
-- changes. RLS is unchanged: select, insert and delete policies all already
-- exist from 032 (the delete one included — it is restated here only so this
-- file describes the table's full shape).
--
-- Note the id column's default is gen_random_uuid(), which is VOLATILE, so
-- Postgres rewrites the table and evaluates it once per row. That is what gives
-- every existing comment a DISTINCT id — the fast path in PG11+ applies only to
-- non-volatile defaults and would have given every row the same value. Step 3's
-- COUNT(*) = COUNT(DISTINCT id) check is what proves it went the right way.
--
-- Run this whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wrap_photo_comments DROP CONSTRAINT IF EXISTS wrap_photo_comments_pkey;

ALTER TABLE wrap_photo_comments
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE wrap_photo_comments ADD PRIMARY KEY (id);

-- The read path: a photo's thread, oldest first.
CREATE INDEX IF NOT EXISTS wrap_photo_comments_photo_idx
  ON wrap_photo_comments (photo_id, created_at);

-- Restated from 032 unchanged. You may remove your own comment.
DROP POLICY IF EXISTS "wrap_photo_comments_delete" ON wrap_photo_comments;
CREATE POLICY "wrap_photo_comments_delete" ON wrap_photo_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());
