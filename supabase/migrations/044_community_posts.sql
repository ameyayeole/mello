-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY POSTS: the generic post entity behind the Community feed.
-- Phase 1 uses only type='text'; the other columns (media, ref_wrap_event_id,
-- poll data, moderation) are laid down now so later phases add behaviour, not
-- schema churn. Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('text', 'photo', 'poll', 'shared_wrap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_visibility AS ENUM ('public', 'friends');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type               post_type       NOT NULL DEFAULT 'text',
  visibility         post_visibility NOT NULL DEFAULT 'friends',
  body               TEXT,
  media              TEXT[]          NOT NULL DEFAULT '{}',
  ref_wrap_event_id  UUID REFERENCES events(id) ON DELETE SET NULL,
  -- Author's city at post time; feed scoping reads this, not live location.
  city               TEXT,
  like_count         INT  NOT NULL DEFAULT 0,
  comment_count      INT  NOT NULL DEFAULT 0,
  -- Ranking columns. Phase 1 orders by created_at; Phase 6 materialises score.
  score              FLOAT NOT NULL DEFAULT 0,
  hot_since          TIMESTAMPTZ,
  -- Moderation auto-hide (Phase 6 trigger flips these; Phase 1 just respects).
  hidden             BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A text post must actually carry text.
  CONSTRAINT posts_text_has_body
    CHECK (type <> 'text' OR (body IS NOT NULL AND length(btrim(body)) > 0))
);

-- Keyset pagination reads newest-first; the feed filters out hidden rows.
CREATE INDEX IF NOT EXISTS posts_feed_idx
  ON posts (created_at DESC, id DESC) WHERE hidden = FALSE;
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id);
CREATE INDEX IF NOT EXISTS posts_city_idx   ON posts (city);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- SELECT: a post is visible if it isn't hidden, neither party has blocked the
-- other, AND (it's public, OR it's yours, OR it's friends-only and you're an
-- accepted friend of the author).
DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts
  FOR SELECT TO authenticated
  USING (
    hidden = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
         OR (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
    )
    AND (
      posts.author_id = auth.uid()
      OR posts.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = auth.uid() AND f.addressee_id = posts.author_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = posts.author_id))
      )
    )
  );

-- INSERT: you may only author your own posts.
DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- DELETE: only the author (Phase 1). Post-author comment moderation is Phase 2.
DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_delete" ON posts
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);
