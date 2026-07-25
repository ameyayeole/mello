-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS: a top-level comment notifies the post author
-- ('post_commented', coalesced per post); a reply notifies the parent comment's
-- author ('comment_reply', coalesced per parent comment). Same coalescing shape
-- as on_post_like (046), extracted here into a reusable helper. Never notify your
-- own action. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_commented';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_reply';

-- Reusable coalescer: bump the most recent unread, in-window row for
-- (recipient, subject, type), else insert a fresh one. subject_key names the
-- payload field holding the subject id ('post_id' or 'parent_id'). The first
-- INSERT fires push_notification_fanout once; later UPD, bumps stay silent.
CREATE OR REPLACE FUNCTION coalesce_notification(
  p_recipient   UUID,
  p_actor       UUID,
  p_type        notification_type,
  p_subject_key TEXT,
  p_subject_id  UUID
) RETURNS VOID AS $$
DECLARE
  v_actor    TEXT;
  v_existing RECORD;
  v_window   INTERVAL := INTERVAL '24 hours';
BEGIN
  IF p_recipient IS NULL OR p_recipient = p_actor THEN RETURN; END IF;
  SELECT name INTO v_actor FROM profiles WHERE id = p_actor;

  SELECT * INTO v_existing FROM notifications
  WHERE recipient_id = p_recipient AND type = p_type
    AND (payload->>p_subject_key)::uuid = p_subject_id
    AND is_read = FALSE AND created_at > NOW() - v_window
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE notifications
    SET sender_id = p_actor,
        payload = jsonb_set(
          jsonb_set(v_existing.payload, '{count}',
            to_jsonb(COALESCE((v_existing.payload->>'count')::int, 1) + 1)),
          '{actors}',
          (SELECT jsonb_agg(a) FROM (
             SELECT a FROM jsonb_array_elements(
               to_jsonb(v_actor) || COALESCE(v_existing.payload->'actors','[]'::jsonb)
             ) WITH ORDINALITY AS t(a, ord) ORDER BY ord LIMIT 3) capped)),
        created_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO notifications (recipient_id, sender_id, type, payload)
    VALUES (p_recipient, p_actor, p_type,
            jsonb_build_object(p_subject_key, p_subject_id, 'count', 1,
                               'actors', jsonb_build_array(v_actor)));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION on_post_comment_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_post_author   UUID;
  v_parent_author UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
    PERFORM coalesce_notification(v_post_author, NEW.author_id,
              'post_commented', 'post_id', NEW.post_id);
  ELSE
    SELECT author_id INTO v_parent_author FROM post_comments WHERE id = NEW.parent_id;
    PERFORM coalesce_notification(v_parent_author, NEW.author_id,
              'comment_reply', 'parent_id', NEW.parent_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_comment_notify ON post_comments;
CREATE TRIGGER on_post_comment_notify
  AFTER INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION on_post_comment_notify();
