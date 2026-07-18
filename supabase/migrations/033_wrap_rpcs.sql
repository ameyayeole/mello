-- ─────────────────────────────────────────────────────────────────────────────
-- 033: POST-EVENT WRAP RPCs
-- Read paths that must cross RLS lines on purpose:
--   • get_explore_wraps / get_public_wrap — the public top-6 photo showcase
--     (event_photos itself stays attendee-only)
--   • get_wrap_summary — attendee recap incl. anonymous superlative winners
--   • get_event_feedback — host-only anonymous feedback aggregate
-- Run this whole file in the Supabase SQL editor, AFTER 032.
-- ─────────────────────────────────────────────────────────────────────────────

-- Wraps eligible for Explore: public events that ended within the last
-- 14 days and collected at least 3 visible photos.
CREATE OR REPLACE FUNCTION get_explore_wraps(p_limit INT DEFAULT 4, p_offset INT DEFAULT 0)
RETURNS TABLE (
  event_id      UUID,
  title         TEXT,
  activity      activity_type,
  location_name TEXT,
  ended_at      TIMESTAMPTZ,
  photo_count   BIGINT,
  top_photos    JSONB
) AS $$
  SELECT
    e.id,
    e.title,
    e.activity,
    e.location_name,
    COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours') AS ended_at,
    (SELECT COUNT(*) FROM event_photos p
      WHERE p.event_id = e.id AND p.hidden = FALSE) AS photo_count,
    (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT p.id, p.url, p.like_count
        FROM event_photos p
        WHERE p.event_id = e.id AND p.hidden = FALSE
        ORDER BY p.like_count DESC, p.created_at ASC
        LIMIT 6
      ) t) AS top_photos
  FROM events e
  WHERE e.is_public = TRUE
    AND COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours')
        BETWEEN NOW() - INTERVAL '14 days' AND NOW()
    AND (SELECT COUNT(*) FROM event_photos p
          WHERE p.event_id = e.id AND p.hidden = FALSE) >= 3
  ORDER BY ended_at DESC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_explore_wraps(INT, INT) TO authenticated;

-- Public read-only gallery for one wrapped event (same eligibility rules).
CREATE OR REPLACE FUNCTION get_public_wrap(p_event_id UUID)
RETURNS TABLE (
  event_id           UUID,
  title              TEXT,
  activity           activity_type,
  location_name      TEXT,
  ended_at           TIMESTAMPTZ,
  photo_id           UUID,
  url                TEXT,
  caption            TEXT,
  like_count         INT,
  uploader_id        UUID,
  uploader_name      TEXT,
  uploader_photo_url TEXT
) AS $$
  SELECT
    e.id,
    e.title,
    e.activity,
    e.location_name,
    COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours'),
    p.id,
    p.url,
    p.caption,
    p.like_count,
    p.uploader_id,
    pr.name,
    pr.photo_url
  FROM events e
  JOIN event_photos p ON p.event_id = e.id AND p.hidden = FALSE
  JOIN profiles pr ON pr.id = p.uploader_id
  WHERE e.id = p_event_id
    AND e.is_public = TRUE
    AND COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours')
        BETWEEN NOW() - INTERVAL '14 days' AND NOW()
  ORDER BY p.like_count DESC, p.created_at ASC
  LIMIT 6;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_public_wrap(UUID) TO authenticated;

-- Recap for attendees: totals, superlative winners (3+ votes per category),
-- and how many thumbs-up the caller received here (count only, never who).
CREATE OR REPLACE FUNCTION get_wrap_summary(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_event_attendee(p_event_id, auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'attendeeCount', (
      SELECT COUNT(DISTINCT r.uid) FROM (
        SELECT ep.user_id AS uid FROM event_participants ep
        WHERE ep.event_id = p_event_id AND ep.status = 'approved'
        UNION
        SELECT e.host_id FROM events e WHERE e.id = p_event_id
      ) r
    ),
    'photoCount', (
      SELECT COUNT(*) FROM event_photos p
      WHERE p.event_id = p_event_id AND p.hidden = FALSE
    ),
    'likeCount', (
      SELECT COALESCE(SUM(p.like_count), 0) FROM event_photos p
      WHERE p.event_id = p_event_id AND p.hidden = FALSE
    ),
    'commentCount', (
      SELECT COUNT(*) FROM wrap_photo_comments c
      JOIN event_photos p ON p.id = c.photo_id
      WHERE p.event_id = p_event_id AND p.hidden = FALSE
    ),
    'messageCount', (
      SELECT COUNT(*) FROM messages m
      WHERE m.event_id = p_event_id AND m.type <> 'system'
    ),
    'myThumbsReceived', (
      SELECT COUNT(*) FROM event_ratings r
      WHERE r.event_id = p_event_id
        AND r.ratee_id = auth.uid()
        AND r.rating = 'up'
    ),
    'superlatives', (
      SELECT COALESCE(jsonb_agg(w), '[]'::jsonb) FROM (
        SELECT
          v.category,
          COUNT(*) AS votes,
          CASE WHEN COUNT(*) >= 3 THEN winner.votee_id END AS winner_id,
          CASE WHEN COUNT(*) >= 3 THEN pr.name END AS winner_name,
          CASE WHEN COUNT(*) >= 3 THEN pr.photo_url END AS winner_photo_url
        FROM superlative_votes v
        JOIN LATERAL (
          SELECT sv.votee_id
          FROM superlative_votes sv
          WHERE sv.event_id = v.event_id AND sv.category = v.category
          GROUP BY sv.votee_id
          ORDER BY COUNT(*) DESC, MIN(sv.created_at) ASC
          LIMIT 1
        ) winner ON TRUE
        LEFT JOIN profiles pr ON pr.id = winner.votee_id
        WHERE v.event_id = p_event_id
        GROUP BY v.category, winner.votee_id, pr.name, pr.photo_url
      ) w
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_wrap_summary(UUID) TO authenticated;

-- Host-only anonymous feedback aggregate.
CREATE OR REPLACE FUNCTION get_event_feedback(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  IF auth.uid() <> (SELECT host_id FROM events WHERE id = p_event_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'upCount',   COUNT(*) FILTER (WHERE f.rating = 'up'),
    'downCount', COUNT(*) FILTER (WHERE f.rating = 'down'),
    'notes', COALESCE(
      jsonb_agg(f.note ORDER BY f.created_at)
        FILTER (WHERE f.note IS NOT NULL AND f.note <> ''),
      '[]'::jsonb
    )
  ) INTO result
  FROM event_feedback f
  WHERE f.event_id = p_event_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_event_feedback(UUID) TO authenticated;
