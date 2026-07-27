-- ─────────────────────────────────────────────────────────────────────────────
-- POST IMPRESSIONS: what each viewer has already been shown, so the v2 feed
-- ranker (066) can filter out posts you have seen three times.
--
-- Shipped one phase AHEAD of the ranker that reads it, so the seen filter has
-- real data on the day it turns on instead of suppressing nothing for a week.
-- Nothing reads this table yet.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_impressions (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  views        INT  NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Doubles as the lookup index for the feed build's NOT EXISTS join.
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_impressions_select" ON post_impressions;
CREATE POLICY "post_impressions_select" ON post_impressions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "post_impressions_insert" ON post_impressions;
CREATE POLICY "post_impressions_insert" ON post_impressions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_impressions_update" ON post_impressions;
CREATE POLICY "post_impressions_update" ON post_impressions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Batch-record a flush of viewed post ids for the calling user.
--
-- SELECT DISTINCT is load-bearing, not tidiness: ON CONFLICT DO UPDATE raises
-- "cannot affect row a second time" if the same id appears twice in one
-- statement, and the client buffer can legitimately hold a duplicate when a
-- post re-enters the viewport during a flush window.
--
-- The 5-minute WHERE guard is also load-bearing. Without it, scrolling up and
-- down over one post inflates it to "seen three times" in seconds and filters
-- out content the user barely glanced at. A skipped update is a no-op, not an
-- error.
CREATE OR REPLACE FUNCTION record_impressions(p_post_ids UUID[])
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO post_impressions (user_id, post_id)
  SELECT DISTINCT auth.uid(), pid
    FROM unnest(p_post_ids) AS pid
   WHERE auth.uid() IS NOT NULL
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET views        = post_impressions.views + 1,
        last_seen_at = NOW()
    WHERE post_impressions.last_seen_at < NOW() - INTERVAL '5 minutes';
$$;

-- Housekeeping for the feed's viewer-scoped tables. Hourly is plenty — nothing
-- breaks if a prune is missed, it just uses more disk.
CREATE OR REPLACE FUNCTION prune_feed_data()
RETURNS void AS $$
BEGIN
  DELETE FROM post_impressions WHERE last_seen_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-feed-data');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('prune-feed-data', '7 * * * *', $$SELECT prune_feed_data()$$);
