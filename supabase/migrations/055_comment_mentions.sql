-- ─────────────────────────────────────────────────────────────────────────────
-- MENTIONS in comments. A BEFORE trigger resolves @username tokens in the body
-- into post_comments.mentions (any real profile, excluding self — the composer
-- steers who; no visibility gate for MVP). The AFTER-INSERT notify trigger fans
-- out a non-coalesced 'comment_mention' per mentioned id and SUPPRESSES the
-- post_commented/comment_reply that recipient would otherwise get (mention wins,
-- like chat). Both read RPCs also return author_username. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_mention';

-- Resolve @username → profile ids into NEW.mentions on write. Tombstone UPDATEs
-- (deleted_at set, body blanked) resolve to '{}' naturally. Excludes the author.
CREATE OR REPLACE FUNCTION resolve_comment_mentions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mentions := COALESCE((
    SELECT array_agg(DISTINCT p.id)
    FROM (
      SELECT DISTINCT lower(m[1]) AS uname
      FROM regexp_matches(NEW.body, '@([a-zA-Z0-9._]+)', 'g') m
    ) t
    JOIN profiles p ON lower(p.username) = t.uname
    WHERE p.id <> NEW.author_id
  ), '{}');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS resolve_comment_mentions ON post_comments;
CREATE TRIGGER resolve_comment_mentions
  BEFORE INSERT OR UPDATE OF body ON post_comments
  FOR EACH ROW EXECUTE FUNCTION resolve_comment_mentions();

-- Notify: mentions first (each mentioned id, excluding self), then the
-- reply/comment notif ONLY if that recipient wasn't just mentioned.
CREATE OR REPLACE FUNCTION on_post_comment_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_post_author   UUID;
  v_parent_author UUID;
  v_mention       UUID;
BEGIN
  -- comment_mention: one row per mentioned user (not coalesced).
  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_mention IN ARRAY NEW.mentions LOOP
      IF v_mention <> NEW.author_id THEN
        INSERT INTO notifications (recipient_id, sender_id, type, payload)
        VALUES (v_mention, NEW.author_id, 'comment_mention',
                jsonb_build_object('post_id', NEW.post_id,
                                   'comment_id', NEW.id));
      END IF;
    END LOOP;
  END IF;

  IF NEW.parent_id IS NULL THEN
    SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
    IF NOT (v_post_author = ANY(COALESCE(NEW.mentions, '{}'))) THEN
      PERFORM coalesce_notification(v_post_author, NEW.author_id,
                'post_commented', 'post_id', NEW.post_id);
    END IF;
  ELSE
    SELECT author_id INTO v_parent_author FROM post_comments WHERE id = NEW.parent_id;
    IF NOT (v_parent_author = ANY(COALESCE(NEW.mentions, '{}'))) THEN
      PERFORM coalesce_notification(v_parent_author, NEW.author_id,
                'comment_reply', 'parent_id', NEW.parent_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read RPCs v3: add author_username (for lowercase reply prefill + mentionables).
DROP FUNCTION IF EXISTS post_comments_ranked(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION post_comments_ranked(
  p_post_id   UUID,
  p_viewer_id UUID,
  p_limit     INT DEFAULT 100
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_username TEXT,
  author_photo_url TEXT, body TEXT, mentions UUID[], like_count INT,
  reply_count BIGINT, deleted BOOLEAN, liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH post_author AS (SELECT author_id FROM posts WHERE id = p_post_id)
  SELECT
    c.id, c.author_id, pr.name, pr.username, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count,
    (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) AS reply_count,
    (c.deleted_at IS NOT NULL) AS deleted,
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.post_id = p_post_id AND c.parent_id IS NULL
  ORDER BY
    c.like_count
    + (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) * 2
    + CASE WHEN c.author_id = (SELECT author_id FROM post_author) THEN 5 ELSE 0 END
    + CASE WHEN EXISTS (
        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
          AND ((f.requester_id = p_viewer_id AND f.addressee_id = c.author_id)
            OR (f.addressee_id = p_viewer_id AND f.requester_id = c.author_id))
      ) THEN 3 ELSE 0 END DESC,
    c.created_at DESC
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS post_comment_replies(UUID, UUID);
CREATE OR REPLACE FUNCTION post_comment_replies(
  p_parent_id UUID,
  p_viewer_id UUID
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_username TEXT,
  author_photo_url TEXT, body TEXT, mentions UUID[], like_count INT,
  deleted BOOLEAN, liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.author_id, pr.name, pr.username, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count, (c.deleted_at IS NOT NULL),
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.parent_id = p_parent_id
  ORDER BY c.created_at ASC;
$$;
