-- ─────────────────────────────────────────────────────────────────────────────
-- POST SCORING v2. Adds posts.engagement — the normalised 0–1 engagement
-- sub-score that the v2 feed ranker (066) weights at 20 of ~110.
--
-- Two changes to what counts as engagement:
--   • poll votes count. They never did, so a poll with 40 votes and no likes
--     scored as dead.
--   • commenters count twice. A comment is a stronger signal than a tap.
--
-- refresh_post_scores keeps writing the OLD composite into posts.score as well,
-- because community_feed (062) is still live and adds +100/+50 to it. Swapping
-- that column to a 0–1 scale would collapse the current feed into pure tier
-- order. 067 drops posts.score once nothing reads it.
--
-- Note: This version drops the hot_since write from 061. hot_since is dead code
-- (written by every version but read by nothing) and will be removed entirely in
-- 067; we stop maintaining it here to simplify the rollout.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS engagement FLOAT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    -- Old composite: freshness + velocity. Still read by community_feed (062).
    score = 6.0 * exp(GREATEST(
              -EXTRACT(EPOCH FROM (NOW() - sub.created_at)) / 172800.0, -700.0))
            + 10.0 * ln(1 + sub.raw),
    -- New: normalised to 0–1. ln(26) saturates at 25 weighted engagers, which
    -- is generous at Mello's volume. LEAST clamps anything above that.
    engagement = LEAST(ln(1 + sub.raw) / ln(26.0), 1.0)
  FROM (
    SELECT
      po.id,
      po.created_at,
      (
        -- distinct engagers (like OR vote OR comment) …
        (SELECT COUNT(DISTINCT u) FROM (
           SELECT pl.user_id AS u FROM post_likes pl
             WHERE pl.post_id = po.id
               AND pl.created_at > NOW() - INTERVAL '48 hours'
           UNION
           SELECT pv.user_id FROM poll_votes pv
             WHERE pv.poll_id = po.id
               AND pv.created_at > NOW() - INTERVAL '48 hours'
           UNION
           SELECT pc.author_id FROM post_comments pc
             WHERE pc.post_id = po.id
               AND pc.deleted_at IS NULL
               AND pc.created_at > NOW() - INTERVAL '48 hours'
         ) e)
        -- … plus distinct commenters again, so a comment is worth two.
        + (SELECT COUNT(DISTINCT pc2.author_id) FROM post_comments pc2
             WHERE pc2.post_id = po.id
               AND pc2.deleted_at IS NULL
               AND pc2.created_at > NOW() - INTERVAL '48 hours')
      )::FLOAT AS raw
    FROM posts po
    WHERE po.hidden = FALSE
      AND po.created_at > NOW() - INTERVAL '30 days'
  ) sub
  WHERE p.id = sub.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Populate immediately rather than waiting up to 10 minutes for the cron.
SELECT refresh_post_scores();
