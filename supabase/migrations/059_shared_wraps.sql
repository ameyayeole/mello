-- ─────────────────────────────────────────────────────────────────────────────
-- SHARED WRAPS. A shared_wrap post references an event's wrap (ref_wrap_event_id)
-- and copies no media. Only the event's host/approved attendees may create one
-- (is_event_attendee, migration 032), enforced by tightening posts_insert. The
-- card preview comes from get_wrap_card — get_explore_wraps' shape for one event,
-- without the public/recency gates (the post's own RLS already gates who sees it).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- A shared_wrap must point at an event.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_shared_wrap_has_ref;
ALTER TABLE posts ADD CONSTRAINT posts_shared_wrap_has_ref
  CHECK (type <> 'shared_wrap' OR ref_wrap_event_id IS NOT NULL);

-- INSERT: your own post, and — for a shared_wrap — only if you attended the event.
DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      type <> 'shared_wrap'
      OR is_event_attendee(ref_wrap_event_id, auth.uid())
    )
  );

-- One event's wrap preview (title + top 6 photos), for rendering a shared_wrap
-- card. Same columns as get_explore_wraps; no public/recency gate (by event id).
CREATE OR REPLACE FUNCTION get_wrap_card(p_event_id UUID)
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
  WHERE e.id = p_event_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_wrap_card(UUID) TO authenticated;
