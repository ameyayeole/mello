-- ─────────────────────────────────────────────────────────────────────────────
-- 027: LIVE ACTIVITY FEED  (Explore → "Live" tab — the app's present tense)
--   Discover / 🔥 Hot list *future plans*; this narrates what's happening *now*.
--
--   activity_feed() returns a stream of heterogeneous "moment" rows the Live tab
--   renders. One RPC UNION-ALLs three moment kinds out of tables that already
--   exist — no new writes anywhere:
--     • live_now      — an event in progress (starts_at ≤ now < ends_at)
--     • event_boosted — an event currently boosted (026's boosted_until)
--     • event_joined  — recent approved joins on an upcoming/live event,
--                       aggregated per event ("Kabir + 2 others just joined")
--
--   Filtering mirrors explore_feed (026): women_only + blocks, keyed off the
--   p_user_id viewer (not auth.uid()), so the two feeds behave identically.
--   Ordered by each moment's own timestamp (sort_ts) so the newest thing that
--   happened is on top. Paginated like explore_feed.
--
--   Photo-drop moments ('event_photos') are intentionally NOT here yet — they
--   land when the event-recap table ships; add a fourth UNION branch then.
--
-- Run this whole file in the Supabase SQL editor (after 026).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS activity_feed(UUID, FLOAT, FLOAT, INT, INT);

CREATE FUNCTION activity_feed(
  p_user_id UUID,
  user_lat  FLOAT DEFAULT NULL,
  user_lng  FLOAT DEFAULT NULL,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS TABLE (
  moment_id         TEXT,
  kind              TEXT,
  sort_ts           TIMESTAMPTZ,
  event_id          UUID,
  title             TEXT,
  activity          activity_type,
  image_url         TEXT,
  location_name     TEXT,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  distance_m        FLOAT,
  host_id           UUID,
  host_name         TEXT,
  host_photo_url    TEXT,
  host_verified     BOOLEAN,
  actor_id          UUID,
  actor_name        TEXT,
  actor_photo_url   TEXT,
  participant_count INT,
  friends_count     INT,
  extra_count       INT,
  is_boosted        BOOLEAN
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  friend_ids       UUID[];
  viewer_is_female BOOLEAN;
BEGIN
  SELECT (p.gender = 'female') INTO viewer_is_female
    FROM profiles p WHERE p.id = p_user_id;
  viewer_is_female := COALESCE(viewer_is_female, FALSE);

  SELECT array_agg(
           CASE WHEN f.requester_id = p_user_id THEN f.addressee_id
                ELSE f.requester_id END)
    INTO friend_ids
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id);
  friend_ids := COALESCE(friend_ids, ARRAY[]::UUID[]);

  RETURN QUERY
  -- Visible = active, public, not-yet-ended events the viewer is allowed to see.
  WITH vis AS (
    SELECT
      e.id, e.host_id, e.activity, e.title, e.image_url, e.location_name,
      e.starts_at, e.ends_at,
      CASE WHEN user_lat IS NULL OR user_lng IS NULL THEN NULL
           ELSE ST_Distance(e.location, ST_MakePoint(user_lng, user_lat)::geography)
      END AS dist_m,
      (e.boosted_until IS NOT NULL AND e.boosted_until > NOW()) AS boosted_now,
      e.boosted_until
    FROM events e
    WHERE e.is_active = TRUE
      AND e.is_public = TRUE
      AND (e.ends_at IS NULL OR e.ends_at > NOW())
      AND (e.women_only = FALSE OR e.host_id = p_user_id OR viewer_is_female)
      AND NOT EXISTS (
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id = p_user_id AND bl.blocked_id = e.host_id)
           OR (bl.blocker_id = e.host_id AND bl.blocked_id = p_user_id)
      )
  ),
  -- Full "going" count + how many of those are the viewer's friends, per event.
  counts AS (
    SELECT
      ep.event_id,
      COUNT(*) FILTER (WHERE ep.status = 'approved')::INT AS p_count,
      COUNT(*) FILTER (WHERE ep.status = 'approved'
                         AND ep.user_id = ANY(friend_ids))::INT AS f_count
    FROM event_participants ep
    GROUP BY ep.event_id
  ),
  -- ── live_now ───────────────────────────────────────────────────────────────
  live AS (
    SELECT
      'live:' || v.id::text AS moment_id, 'live_now' AS kind,
      v.starts_at AS sort_ts,
      v.id, v.title, v.activity, v.image_url, v.location_name,
      v.starts_at, v.ends_at, v.dist_m,
      v.host_id, hp.name, COALESCE(hp.photos[1], hp.photo_url),
      (hp.kyc_status = 'approved'),
      NULL::UUID, NULL::TEXT, NULL::TEXT,
      COALESCE(c.p_count, 0), COALESCE(c.f_count, 0), 0, v.boosted_now
    FROM vis v
    JOIN profiles hp ON hp.id = v.host_id
    LEFT JOIN counts c ON c.event_id = v.id
    WHERE v.starts_at <= NOW()
  ),
  -- ── event_boosted ──────────────────────────────────────────────────────────
  -- No boost timestamp is stored, so approximate "when it went hot" as
  -- boosted_until − 24h (the boost window from 026).
  boosted AS (
    SELECT
      'boost:' || v.id::text, 'event_boosted',
      v.boosted_until - INTERVAL '24 hours' AS sort_ts,
      v.id, v.title, v.activity, v.image_url, v.location_name,
      v.starts_at, v.ends_at, v.dist_m,
      v.host_id, hp.name, COALESCE(hp.photos[1], hp.photo_url),
      (hp.kyc_status = 'approved'),
      NULL::UUID, NULL::TEXT, NULL::TEXT,
      COALESCE(c.p_count, 0), COALESCE(c.f_count, 0), 0, TRUE
    FROM vis v
    JOIN profiles hp ON hp.id = v.host_id
    LEFT JOIN counts c ON c.event_id = v.id
    WHERE v.boosted_now = TRUE
  ),
  -- ── event_joined ───────────────────────────────────────────────────────────
  -- Recent approved joins in the last 48h, aggregated per event. Actor = most
  -- recent joiner; extra_count = "+N others" behind them. Host's own row skipped.
  joins AS (
    SELECT
      'join:' || v.id::text, 'event_joined',
      MAX(ep.joined_at) AS sort_ts,
      v.id, v.title, v.activity, v.image_url, v.location_name,
      v.starts_at, v.ends_at, v.dist_m,
      v.host_id, hp.name, COALESCE(hp.photos[1], hp.photo_url),
      (hp.kyc_status = 'approved'),
      (array_agg(ap.id           ORDER BY ep.joined_at DESC))[1],
      (array_agg(ap.name         ORDER BY ep.joined_at DESC))[1],
      (array_agg(COALESCE(ap.photos[1], ap.photo_url)
                                 ORDER BY ep.joined_at DESC))[1],
      COALESCE(c.p_count, 0),
      COUNT(*) FILTER (WHERE ep.user_id = ANY(friend_ids))::INT,
      GREATEST(COUNT(*)::INT - 1, 0),
      v.boosted_now
    FROM vis v
    JOIN event_participants ep
      ON ep.event_id = v.id
     AND ep.status = 'approved'
     AND ep.joined_at > NOW() - INTERVAL '48 hours'
     AND ep.user_id <> v.host_id
    JOIN profiles ap ON ap.id = ep.user_id
    JOIN profiles hp ON hp.id = v.host_id
    LEFT JOIN counts c ON c.event_id = v.id
    GROUP BY
      v.id, v.title, v.activity, v.image_url, v.location_name,
      v.starts_at, v.ends_at, v.dist_m, v.host_id,
      hp.name, hp.photos, hp.photo_url, hp.kyc_status, c.p_count, v.boosted_now
  )
  SELECT * FROM (
    SELECT * FROM live
    UNION ALL SELECT * FROM boosted
    UNION ALL SELECT * FROM joins
  ) all_moments
  ORDER BY sort_ts DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
