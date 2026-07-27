-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED v6: per-session ranked snapshot.
--
-- WHY THIS REPLACES THE KEYSET. community_feed (062) paginated by keyset over
-- (score, created_at, id). That score moves — every 10 minutes from the cron,
-- and continuously once recency carries real weight. When a ranking shifts
-- between page fetches, rows cross the page boundary and are duplicated or
-- skipped, silently: no error, no type failure, no lint warning. It is the same
-- failure Bluesky's Discover feed has open against it.
--
-- Instead: rank the whole pool ONCE into a frozen array of post ids, and
-- paginate by slicing it. Duplicates and skips become structurally impossible,
-- and because the whole ordered list is in hand, the diversity re-rank can be
-- exact instead of a window-function approximation that breaks at page seams.
--
-- Both functions are SECURITY INVOKER, so posts' RLS (044) keeps enforcing
-- visibility, friends-only scoping and blocks. Nothing is re-implemented here.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier        SMALLINT NOT NULL DEFAULT 1,
  post_ids    UUID[]  NOT NULL,
  -- Parallel to post_ids. Stored so CommunityPost.score keeps its real value
  -- and "why is this post fourth?" is answerable from the row.
  post_scores FLOAT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- array_length returns NULL for empty arrays, not 0. Without COALESCE,
  -- a mismatch between empty and populated arrays would pass the constraint
  -- (NULL = 3 is NULL, treated as satisfied). With it, 0 = 3 is rejected.
  CONSTRAINT feed_sessions_arrays_aligned
    CHECK (COALESCE(array_length(post_ids, 1), 0)
         = COALESCE(array_length(post_scores, 1), 0))
);

CREATE INDEX IF NOT EXISTS feed_sessions_user_idx
  ON feed_sessions (user_id, created_at DESC);

ALTER TABLE feed_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_sessions_select" ON feed_sessions;
CREATE POLICY "feed_sessions_select" ON feed_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "feed_sessions_insert" ON feed_sessions;
CREATE POLICY "feed_sessions_insert" ON feed_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 6 hours, not 1: a session must outlive any plausible scroll, because a page
-- request against a pruned session is a hard error for the user. Six hours of
-- sessions at ~12 KB each is nothing at this scale.
CREATE OR REPLACE FUNCTION prune_feed_data()
RETURNS void AS $$
BEGIN
  DELETE FROM post_impressions WHERE last_seen_at < NOW() - INTERVAL '30 days';
  DELETE FROM feed_sessions    WHERE created_at   < NOW() - INTERVAL '6 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
