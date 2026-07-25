-- ─────────────────────────────────────────────────────────────────────────────
-- POST SCORING + AUTO-HIDE. posts.score is the viewer-INDEPENDENT ranking base
-- (freshness + distinct-user engagement velocity), refreshed by pg_cron so a
-- scroll session's order is frozen (the reshuffle bug 010 fixed). Friend/same-
-- city boosts are per-viewer and live in community_feed (062), not here. A
-- reports INSERT auto-hides a post at >=3 DISTINCT reporters. Run whole file.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    score = sub.s,
    hot_since = CASE
      WHEN p.hot_since IS NULL AND sub.engagers > 0 THEN NOW()
      ELSE p.hot_since
    END
  FROM (
    SELECT
      p2.id,
      p2.engagers,
      -- freshness: decays over ~2 days; + velocity: distinct engagers, damped.
      6.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (NOW() - p2.created_at)) / 172800.0, -700.0))
      + 10.0 * ln(1 + p2.engagers) AS s
    FROM (
      SELECT
        po.id,
        po.created_at,
        (
          SELECT COUNT(DISTINCT u) FROM (
            SELECT pl.user_id AS u FROM post_likes pl
              WHERE pl.post_id = po.id AND pl.created_at > NOW() - INTERVAL '48 hours'
            UNION
            SELECT pc.author_id AS u FROM post_comments pc
              WHERE pc.post_id = po.id AND pc.created_at > NOW() - INTERVAL '48 hours'
                AND pc.deleted_at IS NULL
          ) e
        ) AS engagers
      FROM posts po
      WHERE po.hidden = FALSE AND po.created_at > NOW() - INTERVAL '30 days'
    ) p2
  ) sub
  WHERE p.id = sub.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-post-scores');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-post-scores',
  '*/10 * * * *',
  $$SELECT refresh_post_scores()$$
);

-- Auto-hide a post once >=3 DISTINCT users report it (pending human review).
CREATE OR REPLACE FUNCTION on_post_report()
RETURNS TRIGGER AS $$
DECLARE
  v_distinct INT;
BEGIN
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(DISTINCT reporter_id) INTO v_distinct
  FROM reports WHERE post_id = NEW.post_id;
  IF v_distinct >= 3 THEN
    UPDATE posts SET hidden = TRUE, hidden_reason = 'auto_reports'
    WHERE id = NEW.post_id AND hidden = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_report ON reports;
CREATE TRIGGER on_post_report
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION on_post_report();
